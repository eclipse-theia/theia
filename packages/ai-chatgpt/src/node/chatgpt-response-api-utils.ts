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

import { LanguageModelMessage } from '@theia/ai-core';
import { isObject } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { DeveloperMessageSettings } from '@theia/ai-openai/lib/node/openai-language-model';
import { OpenAiResponseApiUtils } from '@theia/ai-openai/lib/node/openai-response-api-utils';
import { OpenAI } from 'openai';
import type { ResponseCreateParamsStreaming, ResponseInputItem, ResponseStreamEvent } from 'openai/resources/responses/responses';

/** Used when a request carries no system message, which the ChatGPT endpoint rejects with `Instructions are required`. */
export const DEFAULT_CHATGPT_INSTRUCTIONS = 'You are a helpful assistant.';

/**
 * Adapts the OpenAI Response API request to the additional constraints of the ChatGPT endpoint.
 * Bound under its own symbol so the plain OpenAI models keep using {@link OpenAiResponseApiUtils}.
 */
@injectable()
export class ChatGptResponseApiUtils extends OpenAiResponseApiUtils {

    override readonly compactionProvider = 'chatgpt-responses';

    override async *streamResponse(openai: OpenAI, parameters: ResponseCreateParamsStreaming): AsyncIterable<ResponseStreamEvent> {
        // ChatGPT emits extra events such as response.metadata that the SDK's response accumulator rejects.
        const stream = await openai.responses.create(parameters);
        for await (const event of stream) {
            const streamEvent: { type: string; response_id?: unknown; sequence_number?: unknown; metadata?: unknown } = event;
            if (streamEvent.type === 'response.metadata') {
                this.logger.debug('ChatGPT response metadata:', {
                    responseId: typeof streamEvent.response_id === 'string' ? streamEvent.response_id.slice(0, 128) : undefined,
                    sequenceNumber: typeof streamEvent.sequence_number === 'number' ? streamEvent.sequence_number : undefined,
                    metadataKeys: isObject(streamEvent.metadata) && !Array.isArray(streamEvent.metadata)
                        ? Object.keys(streamEvent.metadata).slice(0, 10).map(key => key.slice(0, 128)) : []
                });
            }
            if (event.type === 'response.failed') {
                throw new Error(event.response.error?.message ?? 'ChatGPT response failed.');
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
