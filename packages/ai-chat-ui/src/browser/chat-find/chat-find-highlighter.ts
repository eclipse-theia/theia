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

import { Disposable } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Range as EditorRange } from '@theia/monaco-editor-core/esm/vs/editor/common/core/range';
import { IEditorDecorationsCollection } from '@theia/monaco-editor-core/esm/vs/editor/common/editorCommon';
import { IModelDecorationOptions, TrackedRangeStickiness } from '@theia/monaco-editor-core/esm/vs/editor/common/model';
import { SimpleMonacoEditor } from '@theia/monaco/lib/browser/simple-monaco-editor';
import { CodeWrapperEditors } from '../chat-response-renderer/code-wrapper-editors';
import { ChatFindMatch, ChatFindMatcher } from './chat-find-matcher';
import { ChatFindText, ChatFindTextSegment } from './chat-find-text';

/** Minimal abstraction over `CSS.highlights` so the highlighter can be tested and degrades when unsupported. */
export interface ChatFindHighlightRegistry {
    set(name: string, ranges: Range[]): void;
    delete(name: string): void;
}

export namespace ChatFindHighlightRegistry {
    /** The CSS Custom Highlight API registry, or `undefined` when the browser does not support it. */
    export function fromCssHighlights(): ChatFindHighlightRegistry | undefined {
        if (typeof CSS === 'undefined' || !('highlights' in CSS) || typeof Highlight === 'undefined') {
            return undefined;
        }
        return {
            set: (name, ranges) => { CSS.highlights.set(name, new Highlight(...ranges)); },
            delete: name => { CSS.highlights.delete(name); }
        };
    }
}

/** Where the current match is shown: a DOM range, or a range in the editor of a code part. */
type ChatFindCurrentTarget =
    | { kind: 'dom', range: Range }
    | { kind: 'code', editor: SimpleMonacoEditor, range: EditorRange };

interface ChatFindCodeDecorations {
    collection: IEditorDecorationsCollection;
    /** What the collection currently shows, so unchanged decorations are not set again. */
    signature: string;
}

/**
 * Highlights find matches in the mounted rows of the chat tree: text with the CSS Custom Highlight API, code parts
 * with decorations in their editor.
 *
 * Only the content the matcher actually searched is highlighted: the elements to scan are derived from the
 * match list, so content the matcher skips (tool calls, reasoning, delegated sub-chats) is never highlighted
 * even though it renders inside the same row. While active, DOM mutations under the root (virtuoso mounting
 * rows, streamed content) re-apply the highlights on the next animation frame.
 */
@injectable()
export class ChatFindHighlighter implements Disposable {

    static readonly MATCH_HIGHLIGHT = 'theia-chat-find-match';
    static readonly CURRENT_HIGHLIGHT = 'theia-chat-find-current';

    /** Monaco's own find decorations, so code parts look the same as a match of the editor find widget. */
    protected static readonly CODE_MATCH_DECORATION: IModelDecorationOptions = {
        description: 'chat-find-match',
        className: 'findMatch',
        stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        zIndex: 13
    };
    protected static readonly CODE_CURRENT_DECORATION: IModelDecorationOptions = {
        description: 'chat-find-current',
        className: 'currentFindMatch',
        stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        zIndex: 13
    };

    @inject(ChatFindMatcher)
    protected readonly matcher: ChatFindMatcher;

    protected registry: ChatFindHighlightRegistry | undefined;
    protected root: HTMLElement | undefined;
    protected regexp: RegExp | undefined;
    protected matches: readonly ChatFindMatch[] = [];
    protected current: ChatFindMatch | undefined;
    protected currentTarget: ChatFindCurrentTarget | undefined;
    protected readonly codeDecorations = new Map<SimpleMonacoEditor, ChatFindCodeDecorations>();
    protected observer: MutationObserver | undefined;
    protected scheduled = false;

    @postConstruct()
    protected init(): void {
        this.registry = this.createRegistry();
    }

    protected createRegistry(): ChatFindHighlightRegistry | undefined {
        return ChatFindHighlightRegistry.fromCssHighlights();
    }

    /** Highlights the given matches under `root` and marks `current`; an undefined `regexp` clears. */
    update(root: HTMLElement, regexp: RegExp | undefined, matches: readonly ChatFindMatch[], current: ChatFindMatch | undefined): void {
        this.regexp = regexp;
        this.matches = matches;
        this.current = current;
        if (!regexp) {
            this.clear();
            return;
        }
        this.observe(root);
        this.apply();
    }

    /** Re-applies the current highlights, e.g. after a scroll mounted new rows. */
    refresh(): void {
        if (this.regexp && this.root) {
            this.apply();
        }
    }

    /** The mounted row rendering the tree node `nodeId`, if any. */
    findRow(root: HTMLElement, nodeId: string): HTMLElement | undefined {
        return root.querySelector<HTMLElement>(`[data-node-id="${nodeId.replace(/["\\]/g, '\\$&')}"]`) ?? undefined;
    }

