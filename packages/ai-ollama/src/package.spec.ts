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
        expect(ollamaTool.function.parameters?.properties).to.deep.equal({
            question: { type: 'string', description: 'What is the best pizza topping?' },
            optional: { type: 'string', description: 'Optional parameter' }
        });
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

    it('resolves anyOf directly on an items schema', () => {
        const model = createModel();
        const result = model.toOllamaTool(createToolRequest({
            tags: { type: 'array', description: 'list of tags', items: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'a tag' } }
        }));
        const tags = result.function.parameters!.properties!['tags'] as Record<string, unknown>;
        expect(tags['items']).to.deep.equal({ type: 'string', description: 'a tag' });
    });

    it('passes enum values through to output', () => {
        const model = createModel();
        const result = model.toOllamaTool(createToolRequest({
            status: { type: 'string', description: 'task status', enum: ['pending', 'in-progress', 'done'] }
        }));
        const status = result.function.parameters!.properties!['status'] as Record<string, unknown>;
        expect(status['enum']).to.deep.equal(['pending', 'in-progress', 'done']);
    });

    it('passes required and nested properties through array items (todoWrite schema)', () => {
        const model = createModel();
        const result = model.toOllamaTool(createToolRequest({
            todos: {
                type: 'array',
                description: 'The updated todo list.',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: 'unique id' },
                        text: { type: 'string', description: 'todo text' },
                        done: { type: 'boolean', description: 'completion flag' }
                    },
                    required: ['id', 'text', 'done']
                }
            }
        }));
        const todos = result.function.parameters!.properties!['todos'] as Record<string, unknown>;
        const items = todos['items'] as Record<string, unknown>;
        expect(items['required']).to.deep.equal(['id', 'text', 'done']);
        expect(items['properties']).to.deep.equal({
            id: { type: 'string', description: 'unique id' },
            text: { type: 'string', description: 'todo text' },
            done: { type: 'boolean', description: 'completion flag' }
        });
    });

    it('passes through a type-less property unchanged', () => {
        const model = createModel();
        const result = model.toOllamaTool(createToolRequest({
            status: { enum: ['a', 'b'], description: 'no explicit type' }
        }));
        const status = result.function.parameters!.properties!['status'] as Record<string, unknown>;
        expect(status['enum']).to.deep.equal(['a', 'b']);
        expect(status['description']).to.equal('no explicit type');
    });

    it('resolves anyOf on a top-level property preserving branch content', () => {
        const model = createModel();
        const result = model.toOllamaTool(createToolRequest({
            tags: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }], description: 'optional tags' }
        }));
        const tags = result.function.parameters!.properties!['tags'] as Record<string, unknown>;
        expect(tags['type']).to.equal('array');
        expect(tags['description']).to.equal('optional tags');
        expect(tags['items']).to.deep.equal({ type: 'string' });
        expect(tags).to.not.have.property('anyOf');
    });

    it('resolves anyOf inside array items sub-properties', () => {
        const model = createModel();
        const result = model.toOllamaTool(createToolRequest({
            arr: {
                type: 'array',
                description: 'list',
                items: {
                    type: 'object',
                    properties: { maybe: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'nullable field' } }
                }
            }
        }));
        const arr = result.function.parameters!.properties!['arr'] as Record<string, unknown>;
        expect(arr['items']).to.deep.equal({
            type: 'object',
            properties: { maybe: { type: 'string', description: 'nullable field' } }
        });
    });

    it('passes items schema through for a simple array property', () => {
        const model = createModel();
        const result = model.toOllamaTool(createToolRequest({
            tags: { type: 'array', description: 'list of tags', items: { type: 'string' } }
        }));
        const tags = result.function.parameters!.properties!['tags'] as Record<string, unknown>;
        expect(tags['items']).to.deep.equal({ type: 'string' });
    });

    it('passes through a type-less item schema unchanged', () => {
        const model = createModel();
        const result = model.toOllamaTool(createToolRequest({
            tags: { type: 'array', description: 'list of tags', items: { enum: ['a', 'b'] } }
        }));
        const tags = result.function.parameters!.properties!['tags'] as Record<string, unknown>;
        expect(tags['items']).to.deep.equal({ enum: ['a', 'b'] });
    });

    it('preserves top-level $defs alongside a $ref property', () => {
        const model = createModel();
        const tool: ToolRequest = {
            ...createToolRequest(),
            parameters: {
                type: 'object',
                $defs: { Todo: { type: 'object', properties: { id: { type: 'string', description: 'id' } }, required: ['id'] } },
                properties: { item: { $ref: '#/$defs/Todo' } }
            } as ToolRequest['parameters'] & { $defs: unknown }
        };
        const result = model.toOllamaTool(tool);
        expect(result.function.parameters!['$defs']).to.deep.equal({
            Todo: { type: 'object', properties: { id: { type: 'string', description: 'id' } }, required: ['id'] }
        });
        const item = result.function.parameters!.properties!['item'] as Record<string, unknown>;
        expect(item['$ref']).to.equal('#/$defs/Todo');
    });

    it('resolves anyOf on items schema preserving branch content', () => {
        const model = createModel();
        const result = model.toOllamaTool(createToolRequest({
            records: {
                type: 'array',
                description: 'list of records',
                items: {
                    anyOf: [
                        { type: 'object', properties: { id: { type: 'string', description: 'unique id' } }, required: ['id'] },
                        { type: 'null' }
                    ]
                }
            }
        }));
        const records = result.function.parameters!.properties!['records'] as Record<string, unknown>;
        const items = records['items'] as Record<string, unknown>;
        expect(items['type']).to.equal('object');
        expect(items['properties']).to.deep.equal({ id: { type: 'string', description: 'unique id' } });
        expect(items['required']).to.deep.equal(['id']);
        expect(items).to.not.have.property('anyOf');
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
function createToolRequest(properties?: ToolRequest['parameters']['properties']): ToolRequest {
    return {
        id: 'tool-1',
        name: 'example-tool',
        description: 'Example Tool',
        parameters: properties
            ? { type: 'object', properties }
            : {
                type: 'object',
                properties: {
                    question: { type: 'string', description: 'What is the best pizza topping?' },
                    optional: { type: 'string', description: 'Optional parameter' }
                },
                required: ['question']
            },
        handler: sinon.stub()
    };
}
