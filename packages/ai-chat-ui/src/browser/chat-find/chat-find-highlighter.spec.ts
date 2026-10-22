// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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
import { expect } from 'chai';
import { Container, injectable } from '@theia/core/shared/inversify';
import { SimpleMonacoEditor } from '@theia/monaco/lib/browser/simple-monaco-editor';
import { CodeWrapperEditors } from '../chat-response-renderer/code-wrapper-editors';
import { ChatFindHighlighter, ChatFindHighlightRegistry } from './chat-find-highlighter';
import { ChatFindMatch, ChatFindMatcher } from './chat-find-matcher';
disableJSDOM();

class FakeRegistry implements ChatFindHighlightRegistry {
    readonly highlights = new Map<string, Range[]>();
    set(name: string, ranges: Range[]): void {
        this.highlights.set(name, ranges);
    }
    delete(name: string): void {
        this.highlights.delete(name);
    }
    texts(name: string): string[] {
        return (this.highlights.get(name) ?? []).map(range => range.toString());
    }
}

@injectable()
class TestHighlighter extends ChatFindHighlighter {
    static registry: ChatFindHighlightRegistry | undefined;
    protected override createRegistry(): ChatFindHighlightRegistry | undefined {
        return TestHighlighter.registry;
    }
}

function createHighlighter(registry: ChatFindHighlightRegistry | undefined): ChatFindHighlighter {
    TestHighlighter.registry = registry;
    const container = new Container();
    container.bind(ChatFindMatcher).toSelf().inSingletonScope();
    container.bind(TestHighlighter).toSelf();
    return container.get(TestHighlighter);
}

interface FakeDecoration { start: number, end: number, className: string }

/** A stand-in for the editor of a code part: offsets are used as columns of a single line. */
function fakeEditor(): { editor: SimpleMonacoEditor, decorations: () => FakeDecoration[], setCount: () => number } {
    let decorations: FakeDecoration[] = [];
    let sets = 0;
    const collection = {
        set: (items: { range: { startColumn: number, endColumn: number }, options: { className: string } }[]) => {
            sets++;
            decorations = items.map(item => ({ start: item.range.startColumn - 1, end: item.range.endColumn - 1, className: item.options.className }));
        },
        clear: () => { decorations = []; }
    };
    const editor = {
        document: { textEditorModel: { getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }), getVersionId: () => 1 } },
        getControl: () => ({ createDecorationsCollection: () => collection })
    } as unknown as SimpleMonacoEditor;
    return { editor, decorations: () => decorations, setCount: () => sets };
}

/** Gives an element the layout jsdom does not compute. */
function layout(element: Element, rect: { top: number, height: number }): void {
    element.getBoundingClientRect = () => ({
        top: rect.top, bottom: rect.top + rect.height, height: rect.height,
        left: 0, right: 0, width: 0, x: 0, y: rect.top, toJSON: () => ({})
    }) as DOMRect;
}

function scrollable(element: HTMLElement, scrollHeight: number, clientHeight: number): void {
    element.style.overflowY = 'auto';
    Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(element, 'clientHeight', { value: clientHeight, configurable: true });
}

