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
import { CompactionMessage, isCompactionResponsePart, isUsageResponsePart, LanguageModelMessage, LanguageModelStreamResponsePart, UserRequest } from '@theia/ai-core';
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

    it('yields a compaction part when the stream contains a response.output_item.done compaction event', async () => {
        const utils = new OpenAiResponseApiUtils();
        const streamEvents = [
            {
                type: 'response.output_item.done',
                item: { type: 'compaction', id: 'c1', encrypted_content: 'enc1' }
            } as never,
            {
                type: 'response.completed',
                response: { usage: { input_tokens: 10, output_tokens: 5 } }
            } as never
        ];
        const openai = {
            responses: {
                stream: () => toStream(streamEvents)
            }
        };
        const request: UserRequest = {
            sessionId: 'session-1',
            requestId: 'request-1',
            messages: [{ actor: 'user', type: 'text', text: 'hello' }]
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

        const compactionParts = parts.filter(isCompactionResponsePart);
        expect(compactionParts).to.have.length(1);
        expect(compactionParts[0]).to.deep.equal({
            compaction: {
                provider: 'openai-responses',
                data: { id: 'c1', encrypted_content: 'enc1' }
            }
        });
    });

    describe('processMessages server-side compaction replay', () => {

        function userMessage(text: string): LanguageModelMessage {
            return { actor: 'user', type: 'text', text };
        }

        function aiMessage(text: string): LanguageModelMessage {
            return { actor: 'ai', type: 'text', text };
        }

        function compactionMessage(provider: string, encrypted: string, id?: string): CompactionMessage {
            return { actor: 'ai', type: 'compaction', provider, data: { encrypted_content: encrypted, id } };
        }

        function textOf(input: ReturnType<OpenAiResponseApiUtils['processMessages']>['input']): string {
            return JSON.stringify(input);
        }

        function findCompactionItem(input: ReturnType<OpenAiResponseApiUtils['processMessages']>['input']): { type: string; encrypted_content: string } | undefined {
            return input.find((item): item is { type: 'compaction'; encrypted_content: string } =>
                (item as { type?: string }).type === 'compaction') as { type: string; encrypted_content: string } | undefined;
        }

        it('replays the openai-responses compaction marker and drops the prefix before it', () => {
            const utils = new OpenAiResponseApiUtils();
            const messages: LanguageModelMessage[] = [
                userMessage('user A'),
                aiMessage('ai B'),
                compactionMessage('openai-responses', 'enc1'),
                userMessage('user C')
            ];

            const { input } = utils.processMessages(messages, 'developer', 'gpt-5');

            const compaction = findCompactionItem(input);
            expect(compaction, 'compaction item present').to.not.equal(undefined);
            expect(compaction!.encrypted_content).to.equal('enc1');
            expect(input[0]).to.deep.include({ type: 'compaction', encrypted_content: 'enc1' });

            const serialized = textOf(input);
            expect(serialized).to.contain('user C');
            expect(serialized).to.not.contain('user A');
            expect(serialized).to.not.contain('ai B');
        });

        it('only replays the LAST openai-responses marker and drops everything before it', () => {
            const utils = new OpenAiResponseApiUtils();
            const messages: LanguageModelMessage[] = [
                userMessage('user A'),
                compactionMessage('openai-responses', 'enc1'),
                userMessage('user B'),
                compactionMessage('openai-responses', 'enc2'),
                userMessage('user C')
            ];

            const { input } = utils.processMessages(messages, 'developer', 'gpt-5');

            const compactionItems = input.filter(item => (item as { type?: string }).type === 'compaction');
            expect(compactionItems).to.have.length(1);
            expect((compactionItems[0] as { encrypted_content: string }).encrypted_content).to.equal('enc2');

            const serialized = textOf(input);
            expect(serialized).to.contain('user C');
            expect(serialized).to.not.contain('user A');
            expect(serialized).to.not.contain('user B');
            expect(serialized).to.not.contain('enc1');
        });

        it('skips a foreign-provider compaction marker without dropping the prefix', () => {
            const utils = new OpenAiResponseApiUtils();
            const messages: LanguageModelMessage[] = [
                userMessage('user A'),
                compactionMessage('anthropic', 'enc1'),
                userMessage('user B')
            ];

            const { input } = utils.processMessages(messages, 'developer', 'gpt-5');

            expect(findCompactionItem(input), 'no compaction item for foreign provider').to.equal(undefined);
            const serialized = textOf(input);
            expect(serialized).to.contain('user A');
            expect(serialized).to.contain('user B');
            expect(serialized).to.not.contain('enc1');
        });

        it('converts all messages unchanged when there is no compaction marker', () => {
            const utils = new OpenAiResponseApiUtils();
            const messages: LanguageModelMessage[] = [userMessage('user A'), aiMessage('ai B'), userMessage('user C')];

            const { input } = utils.processMessages(messages, 'developer', 'gpt-5');

            expect(findCompactionItem(input)).to.equal(undefined);
            const serialized = textOf(input);
            expect(serialized).to.contain('user A');
            expect(serialized).to.contain('ai B');
            expect(serialized).to.contain('user C');
        });
    });
});
