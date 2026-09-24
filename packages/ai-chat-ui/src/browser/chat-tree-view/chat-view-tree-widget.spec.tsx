// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import 'reflect-metadata';

import { expect } from 'chai';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { OpenerService } from '@theia/core/lib/browser';
import { MarkdownRender } from '../chat-response-renderer/markdown-part-renderer';
import { BLOCKED_RESOURCE_CLASS } from '../chat-response-renderer/block-external-resources';
import { ChatRequestRender, RequestNode, ChatViewTreeWidget } from './chat-view-tree-widget';
import { MutableChatModel } from '@theia/ai-chat';

disableJSDOM();

describe('chat-view-tree-widget resource blocking policy', () => {
    let container: HTMLElement;
    let root: Root;
    const openerService: OpenerService = {
        getOpener: async () => ({ open: async () => undefined }),
        getOpeners: async () => [],
        open: async () => undefined
    } as unknown as OpenerService;

    const externalImageMarkdown = '![](https://evil.com/x.gif)';
    const inlineIframeMarkdown = '<iframe srcdoc="&lt;p&gt;hi&lt;/p&gt;"></iframe>';

    const createRequestNode = (markdown: string): RequestNode => ({
        request: {
            message: { parts: [{ text: markdown }] },
            context: { variables: [] }
        },
        branch: { items: [] }
    } as unknown as RequestNode);

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        root.unmount();
        document.body.removeChild(container);
    });

    it('renders external resources directly for user requests', done => {
        root.render(
            <ChatRequestRender
                node={createRequestNode(externalImageMarkdown)}
                hoverService={{} as never}
                chatAgentService={{} as never}
                variableService={{} as never}
                openerService={openerService}
                provideChatInputWidget={() => undefined}
            />
        );

        setTimeout(() => {
            expect(container.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.be.null;
            expect(container.querySelector('img')?.getAttribute('src')).to.equal('https://evil.com/x.gif');
            done();
        }, 50);
    });

    it('still blocks active embedded content for user requests', done => {
        root.render(
            <ChatRequestRender
                node={createRequestNode(inlineIframeMarkdown)}
                hoverService={{} as never}
                chatAgentService={{} as never}
                variableService={{} as never}
                openerService={openerService}
                provideChatInputWidget={() => undefined}
            />
        );

        setTimeout(() => {
            expect(container.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.exist;
            expect(container.querySelector('iframe')).to.be.null;
            done();
        }, 50);
    });

    it('blocks external resources for assistant responses', done => {
        root.render(<MarkdownRender text={externalImageMarkdown} openerService={openerService} />);

        setTimeout(() => {
            expect(container.querySelector(`.${BLOCKED_RESOURCE_CLASS}`)).to.exist;
            expect(container.querySelector('img')).to.be.null;
            done();
        }, 50);
    });
});

class TestChatViewTreeWidget extends ChatViewTreeWidget {
    public testHandleRangeChanged(startIndex: number, endIndex: number): void {
        this.handleRangeChanged({ startIndex, endIndex });
    }
    public testHandleAtBottomStateChange(atBottom: boolean): void {
        this.handleAtBottomStateChange(atBottom);
    }
    public testHandleScrollToBottomButtonClick(): void {
        this.handleScrollToBottomButtonClick();
    }
    public testGetInitialTopMostItemIndex(rowCount: number): unknown {
        return this.getInitialTopMostItemIndex(rowCount);
    }
    public get showScrollButton(): boolean {
        return this._showScrollButton;
    }
    public get isAtBottom(): boolean {
        return this.atBottom;
    }
    public get currentTopVisibleRowIndex(): number {
        return this.topVisibleRowIndex;
    }
    public get restoredIndex(): number | undefined {
        return this.restoredTopVisibleRowIndex;
    }
    public get currentScrollToRow(): number | undefined {
        return this.scrollToRow;
    }
    public testHandleScrollerRef(element: HTMLElement | null): void {
        this.handleScrollerRef(element);
    }
    public get currentScrollTopVal(): number | undefined {
        return this.currentScrollTop;
    }
    public get restoredScrollTopVal(): number | undefined {
        return this.restoredScrollTop;
    }
    public override update(): void {
        // no-op in tests
    }
}

