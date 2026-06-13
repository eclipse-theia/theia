// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { Anthropic } from '@anthropic-ai/sdk';
import { AnthropicModel } from '@theia/ai-anthropic/lib/node/anthropic-language-model';
import { addCacheControlToLastMessage, pruneOldHistoryTurns } from './qaap-anthropic-history';

let anthropicHistoryPatchApplied = false;

export function patchAnthropicModelForQaapHistory(): void {
    if (anthropicHistoryPatchApplied) {
        return;
    }
    anthropicHistoryPatchApplied = true;

    // Product-layer seam: override protected AnthropicModel hooks without forking ai-anthropic.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proto = AnthropicModel.prototype as any;

    proto.prepareStreamingAnthropicMessages = function (
        messages: Anthropic.Messages.MessageParam[],
        toolMessages?: readonly Anthropic.Messages.MessageParam[],
    ): Anthropic.Messages.MessageParam[] {
        return pruneOldHistoryTurns([...messages, ...(toolMessages ?? [])]);
    };

    proto.prepareNonStreamingAnthropicMessages = function (
        messages: Anthropic.Messages.MessageParam[],
    ): Anthropic.Messages.MessageParam[] {
        return pruneOldHistoryTurns(messages);
    };

    proto.applyAnthropicMessageCacheControl = function (
        messages: Anthropic.Messages.MessageParam[],
    ): Anthropic.Messages.MessageParam[] {
        return addCacheControlToLastMessage(messages);
    };
}

/** Visible for unit tests. */
export function resetAnthropicHistoryPatchForTests(): void {
    anthropicHistoryPatchApplied = false;
}
