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
import { ChatFindMatch, ChatFindTextRange } from './chat-find-matcher';

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

interface TextSegment {
    node: Text;
    start: number;
}

/**
 * Highlights find matches in the mounted rows of the chat tree with the CSS Custom Highlight API.
 *
 * Only the content the matcher actually searched is highlighted: the elements to scan are derived from the
 * match list, so content the matcher skips (tool calls, reasoning, delegated sub-chats) is never highlighted
 * even though it renders inside the same row. While active, DOM mutations under the root (virtuoso mounting
 * rows, streamed content) re-apply the highlights on the next animation frame.
 */
export class ChatFindHighlighter implements Disposable {

    static readonly MATCH_HIGHLIGHT = 'theia-chat-find-match';
    static readonly CURRENT_HIGHLIGHT = 'theia-chat-find-current';

    protected root: HTMLElement | undefined;
    protected regexp: RegExp | undefined;
    protected matches: readonly ChatFindMatch[] = [];
    protected current: ChatFindMatch | undefined;
    protected currentRange: Range | undefined;
    protected observer: MutationObserver | undefined;
    protected scheduled = false;

    constructor(
        protected readonly findInText: (text: string, regexp: RegExp) => ChatFindTextRange[],
        protected readonly registry: ChatFindHighlightRegistry | undefined = ChatFindHighlightRegistry.fromCssHighlights()
    ) { }

    /** Highlights the given matches under `root` and marks `current`; an undefined `regexp` clears. */
    update(root: HTMLElement, regexp: RegExp | undefined, matches: readonly ChatFindMatch[], current: ChatFindMatch | undefined): void {
        this.regexp = regexp;
        this.matches = matches;
        this.current = current;
        if (!this.registry) {
            return;
        }
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

    /**
     * Scrolls the current match into view within the chat tree's own scroll container.
     *
     * Deliberately does not use `Element.scrollIntoView()`: that scrolls every scrollable ancestor up to the
     * viewport, which shifts the whole application shell. Only the first scroll container between the match
     * and `root` is moved, and only when the match is not already visible.
     */
    scrollCurrentIntoView(root: HTMLElement): void {
        const element = this.getCurrentElement();
        if (!element) {
            return;
        }
        const scroller = this.findScrollContainer(element, root);
        if (!scroller) {
            return;
        }
        const elementRect = element.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        if (elementRect.top >= scrollerRect.top && elementRect.bottom <= scrollerRect.top + scroller.clientHeight) {
            return;
        }
        const centered = scroller.scrollTop + (elementRect.top - scrollerRect.top) - (scroller.clientHeight - elementRect.height) / 2;
        scroller.scrollTop = Math.max(0, Math.min(centered, scroller.scrollHeight - scroller.clientHeight));
    }

    clear(): void {
        this.observer?.disconnect();
        this.observer = undefined;
        this.root = undefined;
        this.currentRange = undefined;
        this.registry?.delete(ChatFindHighlighter.MATCH_HIGHLIGHT);
        this.registry?.delete(ChatFindHighlighter.CURRENT_HIGHLIGHT);
    }

    dispose(): void {
        this.clear();
    }

    /** The element rendering the current match, if it is mounted. */
    protected getCurrentElement(): Element | undefined {
        const container = this.currentRange?.startContainer;
        const element = container instanceof Element ? container : container?.parentElement;
        return element?.isConnected ? element : undefined;
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
        const { root, regexp, current, registry } = this;
        if (!root || !regexp || !registry) {
            return;
        }
        const all: Range[] = [];
        let currentRange: Range | undefined;
        for (const [, matches] of this.groupByContent()) {
            const element = this.findContentElement(root, matches[0]);
            if (!element) {
                continue; // the row is not mounted
            }
            const ranges = this.collectRanges(element, regexp);
            all.push(...ranges);
            if (current && matches.some(match => match === current || ChatFindMatch.key(match) === ChatFindMatch.key(current))) {
                currentRange = ranges[Math.min(current.occurrence, ranges.length - 1)] ?? currentRange;
            }
        }
        this.currentRange = currentRange;
        registry.set(ChatFindHighlighter.MATCH_HIGHLIGHT, all);
        registry.set(ChatFindHighlighter.CURRENT_HIGHLIGHT, currentRange ? [currentRange] : []);
    }

    /** Matches grouped by the element that renders them, so each element is scanned once. */
    protected groupByContent(): Map<string, ChatFindMatch[]> {
        const groups = new Map<string, ChatFindMatch[]>();
        for (const match of this.matches) {
            const key = `${match.nodeId}/${match.contentIndex ?? 'request'}`;
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
        const row = Array.from(root.querySelectorAll<HTMLElement>('[data-node-id]')).find(candidate => candidate.dataset.nodeId === match.nodeId);
        if (!row) {
            return undefined;
        }
        if (match.contentIndex === undefined) {
            return row.querySelector('.theia-RequestNode > p') ?? undefined;
        }
        return row.querySelectorAll('.theia-ResponseNode > .theia-ResponseNode-Content')[match.contentIndex] ?? undefined;
    }

    /** One `Range` per occurrence of `regexp` in the concatenated text nodes of `element`. */
    protected collectRanges(element: Element, regexp: RegExp): Range[] {
        const segments: TextSegment[] = [];
        let text = '';
        const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode: node => {
                if (node.nodeType !== Node.ELEMENT_NODE) {
                    return NodeFilter.FILTER_ACCEPT;
                }
                // Skip whole subtrees that hold code rather than visible text. A rendered mermaid diagram, for
                // example, carries its stylesheet in an SVG <style> element, which must never be searched.
                const name = node.nodeName.toLowerCase();
                return name === 'style' || name === 'script' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
            }
        });
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            segments.push({ node: node as Text, start: text.length });
            text += node.textContent ?? '';
        }
        if (!text) {
            return [];
        }
        return this.findInText(text, regexp).map(({ start, end }) => {
            const range = element.ownerDocument.createRange();
            const from = this.locate(segments, start);
            const to = this.locate(segments, end);
            range.setStart(from.node, from.offset);
            range.setEnd(to.node, to.offset);
            return range;
        });
    }

    /** Map an offset in the concatenated text to a text node and offset inside it (end offsets stay in the preceding node). */
    protected locate(segments: TextSegment[], offset: number): { node: Text; offset: number } {
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
