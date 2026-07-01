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

import { expect } from 'chai';
import { Container, injectable } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { LanguageModelMessage, LanguageModelRequest, ToolCallExecutor, ToolCallExecutorImpl } from '@theia/ai-core';
import { ChatCompletionStreamingAsyncIteratorFactory } from '@theia/ai-openai/lib/node/openai-chat-completion-stream';
import { ChatCompletionMessageParam } from 'openai/resources';
import { CopilotLanguageModel, CopilotLanguageModelParams } from './copilot-language-model';

@injectable()
class TestableCopilotLanguageModel extends CopilotLanguageModel {
    public callProcessMessages(messages: LanguageModelMessage[]): ChatCompletionMessageParam[] {
        return this.processMessages(messages);
    }

    public callCreateTools(request: LanguageModelRequest): unknown {
        return this.createTools(request);
    }
}

function createModel(): TestableCopilotLanguageModel {
    const parent = new Container();
    parent.bind(ToolCallExecutor).to(ToolCallExecutorImpl);
    parent.bind(ILogger).to(MockLogger);
    // These tests never issue a streaming request, so the iterator factory is never invoked.
    const iteratorFactory: ChatCompletionStreamingAsyncIteratorFactory = () => { throw new Error('iterator not used in these tests'); };
    parent.bind(ChatCompletionStreamingAsyncIteratorFactory).toConstantValue(iteratorFactory);
    parent.bind(TestableCopilotLanguageModel).toSelf().inTransientScope();

    const child = new Container();
    child.parent = parent;
    child.bind(CopilotLanguageModelParams).toConstantValue({
        id: 'test-id',
        model: 'test-model',
        status: { status: 'ready' },
        enableStreaming: true,
        supportsStructuredOutput: false,
        maxRetries: 3,
        accessTokenProvider: async () => 'test-token',
        enterpriseUrlProvider: () => undefined,
        userAgentProvider: () => 'test-user-agent'
    });
    return child.get(TestableCopilotLanguageModel);
}

describe('CopilotLanguageModel - processMessages', () => {
    const model = createModel();

    it('should merge an assistant text message followed by an assistant tool_use into a single message', () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'user', type: 'text', text: 'do something' },
            { actor: 'ai', type: 'text', text: 'let me call a tool' },
            { actor: 'ai', type: 'tool_use', id: 'call_1', name: 'foo', input: { x: 1 } }
        ];
        const result = model.callProcessMessages(messages);
        expect(result).to.deep.equal([
            { role: 'user', content: 'do something' },
            {
                role: 'assistant',
                content: 'let me call a tool',
                tool_calls: [{ id: 'call_1', function: { name: 'foo', arguments: JSON.stringify({ x: 1 }) }, type: 'function' }]
            }
        ]);
    });

    it('should merge multiple parallel assistant tool_use messages', () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'user', type: 'text', text: 'do parallel work' },
            { actor: 'ai', type: 'tool_use', id: 'call_1', name: 'foo', input: { x: 1 } },
            { actor: 'ai', type: 'tool_use', id: 'call_2', name: 'bar', input: { y: 2 } }
        ];
        const result = model.callProcessMessages(messages);
        expect(result).to.deep.equal([
            { role: 'user', content: 'do parallel work' },
            {
                role: 'assistant',
                tool_calls: [
                    { id: 'call_1', function: { name: 'foo', arguments: JSON.stringify({ x: 1 }) }, type: 'function' },
                    { id: 'call_2', function: { name: 'bar', arguments: JSON.stringify({ y: 2 }) }, type: 'function' }
                ]
            }
        ]);
    });

    it('should reproduce the bug scenario from issue #17104', () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'user', type: 'text', text: 'first request' },
            { actor: 'ai', type: 'tool_use', id: 'call_1', name: 'foo', input: {} },
            { actor: 'user', type: 'tool_result', tool_use_id: 'call_1', name: 'foo', content: 'result_1' },
            { actor: 'ai', type: 'text', text: 'follow-up reasoning' },
            { actor: 'ai', type: 'tool_use', id: 'call_2', name: 'bar', input: {} }
        ];
        const result = model.callProcessMessages(messages);
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].role === 'assistant' && result[i].role === 'assistant').to.equal(false);
        }
        expect(result).to.have.lengthOf(4);
    });

    it('should leave non-adjacent assistant messages separate', () => {
        const messages: LanguageModelMessage[] = [
            { actor: 'ai', type: 'tool_use', id: 'call_1', name: 'foo', input: {} },
            { actor: 'user', type: 'tool_result', tool_use_id: 'call_1', name: 'foo', content: 'r' },
            { actor: 'ai', type: 'text', text: 'final answer' }
        ];
        const result = model.callProcessMessages(messages);
        expect(result).to.have.lengthOf(3);
        expect(result[2]).to.deep.equal({ role: 'assistant', content: 'final answer' });
    });
});

describe('CopilotLanguageModel - createTools', () => {
    it('produces plain function tool definitions without an embedded handler function', () => {
        const model = createModel();
        const tools = model.callCreateTools({
            messages: [],
            tools: [{ id: 't', name: 't', parameters: { type: 'object', properties: {} }, handler: async () => 'x' }]
        }) as Array<{ type: string; function: Record<string, unknown> }>;

        expect(tools).to.have.lengthOf(1);
        expect(tools[0].type).to.equal('function');
        expect(tools[0].function.name).to.equal('t');
        // The SDK runTools() runner is no longer used, so no executable function is embedded.
        expect('function' in tools[0].function).to.equal(false);
    });
});
