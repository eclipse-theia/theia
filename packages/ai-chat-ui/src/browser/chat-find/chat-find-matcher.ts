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
    MarkdownChatResponseContent, TextChatResponseContent, formatProviderError
} from '@theia/ai-chat/lib/common';
import { ImageContextVariable } from '@theia/ai-chat/lib/common/image-context-variable';
import { escapeRegExpCharacters } from '@theia/core/lib/common/strings';
import { injectable } from '@theia/core/shared/inversify';
import { MarkdownRendering } from '../chat-response-renderer/markdown-part-renderer';
import { ChatFindText } from './chat-find-text';

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
    /** The `kind` of the matched response part, or {@link ChatFindMatch.REQUEST_KIND} for request text. */
    kind: string;
    /** Index into `response.response.content`; `undefined` for request text. */
    contentIndex?: number;
    /** 0-based index of this match among all matches inside the same text. */
    occurrence: number;
}

export namespace ChatFindMatch {
    export const REQUEST_KIND = 'request';

    /** Stable identity of a match across recomputations of the match list. */
    export function key(match: ChatFindMatch): string {
        return `${match.nodeId}/${match.contentIndex ?? 'request'}/${match.occurrence}`;
    }
}

/**
 * Computes find matches over a chat session model. Only the displayed branch (`model.getRequests()`) is searched.
 *
 * Text is searched as it is rendered, not as it is stored: markdown is rendered the way the chat renders it and
 * its text read with {@link ChatFindText}, the same way the highlighter reads the mounted DOM, so match offsets
 * are valid in both. Subclass and override {@link getSearchableText} to search additional content kinds.
 */
@injectable()
export class ChatFindMatcher {

    /** VS Code's default `editor.wordSeparators`; whitespace separates words as well. */
    protected static readonly WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';

    /** Rendered text by the object it was rendered for, reused while its source text is unchanged. */
    protected readonly renderedTextCache = new WeakMap<object, { source: string, text: string }>();

    /**
     * Builds the regular expression shared by model matching and DOM highlighting.
     * @returns `undefined` for an empty query or an invalid regular expression.
     */
    createRegExp(query: string, options: ChatFindOptions): RegExp | undefined {
        if (!query) {
            return undefined;
        }
        let source = options.useRegex ? query : escapeRegExpCharacters(query);
        if (options.wholeWord) {
            source = this.wrapWholeWord(source);
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
            this.collect(matches, regexp, this.getRequestText(request), request.id, ChatFindMatch.REQUEST_KIND, undefined);
            request.response.response.content.forEach((content, contentIndex) => {
                const text = this.getSearchableText(content);
                if (text) {
                    this.collect(matches, regexp, text, request.response.id, content.kind, contentIndex);
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

    /**
     * Restricts `source` to whole words the way VS Code does: each end of a match must be the end of the text, next
     * to a word separator, or itself a word separator. Unlike `\b`, this also works for queries such as `C++` or `foo()`.
     */
    protected wrapWholeWord(source: string): string {
        const separator = `[\\s${escapeRegExpCharacters(ChatFindMatcher.WORD_SEPARATORS)}]`;
        return `(?:(?<=^|${separator})|(?=${separator}))(?:${source})(?:(?=${separator}|$)|(?<=${separator}))`;
    }

    protected collect(
        matches: ChatFindMatch[], regexp: RegExp, text: string, nodeId: string, kind: string, contentIndex: number | undefined
    ): void {
        this.findInText(text, regexp).forEach((range, occurrence) => {
            matches.push({ nodeId, kind, contentIndex, occurrence, start: range.start, end: range.end });
        });
    }

    /**
     * The request text as rendered by `ChatRequestRender`: agent, variable and function mentions as labels,
     * text parts as inline markdown, inline image parts skipped.
     */
    protected getRequestText(request: ChatRequestModel): string {
        const parts = request.message.parts;
        const inlineImages = ImageContextVariable.extractInlineImagesWithIndices(parts);
        return parts
            .filter((_, index) => !inlineImages.has(index))
            .map(part => part.kind === 'agent' || part.kind === 'var' || part.kind === 'function'
                ? ChatFindText.normalize(part.text)
                : this.getRenderedMarkdownText(part, MarkdownRendering.prepareRequestText(part.text), true, false))
            .join('');
    }

    /**
     * The searchable text of a response part as it is rendered, or `undefined` for kinds that are not searched
     * (tool calls, reasoning, progress, informational content, which the chat does not render, ...).
     */
    protected getSearchableText(content: ChatResponseContent): string | undefined {
        if (TextChatResponseContent.is(content)) {
            return ChatFindText.normalize(content.asString?.() ?? content.content);
        }
        if (MarkdownChatResponseContent.is(content)) {
            return this.getRenderedMarkdownText(content, content.content.value, false, true);
        }
        if (CodeChatResponseContent.is(content)) {
            // A mermaid block is rendered as a diagram rather than as its source (see MermaidPartRenderer), so its
            // source text is nowhere on screen: matches in it could be counted but never highlighted or revealed.
            // Other code parts are highlighted in their editor, by offsets into the code.
            return content.language?.toLowerCase() === MERMAID_LANGUAGE_ID ? undefined : content.code;
        }
        if (ErrorChatResponseContent.is(content)) {
            // Only the message of the headline; the highlighter scopes an error part to the same element.
            return ChatFindText.normalize(formatProviderError(content.error.message).message);
        }
        return undefined;
    }

    /** The text of `markdown` rendered the way `useMarkdownRendering` renders it, cached per `owner`. */
    protected getRenderedMarkdownText(owner: object, markdown: string, skipSurroundingParagraph: boolean, blockExternalResourceLoading: boolean): string {
        const cached = this.renderedTextCache.get(owner);
        if (cached?.source === markdown) {
            return cached.text;
        }
        const fragment = MarkdownRendering.renderToFragment(markdown, skipSurroundingParagraph, blockExternalResourceLoading);
        const text = ChatFindText.collect(fragment).text;
        this.renderedTextCache.set(owner, { source: markdown, text });
        return text;
    }
}
