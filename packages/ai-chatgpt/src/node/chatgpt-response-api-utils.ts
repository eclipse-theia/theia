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

import { ChatGptAuthenticationMode } from '../common';
import { LanguageModelMessage } from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { DeveloperMessageSettings } from '@theia/ai-openai/lib/node/openai-language-model';
import { OpenAiResponseApiUtils } from '@theia/ai-openai/lib/node/openai-response-api-utils';
import type { ResponseInputItem, ResponseStreamEvent } from 'openai/resources/responses/responses';

/** Default instructions for requests without a system message. */
export const DEFAULT_CHATGPT_INSTRUCTIONS = 'You are a helpful assistant.';

/**
 * Adapts the shared Responses handling to the ChatGPT token-sharing connection.
 * Bound under its own symbol so the plain OpenAI models keep using {@link OpenAiResponseApiUtils}.
 */
@injectable()
export class ChatGptResponseApiUtils extends OpenAiResponseApiUtils {

    // Encrypted context from the legacy private endpoint must not reach the public API.
    override readonly compactionProvider: string = 'chatgpt-oss-responses';

    forAuthenticationMode(mode: ChatGptAuthenticationMode): ChatGptResponseApiUtils {
        // Request-local receiver retains injected dependencies without changing the shared singleton.
        return mode === 'oss' ? this : Object.assign(Object.create(this), { compactionProvider: 'chatgpt-responses' });
    }

    override async *streamWithReasoningSummaryFallback(
        settings: Record<string, unknown>,
        modelId: string,
        open: (settings: Record<string, unknown>) => AsyncIterable<ResponseStreamEvent>,
        cancellationToken?: CancellationToken
    ): AsyncIterable<ResponseStreamEvent> {
        for await (const event of super.streamWithReasoningSummaryFallback(settings, modelId, open, cancellationToken)) {
            if (event.type === 'response.failed' || event.type === 'response.incomplete') {
                const detail = event.type === 'response.failed' ? event.response.error?.code : event.response.incomplete_details?.reason;
                const code = typeof detail === 'string' && /^[a-z0-9_]{1,80}$/.test(detail) ? ` (${detail})` : '';
                throw new Error(`ChatGPT response ${event.type === 'response.failed' ? 'failed' : 'was incomplete'}${code}.`);
            }
            yield event;
        }
    }

    override processMessages(
        messages: LanguageModelMessage[],
        developerMessageSettings: DeveloperMessageSettings,
        model: string
    ): { instructions?: string; input: ResponseInputItem[] } {
        const processed = super.processMessages(messages, developerMessageSettings, model);
        return processed.instructions?.trim()
            ? processed
            : { ...processed, instructions: DEFAULT_CHATGPT_INSTRUCTIONS };
    }
}
