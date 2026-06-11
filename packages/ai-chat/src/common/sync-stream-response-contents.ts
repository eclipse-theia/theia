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

import {
    ChatResponseContent,
    CodeChatResponseContent,
    CodeChatResponseContentImpl,
    MarkdownChatResponseContent,
    MarkdownChatResponseContentImpl,
    TextChatResponseContent,
    TextChatResponseContentImpl,
    ThinkingChatResponseContent,
    ThinkingChatResponseContentImpl,
    ToolCallChatResponseContent,
} from './chat-model';

/** Mutable chat response surface used while applying streamed parse results. */
export interface MutableStreamChatResponse {
    readonly content: ChatResponseContent[];
    clearContent(): void;
    addContent(content: ChatResponseContent): void;
    addContents(contents: ChatResponseContent[]): void;
    responseContentChanged(): void;
}

/**
 * Incrementally sync parsed stream parts into an existing response, preserving object
 * identity for in-flight markdown, thinking, code, and tool-call blocks.
 *
 * Falls back to replacing the stream segment when structure changes (for example when
 * an incomplete fenced code block becomes a distinct code part).
 */
export function syncStreamResponseContents(
    response: MutableStreamChatResponse,
    startIndex: number,
    nextContents: ChatResponseContent[],
): boolean {
    const existing = response.content;
    let changed = false;

    for (let i = 0; i < nextContents.length; i++) {
        const next = nextContents[i];
        const existingIndex = startIndex + i;
        if (existingIndex >= existing.length) {
            response.addContent(next);
            changed = true;
            continue;
        }
        const current = existing[existingIndex];
        if (mergeStreamContentInPlace(current, next)) {
            changed = true;
        } else {
            replaceStreamContentsFrom(response, startIndex, nextContents);
            return true;
        }
    }

    if (existing.length > startIndex + nextContents.length) {
        replaceStreamContentsFrom(response, startIndex, nextContents);
        return true;
    }

    if (changed) {
        response.responseContentChanged();
    }
    return changed;
}

function replaceStreamContentsFrom(
    response: MutableStreamChatResponse,
    startIndex: number,
    nextContents: ChatResponseContent[],
): void {
    const prefix = startIndex > 0 ? response.content.slice(0, startIndex) : [];
    response.clearContent();
    response.addContents([...prefix, ...nextContents]);
}

function mergeStreamContentInPlace(current: ChatResponseContent, next: ChatResponseContent): boolean {
    if (current.kind !== next.kind) {
        return false;
    }
    if (MarkdownChatResponseContent.is(current) && MarkdownChatResponseContent.is(next)) {
        return mergeGrowingStringContent(
            current.content.value,
            next.content.value,
            delta => current.merge(new MarkdownChatResponseContentImpl(delta)),
        );
    }
    if (TextChatResponseContent.is(current) && TextChatResponseContent.is(next)) {
        return mergeGrowingStringContent(
            current.content,
            next.content,
            delta => current.merge(new TextChatResponseContentImpl(delta)),
        );
    }
    if (ThinkingChatResponseContent.is(current) && ThinkingChatResponseContent.is(next)) {
        return mergeGrowingStringContent(
            current.content,
            next.content,
            delta => current.merge(new ThinkingChatResponseContentImpl(delta, '')),
        );
    }
    if (CodeChatResponseContent.is(current) && CodeChatResponseContent.is(next)) {
        if (current.language !== next.language || !ChatResponseContent.hasMerge(current)) {
            return false;
        }
        return mergeGrowingStringContent(
            current.code,
            next.code,
            delta => current.merge(new CodeChatResponseContentImpl(delta)),
        );
    }
    if (ToolCallChatResponseContent.is(current) && ToolCallChatResponseContent.is(next)) {
        if (next.id && next.id === current.id && ChatResponseContent.hasMerge(current)) {
            const before = JSON.stringify(current);
            current.merge(next);
            return JSON.stringify(current) !== before;
        }
        return false;
    }
    return false;
}

function mergeGrowingStringContent(
    currentValue: string,
    nextValue: string,
    mergeDelta: (delta: string) => boolean,
): boolean {
    if (nextValue === currentValue) {
        return false;
    }
    if (nextValue.startsWith(currentValue)) {
        return mergeDelta(nextValue.slice(currentValue.length));
    }
    return false;
}
