// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    isLanguageModelStreamResponsePart,
    isTextResponsePart,
    LanguageModelStreamResponse,
    LanguageModelStreamResponsePart,
} from '@theia/ai-core/lib/common';
import { isArray } from '@theia/core/lib/common/types';
import { AbstractStreamParsingChatAgent } from '@theia/ai-chat/lib/common/chat-agents';
import {
    ChatResponseContent,
    MarkdownChatResponseContent,
    MarkdownChatResponseContentImpl,
    MutableChatRequestModel,
} from '@theia/ai-chat/lib/common/chat-model';
import { syncStreamResponseContents } from '@theia/qaap-mobile-shell/lib/common/qaap-sync-stream-response-contents';

export interface QaapStreamParsingAgentHost {
    parseContents(text: string, request: MutableChatRequestModel): ChatResponseContent[];
    parse(token: LanguageModelStreamResponsePart, request: MutableChatRequestModel): ChatResponseContent | ChatResponseContent[];
}

/** Matches fenced-code openers that require {@link parseContents} during streaming. */
const STREAM_STRUCTURED_PARSE_PATTERN = /(^|\n)\s{0,3}(?:`{3,}|~{3,})/m;

let incrementalStreamPatchApplied = false;

export function streamBufferNeedsStructuredParse(text: string): boolean {
    return STREAM_STRUCTURED_PARSE_PATTERN.test(text);
}

export function patchAbstractStreamParsingChatAgentForIncrementalParse(): void {
    if (incrementalStreamPatchApplied) {
        return;
    }
    incrementalStreamPatchApplied = true;
    // Product-layer seam: patch protected streaming hook without forking upstream ai-chat.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (AbstractStreamParsingChatAgent.prototype as any).addStreamResponse = async function (
        this: AbstractStreamParsingChatAgent,
        languageModelResponse: LanguageModelStreamResponse,
        request: MutableChatRequestModel,
    ): Promise<void> {
        const host: QaapStreamParsingAgentHost = {
            parseContents: (text, req) => this.parseContents(text, req),
            parse: (token, req) => this.parse(token, req),
        };
        await consumeIncrementalLanguageModelStream(host, languageModelResponse, request);
    };
}

/**
 * Streaming loop compatible with upstream {@link AbstractStreamParsingChatAgent#addStreamResponse}
 * but appends plain markdown tokens in O(1) instead of re-parsing the full buffer every token.
 */
export async function consumeIncrementalLanguageModelStream(
    agent: QaapStreamParsingAgentHost,
    languageModelResponse: LanguageModelStreamResponse,
    request: MutableChatRequestModel,
): Promise<void> {
    let completeTextBuffer = '';
    let startIndex = request.response.response.content.length;
    let parseCalls = 0;

    for await (const token of languageModelResponse.stream) {
        if (!isLanguageModelStreamResponsePart(token)) {
            continue;
        }
        const newContent = agent.parse(token, request);
        if (!isTextResponsePart(token)) {
            if (isArray(newContent)) {
                request.response.response.addContents(newContent);
            } else if (newContent) {
                request.response.response.addContent(newContent);
            }
            startIndex = request.response.response.content.length;
            completeTextBuffer = '';
            continue;
        }

        completeTextBuffer += token.content;
        if (tryAppendIncrementalMarkdownToken(request, startIndex, token.content, completeTextBuffer)) {
            continue;
        }

        parseCalls++;
        const parsedContents = agent.parseContents(completeTextBuffer, request);
        syncStreamResponseContents(request.response.response, startIndex, parsedContents);
    }

    if (completeTextBuffer.length > 0) {
        parseCalls++;
        const parsedContents = agent.parseContents(completeTextBuffer, request);
        syncStreamResponseContents(request.response.response, startIndex, parsedContents);
    }

    recordIncrementalParseStats(parseCalls, completeTextBuffer.length);
}

function tryAppendIncrementalMarkdownToken(
    request: MutableChatRequestModel,
    startIndex: number,
    tokenDelta: string,
    completeTextBuffer: string,
): boolean {
    if (streamBufferNeedsStructuredParse(completeTextBuffer)) {
        return false;
    }
    const response = request.response.response;
    const slice = response.content.slice(startIndex);
    if (slice.length === 0) {
        response.addContent(new MarkdownChatResponseContentImpl(tokenDelta));
        response.responseContentChanged();
        return true;
    }
    if (slice.length === 1 && MarkdownChatResponseContent.is(slice[0])) {
        slice[0].merge(new MarkdownChatResponseContentImpl(tokenDelta));
        response.responseContentChanged();
        return true;
    }
    return false;
}

function recordIncrementalParseStats(parseCalls: number, charCount: number): void {
    if (parseCalls === 0 || charCount === 0) {
        return;
    }
    if (typeof localStorage === 'undefined') {
        return;
    }
    try {
        if (localStorage.getItem('qaap.streamMetrics') !== '1') {
            return;
        }
    } catch {
        return;
    }
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug(`[Qaap incremental stream parse] parseCalls=${parseCalls} chars=${charCount}`);
    }
}

/** Visible for unit tests. */
export function resetIncrementalStreamPatchForTests(): void {
    incrementalStreamPatchApplied = false;
}
