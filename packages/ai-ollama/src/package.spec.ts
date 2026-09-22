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

import { ToolRequest } from '@theia/ai-core';
import { OllamaModel } from './node/ollama-language-model';
import { Tool } from 'ollama';
import { expect } from 'chai';
import * as sinon from 'sinon';

describe('ai-ollama package', () => {

    it('Transform to Ollama tools', () => {
        const req: ToolRequest = createToolRequest();
        const model = new OllamaModelUnderTest();
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

    it('resolves anyOf directly on an items schema', () => {
        const model = new OllamaModelUnderTest();
        const tool: ToolRequest = {
            id: 'test',
            name: 'test',
            description: 'test',
            handler: sinon.stub(),
            parameters: {
                type: 'object',
                properties: {
                    tags: {
                        type: 'array',
                        description: 'list of tags',
                        items: {
                            anyOf: [{ type: 'string' }, { type: 'null' }],
                            description: 'a tag'
                        }
                    }
                }
            }
        };
        const result = model.toOllamaTool(tool);
        const tags = result.function.parameters!.properties!['tags'] as Record<string, unknown>;
        expect(tags['items']).to.deep.equal({ type: 'string', description: 'a tag' });
    });

    it('passes enum values through to output', () => {
        const model = new OllamaModelUnderTest();
        const tool: ToolRequest = {
            id: 'test',
            name: 'test',
            description: 'test',
            handler: sinon.stub(),
            parameters: {
                type: 'object',
                properties: {
                    status: {
                        type: 'string',
                        description: 'task status',
                        enum: ['pending', 'in-progress', 'done']
                    }
                }
            }
        };
        const result = model.toOllamaTool(tool);
        const status = result.function.parameters!.properties!['status'] as Record<string, unknown>;
        expect(status['enum']).to.deep.equal(['pending', 'in-progress', 'done']);
    });

    it('passes required and nested properties through array items (todoWrite schema)', () => {
        const model = new OllamaModelUnderTest();
        const tool: ToolRequest = {
            id: 'test',
            name: 'test',
            description: 'test',
            handler: sinon.stub(),
            parameters: {
                type: 'object',
                properties: {
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
                }
            }
        };
        const result = model.toOllamaTool(tool);
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
        const model = new OllamaModelUnderTest();
        const tool: ToolRequest = {
            id: 'test',
            name: 'test',
            description: 'test',
            handler: sinon.stub(),
            parameters: {
                type: 'object',
                properties: {
                    status: {
                        enum: ['a', 'b'],
                        description: 'no explicit type'
                    }
                }
            }
        };
        const result = model.toOllamaTool(tool);
        const status = result.function.parameters!.properties!['status'] as Record<string, unknown>;
        expect(status['enum']).to.deep.equal(['a', 'b']);
        expect(status['description']).to.equal('no explicit type');
    });

    it('resolves anyOf on a top-level property preserving branch content', () => {
        const model = new OllamaModelUnderTest();
        const tool: ToolRequest = {
            id: 'test',
            name: 'test',
            description: 'test',
            handler: sinon.stub(),
            parameters: {
                type: 'object',
                properties: {
                    tags: {
                        anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
                        description: 'optional tags'
                    }
                }
            }
        };
        const result = model.toOllamaTool(tool);
        const tags = result.function.parameters!.properties!['tags'] as Record<string, unknown>;
        expect(tags['type']).to.equal('array');
        expect(tags['description']).to.equal('optional tags');
        expect(tags['items']).to.deep.equal({ type: 'string' });
        expect(tags).to.not.have.property('anyOf');
    });

    it('resolves anyOf inside array items sub-properties', () => {
        const model = new OllamaModelUnderTest();
        const tool: ToolRequest = {
            id: 'test',
            name: 'test',
            description: 'test',
            handler: sinon.stub(),
            parameters: {
                type: 'object',
                properties: {
                    arr: {
                        type: 'array',
                        description: 'list',
                        items: {
                            type: 'object',
                            properties: {
                                maybe: {
                                    anyOf: [{ type: 'string' }, { type: 'null' }],
                                    description: 'nullable field'
                                }
                            }
                        }
                    }
                }
            }
        };
        const result = model.toOllamaTool(tool);
        const arr = result.function.parameters!.properties!['arr'] as Record<string, unknown>;
        expect(arr['items']).to.deep.equal({
            type: 'object',
            properties: {
                maybe: { type: 'string', description: 'nullable field' }
            }
        });
    });
});

class OllamaModelUnderTest extends OllamaModel {
    constructor() {
        super('id', 'model', { status: 'ready' }, () => '');
    }

    override toOllamaTool(tool: ToolRequest): Tool & { handler: (arg_string: string) => Promise<unknown> } {
        return super.toOllamaTool(tool);
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
