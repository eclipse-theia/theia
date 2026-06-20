// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { expect } from 'chai';
import { isUsageResponsePart, LanguageModelStreamResponsePart, UserRequest } from '@theia/ai-core';
import { OpenAiModelUtils } from './openai-language-model';
import { OpenAiResponseApiUtils } from './openai-response-api-utils';

async function* toStream(events: unknown[]): AsyncIterable<unknown> {
    for (const event of events) {
        yield event;
    }
}

describe('OpenAiResponseApiUtils', () => {
    it('emits per-iteration usage for Response API tool calls instead of accumulated usage', async () => {
        const utils = new OpenAiResponseApiUtils();
        const streams = [
            [
                {
                    type: 'response.output_item.added',
                    item: {
                        id: 'item-1',
                        call_id: 'call-1',
                        type: 'function_call',
                        name: 'lookup',
                        arguments: '{"query":"test"}'
                    }
                },
                {
                    type: 'response.completed',
                    response: {
                        usage: {
                            input_tokens: 100,
                            output_tokens: 10
                        }
                    }
                }
            ],
            [
                {
                    type: 'response.output_text.delta',
                    delta: 'done'
                },
                {
                    type: 'response.completed',
                    response: {
                        usage: {
                            input_tokens: 200,
                            output_tokens: 20
                        }
                    }
                }
            ]
        ];
        const openai = {
            responses: {
                stream: () => toStream(streams.shift() ?? [])
            }
        };
        const request: UserRequest = {
            sessionId: 'session-1',
            requestId: 'request-1',
            messages: [{ actor: 'user', type: 'text', text: 'hello' }],
            tools: [{
                id: 'lookup',
                name: 'lookup',
                parameters: { type: 'object', properties: { query: { type: 'string' } } },
                handler: async () => 'result'
            }]
        };

        const response = await utils.handleRequest(
            openai as never,
            request,
            {},
            'gpt-5',
            new OpenAiModelUtils(),
            'developer',
            { maxChatCompletions: 3 },
            'openai/gpt-5',
            true
        );
        const parts: LanguageModelStreamResponsePart[] = [];
        if ('stream' in response) {
            for await (const part of response.stream) {
                parts.push(part);
            }
        }

        expect(parts.filter(isUsageResponsePart)).to.deep.equal([
            { input_tokens: 100, output_tokens: 10 },
            { input_tokens: 200, output_tokens: 20 }
        ]);
    });
});
