// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { MutableChatModel, MutableChatRequestModel } from '@theia/ai-chat/lib/common/chat-model';
import { ParsedChatRequest, ParsedChatRequestTextPart } from '@theia/ai-chat/lib/common/parsed-chat-request';
import type { QaapAgentConversationDTO, QaapAgentMessageDTO } from '../common/qaap-agent-conversation-client';
import { isOpencodeAgent } from '../common/qaap-agent-task-client';
import { normalizeAgentMessageContentForDisplay } from '../common/qaap-agent-message-content';
import { parseOpencodeLog } from '../common/qaap-opencode-stream';
import { qaiqSegmentsToChatContents, syncAgentResponseContents } from './qaap-qaiq-chat-contents';

interface MessagePair {
    readonly user: QaapAgentMessageDTO;
    readonly agent?: QaapAgentMessageDTO;
}

/**
 * Mirrors a VPS {@link QaapAgentConversationDTO} into a Theia {@link MutableChatModel} so
 * {@link ChatViewWidget} uses the same tool/thinking renderers as Claude Code and Codex.
 */
export function syncBackendConversationToChatModel(
    conversation: QaapAgentConversationDTO,
    model: MutableChatModel,
    agentId: string,
): void {
    const pairs = pairConversationMessages(conversation.messages);

    // Conversation messages only ever append; fewer pairs than model entries means the caller
    // passed the wrong model (e.g. reused a model from a different conversation). Return early
    // so the caller can create a fresh model rather than leaving phantom requests behind.
    if (model.getRequests().length > pairs.length) {
        return;
    }

    while (model.getRequests().length < pairs.length) {
        const pair = pairs[model.getRequests().length];
        model.addRequest(parsePlainChatRequest(pair.user.content), agentId);
        const request = model.getRequests()[model.getRequests().length - 1];
        if (pair.agent) {
            applyAgentMessageToRequest(
                request,
                pair.agent,
                isStreamingAgentTurn(conversation, pair.agent),
                conversation,
            );
        }
    }

    const lastPair = pairs[pairs.length - 1];
    const lastRequest = model.getRequests()[model.getRequests().length - 1];
    if (lastPair?.agent && lastRequest) {
        applyAgentMessageToRequest(
            lastRequest,
            lastPair.agent,
            isStreamingAgentTurn(conversation, lastPair.agent),
            conversation,
        );
    }
}

/** QAIQ/OpenCode use stored segments; only OpenCode replays legacy formatted stdout. */
function resolveAgentMessageSegments(
    conversation: QaapAgentConversationDTO,
    message: QaapAgentMessageDTO,
): QaapAgentMessageDTO['segments'] {
    if (message.segments && message.segments.length > 0) {
        return message.segments;
    }
    if (message.role !== 'agent' || !isOpencodeAgent(conversation.agentId)) {
        return undefined;
    }
    const parsed = parseOpencodeLog(message.content);
    return parsed.segments.length > 0 ? parsed.segments : undefined;
}

function pairConversationMessages(messages: readonly QaapAgentMessageDTO[]): MessagePair[] {
    const pairs: MessagePair[] = [];
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        if (message.role !== 'user') {
            continue;
        }
        const next = messages[i + 1];
        pairs.push({
            user: message,
            agent: next?.role === 'agent' ? next : undefined,
        });
        if (next?.role === 'agent') {
            i++;
        }
    }
    return pairs;
}

function isStreamingAgentTurn(conversation: QaapAgentConversationDTO, agentMessage: QaapAgentMessageDTO): boolean {
    if (conversation.status !== 'streaming') {
        return false;
    }
    const last = conversation.messages[conversation.messages.length - 1];
    return last?.id === agentMessage.id;
}

function parsePlainChatRequest(text: string): ParsedChatRequest {
    const trimmed = normalizeAgentMessageContentForDisplay(text).trim();
    return {
        request: { text: trimmed },
        parts: [new ParsedChatRequestTextPart({ start: 0, endExclusive: trimmed.length }, trimmed)],
        toolRequests: new Map(),
        variables: [],
    };
}

function applyAgentMessageToRequest(
    request: MutableChatRequestModel,
    message: QaapAgentMessageDTO,
    streaming: boolean,
    conversation: QaapAgentConversationDTO,
): void {
    const contents = qaiqSegmentsToChatContents(
        resolveAgentMessageSegments(conversation, message),
        normalizeAgentMessageContentForDisplay(message.content),
    );
    const response = request.response.response;
    if (response.content.length === 0 && contents.length > 0) {
        response.addContents(contents);
        response.responseContentChanged();
    } else if (contents.length > 0) {
        if (syncAgentResponseContents(response, contents)) {
            response.responseContentChanged();
        }
    } else if (response.content.length > 0) {
        response.clearContent();
        response.responseContentChanged();
    }
    if (streaming) {
        return;
    }
    if (!request.response.isComplete) {
        request.response.complete();
    }
}