describe('ChatViewTreeWidget scroll preservation', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let widget: TestChatViewTreeWidget;

    beforeEach(() => {
        widget = new TestChatViewTreeWidget(
            {} as never,
            { root: undefined, refresh: () => {}, onChanged: () => ({ dispose: () => {} }) } as never,
            {} as never
        );
    });

    it('tracks top visible row index when range changes', () => {
        const model1 = new MutableChatModel();
        widget.trackChatModel(model1);

        widget.testHandleRangeChanged(5, 10);
        expect(widget.currentTopVisibleRowIndex).to.equal(5);
        expect(widget.getScrollState().topVisibleRowIndex).to.equal(5);
    });

    it('updates at-bottom and scroll button state when scrolling away from bottom', () => {
        const model1 = new MutableChatModel();
        widget.trackChatModel(model1);

        expect(widget.isAtBottom).to.be.true;
        expect(widget.showScrollButton).to.be.false;

        widget.testHandleAtBottomStateChange(false);
        expect(widget.isAtBottom).to.be.false;
        expect(widget.showScrollButton).to.be.true;

        widget.testHandleAtBottomStateChange(true);
        expect(widget.isAtBottom).to.be.true;
        expect(widget.showScrollButton).to.be.false;
    });

    it('preserves and restores scroll position when switching sessions', () => {
        const model1 = new MutableChatModel();
        const model2 = new MutableChatModel();

        widget.trackChatModel(model1);
        widget.testHandleRangeChanged(7, 12);
        widget.testHandleAtBottomStateChange(false);

        // Switch to model 2
        widget.trackChatModel(model2);
        // Model 2 starts at bottom by default
        expect(widget.isAtBottom).to.be.true;
        expect(widget.showScrollButton).to.be.false;
        expect(widget.shouldScrollToEnd).to.be.true;
        expect(widget.restoredIndex).to.be.undefined;

        // Switch back to model 1
        widget.trackChatModel(model1);
        // Model 1 restored previous position
        expect(widget.isAtBottom).to.be.false;
        expect(widget.showScrollButton).to.be.true;
        expect(widget.shouldScrollToEnd).to.be.false;
        expect(widget.restoredIndex).to.equal(7);
        expect(widget.currentTopVisibleRowIndex).to.equal(7);
    });

    it('resets scroll position and button when clicking scroll-to-bottom', () => {
        const model1 = new MutableChatModel();
        widget.trackChatModel(model1);

        widget.testHandleRangeChanged(4, 9);
        widget.testHandleAtBottomStateChange(false);
        expect(widget.isAtBottom).to.be.false;
        expect(widget.showScrollButton).to.be.true;

        widget.testHandleScrollToBottomButtonClick();
        expect(widget.isAtBottom).to.be.true;
        expect(widget.showScrollButton).to.be.false;
        expect(widget.restoredIndex).to.be.undefined;
    });

    it('computes correct initialTopMostItemIndex for locked vs unlocked states', () => {
        const model1 = new MutableChatModel();
        widget.trackChatModel(model1);

        // When shouldScrollToEnd is true: points to last item with align 'end'
        expect(widget.testGetInitialTopMostItemIndex(10)).to.deep.equal({ index: 9, align: 'end' });

        // When auto-scroll is locked and restoredIndex is set
        widget.shouldScrollToEnd = false;
        widget.testHandleRangeChanged(3, 8);
        expect(widget.testGetInitialTopMostItemIndex(10)).to.deep.equal({ index: 3, align: 'start' });

        // Clamps if restored index exceeds row count
        widget.testHandleRangeChanged(15, 20);
        expect(widget.testGetInitialTopMostItemIndex(10)).to.deep.equal({ index: 9, align: 'start' });

        // Returns undefined for empty list
        expect(widget.testGetInitialTopMostItemIndex(0)).to.be.undefined;
    });

    it('deletes session scroll state when requested', () => {
        const model1 = new MutableChatModel();
        const model2 = new MutableChatModel();

        widget.trackChatModel(model1);
        widget.testHandleRangeChanged(5, 10);
        widget.testHandleAtBottomStateChange(false);

        // Switch to model 2
        widget.trackChatModel(model2);

        // Delete model 1 state
        widget.deleteSessionScrollState(model1.id);

        // Switch back to model 1 - should default to bottom
        widget.trackChatModel(model1);
        expect(widget.isAtBottom).to.be.true;
        expect(widget.showScrollButton).to.be.false;
        expect(widget.restoredIndex).to.be.undefined;
    });

    it('updates scroll position on subsequent scrolls and preserves the latest offset across multiple session switches', () => {
        const model1 = new MutableChatModel();
        const model2 = new MutableChatModel();

        const scroller = document.createElement('div');
        widget.testHandleScrollerRef(scroller);

        const dispatchScroll = (scrollTop: number) => {
            scroller.scrollTop = scrollTop;
            const event = scroller.ownerDocument.createEvent('Event');
            event.initEvent('scroll', true, true);
            scroller.dispatchEvent(event);
        };

        widget.trackChatModel(model1);
        dispatchScroll(120);
        widget.testHandleAtBottomStateChange(false);

        // Switch to model 2
        widget.trackChatModel(model2);
        expect(widget.isAtBottom).to.be.true;

        // Switch back to model 1: restored to 120
        widget.trackChatModel(model1);
        expect(widget.restoredScrollTopVal).to.equal(120);

        // User scrolls further down in model 1 to 450
        dispatchScroll(450);

        // Switch to model 2 again
        widget.trackChatModel(model2);

        // Switch back to model 1: should now restore 450, NOT the original 120!
        widget.trackChatModel(model1);
        expect(widget.restoredScrollTopVal).to.equal(450);
    });
});
