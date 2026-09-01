// *****************************************************************************
// Copyright (C) 2025 TypeFox GmbH and others.
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

import { ToolCall, ToolCallExecutor, ToolCallExecutorImpl, ToolInvocationContext, ToolRequest } from '@theia/ai-core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { Container, injectable } from '@theia/core/shared/inversify';
import { CancellationToken, CancellationTokenSource, ILogger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { OllamaModel, OllamaModelParams } from './node/ollama-language-model';
import { Tool } from 'ollama';
import { expect } from 'chai';
import * as sinon from 'sinon';

describe('ai-ollama package', () => {

    it('Transform to Ollama tools', () => {
        const req: ToolRequest = createToolRequest();
        const model = createModel();
        const ollamaTool = model.toOllamaTool(req);

        expect(ollamaTool.function.name).equals('example-tool');
        expect(ollamaTool.function.description).equals('Example Tool');
        expect(ollamaTool.function.parameters?.type).equal('object');
        expect(ollamaTool.function.parameters?.properties).to.deep.equal(req.parameters.properties);
        expect(ollamaTool.function.parameters?.required).to.deep.equal(['question']);
    });

    it('executes tool calls of a turn concurrently and preserves input order', async () => {
        const model = createModel();
        // `a` only completes once `b` has started: a sequential implementation would deadlock here.
        const bStarted = new Deferred<void>();
        const chatRequest = {
            messages: [],
            tools: [
                { function: { name: 'a' }, handler: async () => { await bStarted.promise; return 'a-result'; } },
                { function: { name: 'b' }, handler: async () => { bStarted.resolve(); return 'b-result'; } }
            ]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        const toolCalls: ToolCall[] = [
            { id: '1', function: { name: 'a', arguments: '{}' } },
            { id: '2', function: { name: 'b', arguments: '{}' } }
        ];

        const result = await model.runProcessToolCalls(toolCalls, chatRequest);

        expect(result.map(r => r.result)).to.deep.equal(['a-result', 'b-result']);
        expect(chatRequest.messages.map((m: { content: string }) => m.content)).to.deep.equal([
            'Tool call a returned: a-result',
            'Tool call b returned: b-result'
        ]);
    });

    it('reports a missing tool with the legacy error string', async () => {
        const model = createModel();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chatRequest = { messages: [], tools: [] } as any;
        const result = await model.runProcessToolCalls([{ id: '1', function: { name: 'missing', arguments: '{}' } }], chatRequest);
        expect(result[0].result).to.equal('error: Tool not found');
    });

    it('forwards the request cancellation token into the tool invocation context', async () => {
        const model = createModel();
        const source = new CancellationTokenSource();
        let observedToken: CancellationToken | undefined;
        const chatRequest = {
            messages: [],
            tools: [{
                function: { name: 'a' },
                handler: async (_argString: string, ctx?: ToolInvocationContext) => {
                    observedToken = ToolInvocationContext.getCancellationToken(ctx);
                    return 'a-result';
                }
            }]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        const toolCalls: ToolCall[] = [{ id: '1', function: { name: 'a', arguments: '{}' } }];

        await model.runProcessToolCalls(toolCalls, chatRequest, source.token);

        expect(observedToken).to.equal(source.token);
    });
});

function createModel(): OllamaModelUnderTest {
    const parent = new Container();
    parent.bind(ToolCallExecutor).to(ToolCallExecutorImpl);
    parent.bind(ILogger).to(MockLogger);
    parent.bind(OllamaModelUnderTest).toSelf().inTransientScope();

    const child = new Container();
    child.parent = parent;
    child.bind(OllamaModelParams).toConstantValue({
        id: 'id',
        model: 'model',
        status: { status: 'ready' },
        host: () => ''
    });
    return child.get(OllamaModelUnderTest);
}

@injectable()
class OllamaModelUnderTest extends OllamaModel {
    override toOllamaTool(tool: ToolRequest): Tool & { handler: (arg_string: string, ctx?: ToolInvocationContext) => Promise<unknown> } {
        return super.toOllamaTool(tool);
    }

    // Exposes the protected processToolCalls for testing concurrent tool execution and cancellation forwarding.
    runProcessToolCalls(toolCalls: ToolCall[], chatRequest: unknown, cancellation?: CancellationToken): Promise<ToolCall[]> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.processToolCalls(toolCalls, chatRequest as any, cancellation);
    }
}
function createToolRequest(): ToolRequest {
    return {
        id: 'tool-1',
        name: 'example-tool',
        description: 'Example Tool',
        parameters: {
            type: 'object',
            properties: {
                question: {
                    type: 'string',
                    description: 'What is the best pizza topping?'
                },
                optional: {
                    type: 'string',
                    description: 'Optional parameter'
                }
            },
            required: ['question']
        },
        handler: sinon.stub()
    };
}
