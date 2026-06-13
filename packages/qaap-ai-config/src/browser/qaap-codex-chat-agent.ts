// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    MarkdownChatResponseContentImpl,
    MutableChatRequestModel,
    ThinkingChatResponseContentImpl,
} from '@theia/ai-chat';
import { CodexChatAgent } from '@theia/ai-codex/lib/browser/codex-chat-agent';
import type { ItemCompletedEvent, ItemUpdatedEvent, ThreadItem } from '@openai/codex-sdk';
import { injectable } from '@theia/core/shared/inversify';

const CODEX_STREAMED_TEXT_KEY = 'codexStreamedText';

type StreamedTextItem = Extract<ThreadItem, { type: 'agent_message' | 'reasoning' }>;

/**
 * Incremental Codex streaming: handles `item.updated` deltas without duplicating
 * full `item.completed` agent_message / reasoning content.
 */
@injectable()
export class QaapCodexChatAgent extends CodexChatAgent {

    protected getStreamedText(request: MutableChatRequestModel): Map<string, string> {
        let streamedText = request.getDataByKey(CODEX_STREAMED_TEXT_KEY) as Map<string, string> | undefined;
        if (!streamedText) {
            streamedText = new Map();
            request.addData(CODEX_STREAMED_TEXT_KEY, streamedText);
        }
        return streamedText;
    }

    protected appendStreamedTextDelta(item: StreamedTextItem, request: MutableChatRequestModel): void {
        const streamedText = this.getStreamedText(request);
        const previousText = streamedText.get(item.id) ?? '';
        if (item.text === previousText) {
            return;
        }

        const delta = item.text.startsWith(previousText)
            ? item.text.substring(previousText.length)
            : item.text;
        streamedText.set(item.id, item.text);

        if (!delta) {
            return;
        }

        if (item.type === 'agent_message') {
            request.response.response.addContent(new MarkdownChatResponseContentImpl(delta));
        } else {
            request.response.response.addContent(new ThinkingChatResponseContentImpl(delta, ''));
        }
    }

    protected override async handleItemUpdated(event: ItemUpdatedEvent, request: MutableChatRequestModel): Promise<void> {
        const item = event.item;
        if (item.type === 'agent_message' || item.type === 'reasoning') {
            this.appendStreamedTextDelta(item, request);
            return;
        }
        await super.handleItemUpdated(event, request);
    }

    protected override async handleItemCompleted(event: ItemCompletedEvent, request: MutableChatRequestModel): Promise<void> {
        const item = event.item;
        if (item.type === 'agent_message' || item.type === 'reasoning') {
            this.appendStreamedTextDelta(item, request);
            return;
        }
        await super.handleItemCompleted(event, request);
    }
}
