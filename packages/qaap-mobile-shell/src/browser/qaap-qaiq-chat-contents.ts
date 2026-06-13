// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    ChatResponseContent,
    MarkdownChatResponseContentImpl,
    MutableChatResponseModel,
    ThinkingChatResponseContentImpl,
} from '@theia/ai-chat/lib/common/chat-model';
import { syncStreamResponseContents } from '../common/qaap-sync-stream-response-contents';
import { ClaudeCodeToolCallChatResponseContent } from '@theia/ai-claude-code/lib/browser/claude-code-tool-call-content';
import { QaapAgentMessageSegment, normalizeQaiqToolName } from '../common/qaap-qaiq-stream';
import type { QaapAgentMessageSegmentDTO } from '../common/qaap-agent-conversation-client';

/** Map QAIQ stream segments to chat parts rendered by Claude Code / Codex-style UI. */
export function qaiqSegmentsToChatContents(
    segments: ReadonlyArray<QaapAgentMessageSegment | QaapAgentMessageSegmentDTO> | undefined,
    fallbackText: string,
): ChatResponseContent[] {
    if (segments && segments.length > 0) {
        const contents: ChatResponseContent[] = [];
        for (const segment of segments) {
            if (segment.type === 'text' && segment.content.trim()) {
                contents.push(new MarkdownChatResponseContentImpl(segment.content));
            } else if (segment.type === 'thinking' && segment.content.trim()) {
                contents.push(new ThinkingChatResponseContentImpl(segment.content, ''));
            } else if (segment.type === 'tool') {
                contents.push(new ClaudeCodeToolCallChatResponseContent(
                    segment.toolUseId,
                    normalizeQaiqToolName(segment.name),
                    segment.args,
                    segment.finished,
                    segment.result,
                ));
            }
        }
        if (contents.length > 0) {
            return contents;
        }
    }
    const text = fallbackText.trim();
    return text ? [new MarkdownChatResponseContentImpl(text)] : [];
}

/**
 * Update chat response parts in place so collapsible tool UI keeps expand state while streaming.
 *
 * Accepts {@link MutableChatResponseModel}'s `response` property directly so the type is derived
 * from the exported class rather than cast from the narrower {@link ChatResponse} interface.
 * A rename or removal of the mutation methods on the upstream class will surface as a compile error.
 */
export function syncAgentResponseContents(
    response: MutableChatResponseModel['response'],
    nextContents: ChatResponseContent[],
): boolean {
    return syncStreamResponseContents(response, 0, nextContents);
}