    /**
     * Scrolls the current match into view within the chat tree's own scroll container.
     *
     * Deliberately does not use `Element.scrollIntoView()`: that scrolls every scrollable ancestor up to the
     * viewport, which shifts the whole application shell. Only the first scroll container between the match
     * and `root` is moved, and only when the match is not already visible.
     */
    scrollCurrentIntoView(root: HTMLElement): void {
        const target = this.getCurrentBounds();
        if (!target) {
            return;
        }
        const scroller = this.findScrollContainer(target.element, root);
        if (!scroller) {
            return;
        }
        const scrollerRect = scroller.getBoundingClientRect();
        if (target.top >= scrollerRect.top && target.top + target.height <= scrollerRect.top + scroller.clientHeight) {
            return;
        }
        const centered = scroller.scrollTop + (target.top - scrollerRect.top) - (scroller.clientHeight - target.height) / 2;
        scroller.scrollTop = Math.max(0, Math.min(centered, scroller.scrollHeight - scroller.clientHeight));
    }

    clear(): void {
        this.observer?.disconnect();
        this.observer = undefined;
        this.root = undefined;
        this.currentTarget = undefined;
        this.registry?.delete(ChatFindHighlighter.MATCH_HIGHLIGHT);
        this.registry?.delete(ChatFindHighlighter.CURRENT_HIGHLIGHT);
        this.codeDecorations.forEach(decorations => decorations.collection.clear());
        this.codeDecorations.clear();
    }

    dispose(): void {
        this.clear();
    }

    /** The element showing the current match and its vertical extent in viewport coordinates, if it is mounted. */
    protected getCurrentBounds(): { element: Element, top: number, height: number } | undefined {
        const target = this.currentTarget;
        if (target?.kind === 'code') {
            const control = target.editor.getControl();
            const editorNode = control.getDomNode();
            // The editor is sized to its content, so this only scrolls long lines horizontally.
            control.revealRangeInCenterIfOutsideViewport(target.range);
            const position = control.getScrolledVisiblePosition(target.range.getStartPosition());
            if (!editorNode?.isConnected || !position) {
                return undefined;
            }
            return { element: editorNode, top: editorNode.getBoundingClientRect().top + position.top, height: position.height };
        }
        const container = target?.range.startContainer;
        const element = container instanceof Element ? container : container?.parentElement;
        if (!element?.isConnected) {
            return undefined;
        }
        const rect = element.getBoundingClientRect();
        return { element, top: rect.top, height: rect.height };
    }

    /** The first scroll container between `from` and `root`, inclusive; never anything outside `root`. */
    protected findScrollContainer(from: Element, root: HTMLElement): HTMLElement | undefined {
        let element: HTMLElement | undefined = from instanceof HTMLElement ? from : from.parentElement ?? undefined;
        while (element && (root === element || root.contains(element))) {
            const overflowY = element.ownerDocument.defaultView?.getComputedStyle(element).overflowY;
            if ((overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight) {
                return element;
            }
            element = element.parentElement ?? undefined;
        }
        return undefined;
    }

    protected observe(root: HTMLElement): void {
        if (this.root === root && this.observer) {
            return;
        }
        this.observer?.disconnect();
        this.root = root;
        this.observer = new MutationObserver(() => this.scheduleApply());
        this.observer.observe(root, { childList: true, subtree: true, characterData: true });
    }

    protected scheduleApply(): void {
        if (this.scheduled) {
            return;
        }
        this.scheduled = true;
        const run = (): void => {
            this.scheduled = false;
            if (this.root && this.regexp) {
                this.apply();
            }
        };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(run);
        } else {
            setTimeout(run, 16);
        }
    }

    protected apply(): void {
        const { root, regexp } = this;
        if (!root || !regexp) {
            return;
        }
        const all: Range[] = [];
        const decorated = new Set<SimpleMonacoEditor>();
        let currentTarget: ChatFindCurrentTarget | undefined;
        for (const matches of this.groupByContent().values()) {
            const element = this.findContentElement(root, matches[0]);
            if (!element) {
                continue; // the row is not mounted
            }
            const current = this.findCurrentIn(matches);
            if (matches[0].kind === 'code') {
                const editor = this.findCodeEditor(element);
                if (editor) {
                    decorated.add(editor);
                    currentTarget = this.decorateCode(editor, matches, current) ?? currentTarget;
                }
                continue;
            }
            const ranges = this.collectRanges(this.findTextRoot(element, matches[0]), regexp);
            all.push(...ranges.map(({ range }) => range));
            if (current) {
                // The DOM text is the text the matcher searched, so the current match is found by its offsets. Only
                // while the DOM lags behind the model (e.g. mid-stream) does it fall back to the occurrence index.
                const range = ranges.find(({ start, end }) => start === current.start && end === current.end) ?? ranges[current.occurrence];
                currentTarget = range ? { kind: 'dom', range: range.range } : currentTarget;
            }
        }
        this.clearCodeDecorations(decorated);
        this.currentTarget = currentTarget;
        this.registry?.set(ChatFindHighlighter.MATCH_HIGHLIGHT, all);
        this.registry?.set(ChatFindHighlighter.CURRENT_HIGHLIGHT, currentTarget?.kind === 'dom' ? [currentTarget.range] : []);
    }

