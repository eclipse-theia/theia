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
import { MarkdownRender } from '../chat-response-renderer/markdown-part-renderer.js';
import { BLOCKED_RESOURCE_CLASS } from '../chat-response-renderer/block-external-resources.js';
import { ChatRequestRender, RequestNode, ChatViewTreeWidget } from './chat-view-tree-widget.js';
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
    override readonly findWidget = { setChatModel: () => {}, dismiss: () => {} } as never;
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
    public testHandleTotalListHeightChanged(height: number): void {
        this.handleTotalListHeightChanged(height);
    }
    public get currentRowOffsetVal(): number | undefined {
        return this.currentRowOffset;
    }
    public get restoredRowOffsetVal(): number | undefined {
        return this.restoredRowOffset;
    }
    public get isPendingScrollRestore(): boolean {
        return this.pendingScrollRestore;
    }
    public setPendingScrollRestoreForTest(pending: boolean): void {
        this.pendingScrollRestore = pending;
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
        const state1 = widget.getScrollState();

        // Switch to model 2
        widget.trackChatModel(model2);
        // Model 2 starts at bottom by default
        expect(widget.isAtBottom).to.be.true;
        expect(widget.showScrollButton).to.be.false;
        expect(widget.shouldScrollToEnd).to.be.true;
        expect(widget.restoredIndex).to.be.undefined;

        // Switch back to model 1 with state1
        widget.trackChatModel(model1, state1);
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

        // Includes rowOffset when restoring a sub-row offset
        widget.trackChatModel(model1, {
            topVisibleRowIndex: 4,
            rowOffset: 300,
            atBottom: false,
            locked: false,
            temporaryLocked: true
        });
        expect(widget.testGetInitialTopMostItemIndex(10)).to.deep.equal({ index: 4, align: 'start', offset: 300 });

        // Returns undefined for empty list
        expect(widget.testGetInitialTopMostItemIndex(0)).to.be.undefined;
    });

    it('ignores spurious mount-time atBottomStateChange(true) while restoring a scrolled-up session', () => {
        const model1 = new MutableChatModel();
        let lockChanges: boolean[] = [];
        widget.onScrollLockChange = locked => lockChanges.push(locked);

        // Simulate stale scrollToRow from a previous at-bottom session
        widget.trackChatModel(model1);
        widget.testHandleScrollToBottomButtonClick();
        lockChanges = [];

        // Restore a scrolled-up session
        widget.trackChatModel(model1, {
            topVisibleRowIndex: 8,
            rowOffset: 300,
            atBottom: false,
            locked: false,
            temporaryLocked: true
        });

        expect(widget.isPendingScrollRestore).to.be.true;
        expect(widget.currentScrollToRow).to.be.undefined;
        expect(widget.isAtBottom).to.be.false;
        expect(widget.showScrollButton).to.be.true;
        expect(widget.shouldScrollToEnd).to.be.false;
        expect(widget.restoredIndex).to.equal(8);
        expect(widget.restoredRowOffsetVal).to.equal(300);

        // Virtuoso fires atBottomStateChange(true) before rows are measured
        widget.testHandleAtBottomStateChange(true);

        // Must be ignored so auto-scroll is NOT re-enabled and restore is NOT undone
        expect(widget.isAtBottom).to.be.false;
        expect(widget.showScrollButton).to.be.true;
        expect(widget.shouldScrollToEnd).to.be.false;
        expect(widget.restoredIndex).to.equal(8);
        expect(widget.restoredRowOffsetVal).to.equal(300);
        expect(lockChanges).to.deep.equal([]);

        // Once restoration settles, real atBottomStateChange(true) unlocks normally
        widget.setPendingScrollRestoreForTest(false);
        widget.testHandleAtBottomStateChange(true);
        expect(widget.isAtBottom).to.be.true;
        expect(widget.showScrollButton).to.be.false;
        expect(lockChanges).to.deep.equal([false]);
    });

    it('updates scroll position on subsequent scrolls and preserves the latest offset across multiple session switches', () => {
        const model1 = new MutableChatModel();
        const model2 = new MutableChatModel();

        const scroller = document.createElement('div');
        const rowEl = document.createElement('div');
        rowEl.dataset.index = '2';
        scroller.appendChild(rowEl);

        let currentRowOffset = 0;
        scroller.getBoundingClientRect = () => ({ top: 100, bottom: 700, left: 0, right: 500, width: 500, height: 600, x: 0, y: 100, toJSON: () => ({}) });
        rowEl.getBoundingClientRect = () => ({
            top: 100 - currentRowOffset,
            bottom: 100 - currentRowOffset + 1200,
            left: 0,
            right: 500,
            width: 500,
            height: 1200,
            x: 0,
            y: 100 - currentRowOffset,
            toJSON: () => ({})
        });

        widget.testHandleScrollerRef(scroller);

        const dispatchScroll = (offset: number) => {
            currentRowOffset = offset;
            const event = scroller.ownerDocument.createEvent('Event');
            event.initEvent('scroll', true, true);
            scroller.dispatchEvent(event);
        };

        widget.trackChatModel(model1);
        dispatchScroll(120);
        widget.testHandleAtBottomStateChange(false);
        const state1 = widget.getScrollState();
        expect(state1.topVisibleRowIndex).to.equal(2);
        expect(state1.rowOffset).to.equal(120);

        // Switch to model 2
        widget.trackChatModel(model2);
        expect(widget.isAtBottom).to.be.true;

        // Switch back to model 1: restored to row 2, offset 120
        widget.trackChatModel(model1, state1);
        expect(widget.restoredIndex).to.equal(2);
        expect(widget.restoredRowOffsetVal).to.equal(120);

        // After restoration settles, user scrolls further down in model 1 to offset 450
        widget.setPendingScrollRestoreForTest(false);
        dispatchScroll(450);
        expect(widget.getScrollState().rowOffset).to.equal(450);
        const state1Updated = widget.getScrollState();

        // Switch to model 2 again
        widget.trackChatModel(model2);

        // Switch back to model 1: should now restore 450, NOT the original 120
        widget.trackChatModel(model1, state1Updated);
        expect(widget.restoredIndex).to.equal(2);
        expect(widget.restoredRowOffsetVal).to.equal(450);
    });
});
