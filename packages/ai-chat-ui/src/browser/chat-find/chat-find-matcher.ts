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

import {
    ChatModel, ChatRequestModel, ChatResponseContent, CodeChatResponseContent, ErrorChatResponseContent,
    InformationalChatResponseContent, MarkdownChatResponseContent, TextChatResponseContent, formatProviderError
} from '@theia/ai-chat/lib/common';
import { ImageContextVariable } from '@theia/ai-chat/lib/common/image-context-variable';
import { injectable } from '@theia/core/shared/inversify';

/** Language id of code parts that are rendered as a diagram instead of as source. */
const MERMAID_LANGUAGE_ID = 'mermaid';

export interface ChatFindOptions {
    matchCase: boolean;
    wholeWord: boolean;
    useRegex: boolean;
}

export interface ChatFindTextRange {
    start: number;
    end: number;
}

/**
 * A match of the find query inside a chat session, located by the tree node that renders it.
 */
export interface ChatFindMatch extends ChatFindTextRange {
    /** Id of the tree node rendering the matched text: the request id or the response id. */
    nodeId: string;
    /** Index into `response.response.content`; `undefined` for request text. */
    contentIndex?: number;
    /** 0-based index of this match among all matches inside the same text. */
    occurrence: number;
}

export namespace ChatFindMatch {
    /** Stable identity of a match across recomputations of the match list. */
    export function key(match: ChatFindMatch): string {
        return `${match.nodeId}/${match.contentIndex ?? 'request'}/${match.occurrence}`;
    }
}

/**
 * Computes find matches over a chat session model. Only the displayed branch (`model.getRequests()`) is searched.
 * Subclass and override {@link getSearchableText} to search additional content kinds.
 */
@injectable()
export class ChatFindMatcher {

    /**
     * Builds the regular expression shared by model matching and DOM highlighting.
     * @returns `undefined` for an empty query or an invalid regular expression.
     */
    createRegExp(query: string, options: ChatFindOptions): RegExp | undefined {
        if (!query) {
            return undefined;
        }
        let source = options.useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (options.wholeWord) {
            source = `\\b(?:${source})\\b`;
        }
        try {
            return new RegExp(source, options.matchCase ? 'g' : 'gi');
        } catch {
            return undefined;
        }
    }

    /** All matches in tree order: request row, then response row, content parts in order, offsets ascending. */
    findMatches(model: ChatModel, regexp: RegExp): ChatFindMatch[] {
        const matches: ChatFindMatch[] = [];
        for (const request of model.getRequests()) {
            this.collect(matches, regexp, this.getRequestText(request), request.id, undefined);
            request.response.response.content.forEach((content, contentIndex) => {
                const text = this.getSearchableText(content);
                if (text) {
                    this.collect(matches, regexp, text, request.response.id, contentIndex);
                }
            });
        }
        return matches;
    }

    /** All non-empty occurrences of `regexp` in `text`, in order. */
    findInText(text: string, regexp: RegExp): ChatFindTextRange[] {
        const ranges: ChatFindTextRange[] = [];
        regexp.lastIndex = 0;
        let result = regexp.exec(text);
        while (result) {
            if (result[0].length === 0) {
                regexp.lastIndex++;
            } else {
                ranges.push({ start: result.index, end: result.index + result[0].length });
            }
            result = regexp.exec(text);
        }
        return ranges;
    }

    protected collect(matches: ChatFindMatch[], regexp: RegExp, text: string, nodeId: string, contentIndex: number | undefined): void {
        this.findInText(text, regexp).forEach((range, occurrence) => {
            matches.push({ nodeId, contentIndex, occurrence, start: range.start, end: range.end });
        });
    }

    /** The request text as rendered: all parts joined, inline image parts skipped. */
    protected getRequestText(request: ChatRequestModel): string {
        const parts = request.message.parts;
        const inlineImages = ImageContextVariable.extractInlineImagesWithIndices(parts);
        return parts.filter((_, index) => !inlineImages.has(index)).map(part => part.text).join('');
    }

    /**
     * The searchable text of a response part, or `undefined` for kinds that are not searched
     * (tool calls, reasoning, progress, ...).
     */
    protected getSearchableText(content: ChatResponseContent): string | undefined {
        if (TextChatResponseContent.is(content)) {
            return content.content;
        }
        if (MarkdownChatResponseContent.is(content)) {
            return content.content.value;
        }
        if (CodeChatResponseContent.is(content)) {
            // A mermaid block is rendered as a diagram rather than as its source (see MermaidPartRenderer), so its
            // source text is nowhere on screen: matches in it could be counted but never highlighted or revealed.
            return content.language?.toLowerCase() === MERMAID_LANGUAGE_ID ? undefined : content.code;
        }
        if (InformationalChatResponseContent.is(content)) {
            return content.content.value;
        }
        if (ErrorChatResponseContent.is(content)) {
            return formatProviderError(content.error.message).message;
        }
        return undefined;
    }
}