describe('ChatFindHighlighter', () => {
    let root: HTMLElement;
    let registry: FakeRegistry;
    let highlighter: ChatFindHighlighter;

    const requestMatch = (occurrence: number): ChatFindMatch => ({ nodeId: 'r1', kind: ChatFindMatch.REQUEST_KIND, occurrence, start: 0, end: 7 });
    // Offsets of 'find me and find me', the text of content 1.
    const contentMatch = (contentIndex: number, occurrence: number, kind = 'markdownContent'): ChatFindMatch =>
        ({ nodeId: 'r1-response', kind, contentIndex, occurrence, start: occurrence * 12, end: occurrence * 12 + 7 });

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => {
        root = document.createElement('div');
        document.body.appendChild(root);
        root.innerHTML = `
            <div data-node-id="r1"><div class="theia-RequestNode"><p><span>find </span><span>me</span></p></div></div>
            <div data-node-id="r1-response"><div class="theia-ResponseNode">
                <div class="theia-ResponseNode-Content"><p>a tool call that would find me too</p></div>
                <div class="theia-ResponseNode-Content"><p>find <strong>me</strong> and find me</p></div>
            </div></div>`;
        registry = new FakeRegistry();
        highlighter = createHighlighter(registry);
    });

    afterEach(() => {
        highlighter.dispose();
        document.body.removeChild(root);
    });

    it('highlights only the content the matcher searched, never unsearched parts', () => {
        // The matcher skips tool calls, reasoning and delegated sub-chats, so content 0 has no matches.
        highlighter.update(root, /find me/gi, [contentMatch(1, 0), contentMatch(1, 1)], undefined);
        const ranges = registry.highlights.get(ChatFindHighlighter.MATCH_HIGHLIGHT)!;
        const contents = root.querySelectorAll('.theia-ResponseNode-Content');
        expect(ranges).to.have.length(2);
        expect(ranges.every(r => contents[1].contains(r.startContainer))).to.be.true;
        expect(ranges.some(r => contents[0].contains(r.startContainer))).to.be.false;
    });

    it('resolves content parts among the row\'s own nodes, not those of a delegated sub-chat inside a part', () => {
        // A delegation renders the sub-chat's response node inline (collapsed) inside the outer content element.
        root.querySelectorAll('.theia-ResponseNode-Content')[0].innerHTML = '<details><div class="theia-ResponseNode">' +
            '<div class="theia-ResponseNode-Content"><p>find me in the sub-chat</p></div></div></details>';
        const match = contentMatch(1, 0);
        highlighter.update(root, /find me/gi, [match], match);
        const inSubChat = (range: Range): boolean => !!range.startContainer.parentElement!.closest('details');
        const ranges = registry.highlights.get(ChatFindHighlighter.MATCH_HIGHLIGHT)!;
        expect(ranges).to.have.length(2);
        expect(ranges.some(inSubChat)).to.be.false;
        const current = registry.highlights.get(ChatFindHighlighter.CURRENT_HIGHLIGHT)!;
        expect(current.map(range => range.toString())).to.deep.equal(['find me']);
        expect(current.some(inSubChat)).to.be.false;
    });

    it('does not highlight text inside <style> or <script>, e.g. a diagram stylesheet', () => {
        root.querySelectorAll('.theia-ResponseNode-Content')[1].innerHTML =
            '<svg><style>.find-me-node{fill:#fff}</style>' +
            '<foreignObject><div><span>find me</span></div></foreignObject></svg>' +
            '<script>const findMe = "find me";</script>';
        highlighter.update(root, /find me/gi, [contentMatch(1, 0)], undefined);
        const ranges = registry.highlights.get(ChatFindHighlighter.MATCH_HIGHLIGHT)!;
        expect(ranges).to.have.length(1);
        expect(ranges[0].startContainer.parentElement!.nodeName.toLowerCase()).to.equal('span');
    });

    it('highlights request text when the match belongs to a request row', () => {
        highlighter.update(root, /find me/gi, [requestMatch(0)], undefined);
        expect(registry.texts(ChatFindHighlighter.MATCH_HIGHLIGHT)).to.deep.equal(['find me']);
    });

    it('marks the current match by content index and occurrence', () => {
        highlighter.update(root, /find me/gi, [contentMatch(1, 0), contentMatch(1, 1)], contentMatch(1, 1));
        const current = registry.highlights.get(ChatFindHighlighter.CURRENT_HIGHLIGHT)!;
        expect(current).to.have.length(1);
        expect(current[0].toString()).to.equal('find me');
        // the second occurrence lives in the trailing text node ' and find me'
        expect(current[0].startOffset).to.equal(5);
    });

    it('marks the current match by its offsets, not by counting occurrences in the DOM', () => {
        // The DOM holds an occurrence the match list does not (e.g. still being streamed): offsets still pick the right one.
        root.querySelectorAll('.theia-ResponseNode-Content')[1].innerHTML = '<p>find me <em>and</em> find me</p>';
        const second: ChatFindMatch = { ...contentMatch(1, 0), start: 12, end: 19 };
        highlighter.update(root, /find me/gi, [second], second);
        const current = registry.highlights.get(ChatFindHighlighter.CURRENT_HIGHLIGHT)!;
        expect(current).to.have.length(1);
        expect(current[0].startContainer.textContent).to.equal(' find me');
    });

    it('marks nothing as current when the DOM has no such occurrence', () => {
        highlighter.update(root, /find me/gi, [contentMatch(1, 5)], contentMatch(1, 5));
        expect(registry.highlights.get(ChatFindHighlighter.CURRENT_HIGHLIGHT)).to.deep.equal([]);
    });

    it('searches only the message of an error part', () => {
        root.querySelectorAll('.theia-ResponseNode-Content')[1].innerHTML = '<div class="theia-ChatPart-Error">' +
            '<div class="theia-ChatPart-Error-headline"><div class="theia-ChatPart-Error-prefix">Error find me:</div>' +
            '<div class="theia-ChatPart-Error-message">find me</div></div><details><pre>find me</pre></details></div>';
        const match = contentMatch(1, 0, 'error');
        highlighter.update(root, /find me/gi, [match], match);
        const ranges = registry.highlights.get(ChatFindHighlighter.MATCH_HIGHLIGHT)!;
        expect(ranges).to.have.length(1);
        expect(ranges[0].startContainer.parentElement!.className).to.equal('theia-ChatPart-Error-message');
    });

    it('skips blocked-resource placeholders and treats non-breaking spaces as spaces', () => {
        root.querySelectorAll('.theia-ResponseNode-Content')[1].innerHTML =
            '<p><span class="theia-blocked-resource">find me</span>find\u00a0me</p>';
        highlighter.update(root, /find me/gi, [contentMatch(1, 0)], contentMatch(1, 0));
        const ranges = registry.highlights.get(ChatFindHighlighter.MATCH_HIGHLIGHT)!;
        expect(ranges).to.have.length(1);
        expect(ranges[0].startContainer.parentElement!.nodeName.toLowerCase()).to.equal('p');
        expect(registry.highlights.get(ChatFindHighlighter.CURRENT_HIGHLIGHT)).to.have.length(1);
    });

    describe('code parts', () => {
        let wrapper: HTMLElement;
        let fake: ReturnType<typeof fakeEditor>;

        beforeEach(() => {
            root.querySelectorAll('.theia-ResponseNode-Content')[1].innerHTML =
                `<div class="theia-CodePartRenderer-root"><div class="${CodeWrapperEditors.CLASS}"><span>find\u00a0me</span></div></div>`;
            wrapper = root.querySelector(`.${CodeWrapperEditors.CLASS}`)!;
            fake = fakeEditor();
            CodeWrapperEditors.set(wrapper, fake.editor);
        });

        it('decorates matches in the editor instead of highlighting its DOM', () => {
            const first = contentMatch(1, 0, 'code');
            const second = contentMatch(1, 1, 'code');
            highlighter.update(root, /find me/gi, [first, second], second);
            expect(fake.decorations()).to.deep.equal([
                { start: 0, end: 7, className: 'findMatch' },
                { start: 12, end: 19, className: 'currentFindMatch' }
            ]);
            expect(registry.highlights.get(ChatFindHighlighter.MATCH_HIGHLIGHT)).to.deep.equal([]);
            expect(registry.highlights.get(ChatFindHighlighter.CURRENT_HIGHLIGHT)).to.deep.equal([]);
        });

        it('does not set unchanged decorations again, so decorating does not loop through the mutation observer', () => {
            const match = contentMatch(1, 0, 'code');
            highlighter.update(root, /find me/gi, [match], match);
            highlighter.refresh();
            expect(fake.setCount()).to.equal(1);
        });

        it('clears the decorations when the find is cleared', () => {
            highlighter.update(root, /find me/gi, [contentMatch(1, 0, 'code')], undefined);
            highlighter.update(root, undefined, [], undefined);
            expect(fake.decorations()).to.deep.equal([]);
        });
    });

    it('clears both highlights when the regexp is removed', () => {
        highlighter.update(root, /find/gi, [contentMatch(1, 0)], undefined);
        highlighter.update(root, undefined, [], undefined);
        expect(registry.highlights.has(ChatFindHighlighter.MATCH_HIGHLIGHT)).to.be.false;
        expect(registry.highlights.has(ChatFindHighlighter.CURRENT_HIGHLIGHT)).to.be.false;
    });

    it('does nothing without a registry', () => {
        const noop = createHighlighter(undefined);
        noop.update(root, /find/gi, [contentMatch(1, 0)], undefined);
        noop.dispose();
        expect(registry.highlights.size).to.equal(0);
    });

    it('re-applies after DOM mutations', async () => {
        highlighter.update(root, /find/gi, [contentMatch(1, 0), contentMatch(1, 1)], undefined);
        const before = registry.texts(ChatFindHighlighter.MATCH_HIGHLIGHT).length;
        root.querySelectorAll('.theia-ResponseNode-Content')[1].insertAdjacentHTML('beforeend', '<p>find again</p>');
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(registry.texts(ChatFindHighlighter.MATCH_HIGHLIGHT).length).to.equal(before + 1);
    });

    describe('scrollCurrentIntoView', () => {
        let outer: HTMLElement;
        let scroller: HTMLElement;
        let scrollIntoViewCalls: number;

        beforeEach(() => {
            scrollIntoViewCalls = 0;
            Element.prototype.scrollIntoView = function (): void { scrollIntoViewCalls++; };
            // An element outside the root that must never be scrolled (stands in for the Theia shell).
            outer = document.createElement('div');
            scrollable(outer, 2000, 400);
            document.body.appendChild(outer);
            outer.appendChild(root);
            // The tree's own scroll container, inside the root.
            scroller = document.createElement('div');
            scrollable(scroller, 1000, 200);
            layout(scroller, { top: 0, height: 200 });
            root.insertBefore(scroller, root.firstChild);
            scroller.innerHTML = '<div data-node-id="r9"><div class="theia-ResponseNode">' +
                '<div class="theia-ResponseNode-Content"><p>find me</p></div></div></div>';
        });

        afterEach(() => {
            document.body.removeChild(outer);
            document.body.appendChild(root);
        });

        const match = (): ChatFindMatch => ({ nodeId: 'r9', kind: 'markdownContent', contentIndex: 0, occurrence: 0, start: 0, end: 7 });

        it('scrolls the tree scroll container and never an ancestor outside the root', () => {
            layout(scroller.querySelector('p')!, { top: 500, height: 20 });
            highlighter.update(root, /find me/gi, [match()], match());
            highlighter.scrollCurrentIntoView(root);
            expect(scroller.scrollTop).to.equal(410); // 500 - (200 - 20) / 2
            expect(outer.scrollTop).to.equal(0);
            expect(scrollIntoViewCalls).to.equal(0);
        });

        it('leaves the scroll position alone when the match is already visible', () => {
            layout(scroller.querySelector('p')!, { top: 50, height: 20 });
            scroller.scrollTop = 120;
            highlighter.update(root, /find me/gi, [match()], match());
            highlighter.scrollCurrentIntoView(root);
            expect(scroller.scrollTop).to.equal(120);
        });
    });
});
