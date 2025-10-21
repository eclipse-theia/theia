// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { OpenAiModelUtils } from './openai-language-model';
import { LanguageModelMessage } from '@theia/ai-core';
import { OpenAiResponseApiUtils } from './openai-response-api-utils';

const utils = new OpenAiModelUtils();
const responseUtils = new OpenAiResponseApiUtils();

describe('OpenAiModelUtils - processMessages', () => {
    describe("when developerMessageSettings is 'skip'", () => {
        it('should remove all system messages', () => {
            const messages: LanguageModelMessage[] = [
                { actor: 'system', type: 'text', text: 'system message' },
                { actor: 'user', type: 'text', text: 'user message' },
                { actor: 'system', type: 'text', text: 'another system message' },
            ];
            const result = utils.processMessages(messages, 'skip', 'gpt-4');
            expect(result).to.deep.equal([
                { role: 'user', content: 'user message' }
            ]);
        });

        it('should do nothing if there is no system message', () => {
            const messages: LanguageModelMessage[] = [
                { actor: 'user', type: 'text', text: 'user message' },
                { actor: 'user', type: 'text', text: 'another user message' },
                { actor: 'ai', type: 'text', text: 'ai message' }
            ];
            const result = utils.processMessages(messages, 'skip', 'gpt-4');
            expect(result).to.deep.equal([
                { role: 'user', content: 'user message' },
                { role: 'user', content: 'another user message' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });
    });

    describe("when developerMessageSettings is 'mergeWithFollowingUserMessage'", () => {
        it('should merge the system message with the next user message, assign role user, and remove the system message', () => {
            const messages: LanguageModelMessage[] = [
                { actor: 'system', type: 'text', text: 'system msg' },
                { actor: 'user', type: 'text', text: 'user msg' },
                { actor: 'ai', type: 'text', text: 'ai message' }
            ];
            const result = utils.processMessages(messages, 'mergeWithFollowingUserMessage', 'gpt-4');
            expect(result).to.deep.equal([
                { role: 'user', content: 'system msg\nuser msg' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });

        it('should create a new user message if no user message exists, and remove the system message', () => {
            const messages: LanguageModelMessage[] = [
                { actor: 'system', type: 'text', text: 'system only msg' },
                { actor: 'ai', type: 'text', text: 'ai message' }
            ];
            const result = utils.processMessages(messages, 'mergeWithFollowingUserMessage', 'gpt-4');
            expect(result).to.deep.equal([
                { role: 'user', content: 'system only msg' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });

        it('should create a merge multiple system message with the next user message', () => {
            const messages: LanguageModelMessage[] = [
                { actor: 'user', type: 'text', text: 'user message' },
                { actor: 'system', type: 'text', text: 'system message' },
                { actor: 'system', type: 'text', text: 'system message2' },
                { actor: 'user', type: 'text', text: 'user message2' },
                { actor: 'ai', type: 'text', text: 'ai message' }
            ];
            const result = utils.processMessages(messages, 'mergeWithFollowingUserMessage', 'gpt-4');
            expect(result).to.deep.equal([
                { role: 'user', content: 'user message' },
                { role: 'user', content: 'system message\nsystem message2\nuser message2' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });

        it('should create a new user message from several system messages if the next message is not a user message', () => {
            const messages: LanguageModelMessage[] = [
                { actor: 'user', type: 'text', text: 'user message' },
                { actor: 'system', type: 'text', text: 'system message' },
                { actor: 'system', type: 'text', text: 'system message2' },
                { actor: 'ai', type: 'text', text: 'ai message' }
            ];
            const result = utils.processMessages(messages, 'mergeWithFollowingUserMessage', 'gpt-4');
            expect(result).to.deep.equal([
                { role: 'user', content: 'user message' },
                { role: 'user', content: 'system message\nsystem message2' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });
    });

    describe('when no special merging or skipping is needed', () => {
        it('should leave messages unchanged in ordering and assign roles based on developerMessageSettings', () => {
            const messages: LanguageModelMessage[] = [
                { actor: 'user', type: 'text', text: 'user message' },
                { actor: 'system', type: 'text', text: 'system message' },
                { actor: 'ai', type: 'text', text: 'ai message' }
            ];
            // Using a developerMessageSettings that is not merge/skip, e.g., 'developer'
            const result = utils.processMessages(messages, 'developer', 'gpt-4');
            expect(result).to.deep.equal([
                { role: 'user', content: 'user message' },
                { role: 'developer', content: 'system message' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });
    });

    describe('role assignment for system messages when developerMessageSettings is one of the role strings', () => {
        it('should assign role as specified for a system message when developerMessageSettings is "user"', () => {
            const messages: LanguageModelMessage[] = [
                { actor: 'system', type: 'text', text: 'system msg' },
                { actor: 'ai', type: 'text', text: 'ai msg' }
            ];
            // Since the first message is system and developerMessageSettings is not merge/skip, ordering is not adjusted
            const result = utils.processMessages(messages, 'user', 'gpt-4');
            expect(result).to.deep.equal([
                { role: 'user', content: 'system msg' },
                { role: 'assistant', content: 'ai msg' }
            ]);
        });

        it('should assign role as specified for a system message when developerMessageSettings is "system"', () => {
            const messages: LanguageModelMessage[] = [
                { actor: 'system', type: 'text', text: 'system msg' },
                { actor: 'ai', type: 'text', text: 'ai msg' }
            ];
            const result = utils.processMessages(messages, 'system', 'gpt-4');
            expect(result).to.deep.equal([
                { role: 'system', content: 'system msg' },
                { role: 'assistant', content: 'ai msg' }
            ]);
        });

        it('should assign role as specified for a system message when developerMessageSettings is "developer"', () => {
            const messages: LanguageModelMessage[] = [
                { actor: 'system', type: 'text', text: 'system msg' },
                { actor: 'user', type: 'text', text: 'user msg' },
                { actor: 'ai', type: 'text', text: 'ai msg' }
            ];
            const result = utils.processMessages(messages, 'developer', 'gpt-4');
            expect(result).to.deep.equal([
                { role: 'developer', content: 'system msg' },
                { role: 'user', content: 'user msg' },
                { role: 'assistant', content: 'ai msg' }
            ]);
        });
    });
});

describe('OpenAiModelUtils - processMessagesForResponseApi', () => {
    describe("when developerMessageSettings is 'skip'", () => {
        it('should remove all system messages and return no instructions', () => {
            const messages: LanguageModelMessage[] = [
                { actor: 'system', type: 'text', text: 'system message' },
                { actor: 'user', type: 'text', text: 'user message' },
                { actor: 'system', type: 'text', text: 'another system message' },
            ];
            const result = responseUtils.processMessages(messages, 'skip', 'gpt-4');
            expect(result.instructions).to.be.undefined;
            expect(result.input).to.deep.equal([
                {
                    type: 'message',
                    role: 'user',
                    content: [{ type: 'input_text', text: 'user message' }]
                }
            ]);
        });
    });

    describe("when developerMessageSettings is 'mergeWithFollowingUserMessage'", () => {
        it('should merge system message with user message and return no instructions', () => {
            const messages: LanguageModelMessage[] = [
                { actor: 'system', type: 'text', text: 'system msg' },
                { actor: 'user', type: 'text', text: 'user msg' },
                { actor: 'ai', type: 'text', text: 'ai message' }
            ];
            const result = responseUtils.processMessages(messages, 'mergeWithFollowingUserMessage', 'gpt-4');
            expect(result.instructions).to.be.undefined;
            expect(result.input).to.have.lengthOf(2);
            expect(result.input[0]).to.deep.equal({
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: 'system msg\nuser msg' }]
            });
            const assistantMessage = result.input[1];
            expect(assistantMessage).to.deep.include({
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [{ type: 'output_text', text: 'ai message', annotations: [] }]
            });
            if (assistantMessage.type === 'message' && 'id' in assistantMessage) {
                expect(assistantMessage.id).to.be.a('string').and.to.match(/^msg_/);
            } else {
                throw new Error('Expected assistant message to have an id');
            }
        });
    });

    describe('when system messages should be converted to instructions', () => {
        it('should extract system messages as instructions and convert other messages to input items', () => {
            const messages: LanguageModelMessage[] = [
                { actor: 'system', type: 'text', text: 'You are a helpful assistant' },
                { actor: 'user', type: 'text', text: 'Hello!' },
                { actor: 'ai', type: 'text', text: 'Hi there!' }
            ];
            const result = responseUtils.processMessages(messages, 'developer', 'gpt-4');
            expect(result.instructions).to.equal('You are a helpful assistant');
            expect(result.input).to.have.lengthOf(2);
            expect(result.input[0]).to.deep.equal({
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: 'Hello!' }]
            });
            const assistantMessage = result.input[1];
            expect(assistantMessage).to.deep.include({
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [{ type: 'output_text', text: 'Hi there!', annotations: [] }]
            });
            if (assistantMessage.type === 'message' && 'id' in assistantMessage) {
                expect(assistantMessage.id).to.be.a('string').and.to.match(/^msg_/);
            } else {
                throw new Error('Expected assistant message to have an id');
            }
        });

        it('should combine multiple system messages into instructions', () => {
            const messages: LanguageModelMessage[] = [
                { actor: 'system', type: 'text', text: 'You are helpful' },
                { actor: 'system', type: 'text', text: 'Be concise' },
                { actor: 'user', type: 'text', text: 'What is 2+2?' }
            ];
            const result = responseUtils.processMessages(messages, 'developer', 'gpt-4');
            expect(result.instructions).to.equal('You are helpful\nBe concise');
            expect(result.input).to.deep.equal([
                {
                    type: 'message',
                    role: 'user',
                    content: [{ type: 'input_text', text: 'What is 2+2?' }]
                }
            ]);
        });
    });

    describe('tool use and tool result messages', () => {
        it('should convert tool use messages to function calls', () => {
            const messages: LanguageModelMessage[] = [
                { actor: 'user', type: 'text', text: 'Calculate 2+2' },
                {
                    actor: 'ai',
                    type: 'tool_use',
                    id: 'call_123',
                    name: 'calculator',
                    input: { expression: '2+2' }
                }
            ];
            const result = responseUtils.processMessages(messages, 'developer', 'gpt-4');
            expect(result.input).to.deep.equal([
                {
                    type: 'message',
                    role: 'user',
                    content: [{ type: 'input_text', text: 'Calculate 2+2' }]
                },
                {
                    type: 'function_call',
                    call_id: 'call_123',
                    name: 'calculator',
                    arguments: '{"expression":"2+2"}'
                }
            ]);
        });

        it('should convert tool result messages to function call outputs', () => {
            const messages: LanguageModelMessage[] = [
                {
                    actor: 'user',
                    type: 'tool_result',
                    name: 'calculator',
                    tool_use_id: 'call_123',
                    content: '4'
                }
            ];
            const result = responseUtils.processMessages(messages, 'developer', 'gpt-4');
            expect(result.input).to.deep.equal([
                {
                    type: 'function_call_output',
                    call_id: 'call_123',
                    output: '4'
                }
            ]);
        });

        it('should stringify non-string tool result content', () => {
            const messages: LanguageModelMessage[] = [
                {
                    actor: 'user',
                    type: 'tool_result',
                    name: 'data_processor',
                    tool_use_id: 'call_456',
                    content: { result: 'success', data: [1, 2, 3] }
                }
            ];
            const result = responseUtils.processMessages(messages, 'developer', 'gpt-4');
            expect(result.input).to.deep.equal([
                {
                    type: 'function_call_output',
                    call_id: 'call_456',
                    output: '{"result":"success","data":[1,2,3]}'
                }
            ]);
        });
    });

    describe('image messages', () => {
        it('should convert base64 image messages to input image items', () => {
            const messages: LanguageModelMessage[] = [
                {
                    actor: 'user',
                    type: 'image',
                    image: {
                        mimeType: 'image/png',
                        base64data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
                    }
                }
            ];
            const result = responseUtils.processMessages(messages, 'developer', 'gpt-4');
            expect(result.input).to.deep.equal([
                {
                    type: 'message',
                    role: 'user',
                    content: [{
                        type: 'input_image',
                        detail: 'auto',
                        image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
                    }]
                }
            ]);
        });

        it('should convert URL image messages to input image items', () => {
            const messages: LanguageModelMessage[] = [
                {
                    actor: 'user',
                    type: 'image',
                    image: {
                        url: 'https://example.com/image.png'
                    }
                }
            ];
            const result = responseUtils.processMessages(messages, 'developer', 'gpt-4');
            expect(result.input).to.deep.equal([
                {
                    type: 'message',
                    role: 'user',
                    content: [{
                        type: 'input_image',
                        detail: 'auto',
                        image_url: 'https://example.com/image.png'
                    }]
                }
            ]);
        });
    });

    describe('error handling', () => {
        it('should throw error for unknown message types', () => {
            const invalidMessage = {
                actor: 'user',
                type: 'unknown_type',
                someProperty: 'value'
            };
            const messages = [invalidMessage] as unknown as LanguageModelMessage[];
            expect(() => responseUtils.processMessages(messages, 'developer', 'gpt-4'))
                .to.throw('unhandled case');
        });
    });
});
