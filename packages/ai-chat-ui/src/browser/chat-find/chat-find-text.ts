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

import { BLOCKED_RESOURCE_CLASS } from '../chat-response-renderer/block-external-resources';

export interface ChatFindTextSegment {
    node: Text;
    /** Offset of the node's first character in {@link ChatFindTextContent.text}. */
    start: number;
}

export interface ChatFindTextContent {
    text: string;
    segments: ChatFindTextSegment[];
}

/**
 * Reads the searchable text of rendered chat content. The matcher reads it from a detached render and the
 * highlighter from the mounted DOM, so match offsets computed on the one are valid in the other.
 */
export namespace ChatFindText {

    /** The concatenated text nodes under `root`, skipping subtrees that do not hold visible text. */
    export function collect(root: Node): ChatFindTextContent {
        const segments: ChatFindTextSegment[] = [];
        let text = '';
        const walker = (root.ownerDocument ?? document).createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode: node => node.nodeType === Node.ELEMENT_NODE
                ? (isSkipped(node as Element) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP)
                : NodeFilter.FILTER_ACCEPT
        });
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            segments.push({ node: node as Text, start: text.length });
            text += node.textContent ?? '';
        }
        return { text: normalize(text), segments };
    }

    /** Non-breaking spaces (e.g. from `&nbsp;` in markdown) are searched as plain spaces; the length is unchanged. */
    export function normalize(text: string): string {
        return text.replace(/ /g, ' ');
    }

    /**
     * Code rather than visible text (e.g. the stylesheet of a rendered mermaid diagram), and blocked-resource
     * placeholders, whose label disappears once the user allows the resource.
     */
    function isSkipped(element: Element): boolean {
        const name = element.nodeName.toLowerCase();
        return name === 'style' || name === 'script' || element.classList.contains(BLOCKED_RESOURCE_CLASS);
    }
}