    protected findCurrentIn(matches: readonly ChatFindMatch[]): ChatFindMatch | undefined {
        const current = this.current;
        if (!current) {
            return undefined;
        }
        const key = ChatFindMatch.key(current);
        return matches.find(match => match === current || ChatFindMatch.key(match) === key);
    }

    /** Matches grouped by the element that renders them, so each element is scanned once. */
    protected groupByContent(): Map<string, ChatFindMatch[]> {
        const groups = new Map<string, ChatFindMatch[]>();
        for (const match of this.matches) {
            const key = `${match.nodeId}/${match.contentIndex ?? ChatFindMatch.REQUEST_KIND}`;
            const group = groups.get(key);
            if (group) {
                group.push(match);
            } else {
                groups.set(key, [match]);
            }
        }
        return groups;
    }

    /** The element rendering the text a match was found in, or `undefined` when its row is not mounted. */
    protected findContentElement(root: HTMLElement, match: ChatFindMatch): Element | undefined {
        const row = this.findRow(root, match.nodeId);
        if (!row) {
            return undefined;
        }
        if (match.contentIndex === undefined) {
            return row.querySelector('.theia-RequestNode > p') ?? undefined;
        }
        return row.querySelectorAll('.theia-ResponseNode > .theia-ResponseNode-Content')[match.contentIndex] ?? undefined;
    }

    /** The element holding exactly the text the matcher searched for a part: an error part searches only its message. */
    protected findTextRoot(contentElement: Element, match: ChatFindMatch): Element {
        if (match.kind === 'error') {
            return contentElement.querySelector('.theia-ChatPart-Error-message') ?? contentElement;
        }
        return contentElement;
    }

    /** The editor of a code part, once it has been created. */
    protected findCodeEditor(contentElement: Element): SimpleMonacoEditor | undefined {
        const wrapper = contentElement.querySelector(`.${CodeWrapperEditors.CLASS}`);
        return wrapper ? CodeWrapperEditors.get(wrapper) : undefined;
    }

    /**
     * Decorates the matches of a code part in its editor; match offsets are offsets into the code the editor shows.
     * @returns the current match's target when it is one of `matches`.
     */
    protected decorateCode(editor: SimpleMonacoEditor, matches: readonly ChatFindMatch[], current: ChatFindMatch | undefined): ChatFindCurrentTarget | undefined {
        const model = editor.document.textEditorModel;
        const toRange = (match: ChatFindMatch): EditorRange => EditorRange.fromPositions(model.getPositionAt(match.start), model.getPositionAt(match.end));
        const decorations = matches.map(match => ({
            range: toRange(match),
            options: match === current ? ChatFindHighlighter.CODE_CURRENT_DECORATION : ChatFindHighlighter.CODE_MATCH_DECORATION
        }));
        // Setting the value of the model drops its decorations, so the version is part of what is shown.
        const signature = `${model.getVersionId()}:${matches.map(match => `${match.start}-${match.end}${match === current ? '*' : ''}`).join(',')}`;
        const existing = this.codeDecorations.get(editor);
        if (existing?.signature !== signature) {
            // Only set when changed: decorating re-renders the editor, which would otherwise re-trigger `apply()`.
            const collection = existing?.collection ?? editor.getControl().createDecorationsCollection();
            collection.set(decorations);
            this.codeDecorations.set(editor, { collection, signature });
        }
        return current ? { kind: 'code', editor, range: toRange(current) } : undefined;
    }

    /** Removes the decorations of editors that no longer show a match, e.g. because their row was unmounted. */
    protected clearCodeDecorations(keep: Set<SimpleMonacoEditor>): void {
        for (const [editor, decorations] of this.codeDecorations) {
            if (!keep.has(editor)) {
                decorations.collection.clear();
                this.codeDecorations.delete(editor);
            }
        }
    }

    /** One `Range` per occurrence of `regexp` in the text of `element`, with its offsets in that text. */
    protected collectRanges(element: Element, regexp: RegExp): { start: number, end: number, range: Range }[] {
        const { text, segments } = ChatFindText.collect(element);
        if (!text) {
            return [];
        }
        return this.matcher.findInText(text, regexp).map(({ start, end }) => {
            const range = element.ownerDocument.createRange();
            const from = this.locate(segments, start);
            const to = this.locate(segments, end);
            range.setStart(from.node, from.offset);
            range.setEnd(to.node, to.offset);
            return { start, end, range };
        });
    }

    /** Map an offset in the concatenated text to a text node and offset inside it (end offsets stay in the preceding node). */
    protected locate(segments: ChatFindTextSegment[], offset: number): { node: Text; offset: number } {
        let segment = segments[0];
        for (const candidate of segments) {
            if (candidate.start < offset) {
                segment = candidate;
            } else {
                break;
            }
        }
        return { node: segment.node, offset: offset - segment.start };
    }
}
