// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    ChatResponse,
    ChatResponseContent,
    MarkdownChatResponseContentImpl,
    ThinkingChatResponseContentImpl,
    ToolCallChatResponseContent,
} from '@theia/ai-chat/lib/common/chat-model';
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

/** Runtime {@link ChatResponse} on in-flight agent turns (not exported from ai-chat). */
interface QaapMutableChatResponse extends ChatResponse {
    addContent(nextContent: ChatResponseContent): void;
    addContents(contents: ChatResponseContent[]): void;
    clearContent(): void;
    responseContentChanged(): void;
}

/** Update chat response parts in place so collapsible tool UI keeps expand state while streaming. */
export function syncAgentResponseContents(
    response: ChatResponse,
    nextContents: ChatResponseContent[],
): boolean {
    const mutable = response as QaapMutableChatResponse;
    const existing = mutable.content;
    let changed = false;
    for (let i = 0; i < nextContents.length; i++) {
        const next = nextContents[i];
        if (i >= existing.length) {
            mutable.addContent(next);
            changed = true;
            continue;
        }
        const current = existing[i];
        if (next.kind === 'markdownContent' && current.kind === 'markdownContent') {
            const nextText = (next as MarkdownChatResponseContentImpl).content.value;
            const curText = (current as MarkdownChatResponseContentImpl).content.value;
            if (nextText.length > curText.length) {
                (current as MarkdownChatResponseContentImpl).merge(
                    new MarkdownChatResponseContentImpl(nextText.slice(curText.length)),
                );
                changed = true;
            }
        } else if (next.kind === 'thinking' && current.kind === 'thinking') {
            const nextThink = (next as ThinkingChatResponseContentImpl).content;
            const curThink = (current as ThinkingChatResponseContentImpl).content;
            if (nextThink.length > curThink.length) {
                (current as ThinkingChatResponseContentImpl).merge(
                    new ThinkingChatResponseContentImpl(nextThink.slice(curThink.length), ''),
                );
                changed = true;
            }
        } else if (ToolCallChatResponseContent.is(next) && ToolCallChatResponseContent.is(current)) {
            if (next.id && next.id === current.id) {
                const before = JSON.stringify(current);
                current.merge(next);
                if (JSON.stringify(current) !== before) {
                    changed = true;
                }
            } else {
                mutable.clearContent();
                mutable.addContents(nextContents);
                return true;
            }
        } else {
            mutable.clearContent();
            mutable.addContents(nextContents);
            return true;
        }
    }
    return changed;
}
