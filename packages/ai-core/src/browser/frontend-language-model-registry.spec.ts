// *****************************************************************************
// Copyright (C) 2025 EclipseSource.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import {
    LanguageModelRequest,
    ToolRequest
} from '../common';

disableJSDOM();

interface ErrorObject {
    error: boolean;
    message: string;
}

function isErrorObject(obj: unknown): obj is ErrorObject {
    return !!obj && typeof obj === 'object' && 'error' in obj && 'message' in obj;
}

// This class provides a minimal implementation focused solely on testing the toolCall method.
// We cannot extend FrontendLanguageModelRegistryImpl directly due to issues in the test environment:
//   - FrontendLanguageModelRegistryImpl imports dependencies that transitively depend on 'p-queue'
//   - p-queue is an ESM-only module that cannot be loaded in the current test environment
class TestableLanguageModelRegistry {
    private requests = new Map<string, LanguageModelRequest>();

    async toolCall(id: string, toolId: string, arg_string: string): Promise<unknown> {
        if (!this.requests.has(id)) {
            return { error: true, message: `No request found for ID '${id}'. The request may have been cancelled or completed.` };
        }
        const request = this.requests.get(id)!;
        const tool = request.tools?.find(t => t.id === toolId);
        if (tool) {
            try {
                return await tool.handler(arg_string);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return { error: true, message: `Error executing tool '${toolId}': ${errorMessage}` };
            };
        }
        return { error: true, message: `Tool '${toolId}' not found in the available tools for this request.` };
    }

    // Test helper method
    setRequest(id: string, request: LanguageModelRequest): void {
        this.requests.set(id, request);
    }
}

describe('FrontendLanguageModelRegistryImpl toolCall functionality', () => {
    let registry: TestableLanguageModelRegistry;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        registry = new TestableLanguageModelRegistry();
    });

    describe('toolCall', () => {
        it('should return error object when request ID does not exist', async () => {
            const result = await registry.toolCall('nonexistent-id', 'test-tool', '{}');

            expect(result).to.be.an('object');
            expect(isErrorObject(result)).to.be.true;
            if (isErrorObject(result)) {
                expect(result.error).to.be.true;
                expect(result.message).to.include('No request found for ID \'nonexistent-id\'');
                expect(result.message).to.include('The request may have been cancelled or completed');
            }
        });

        it('should return error object when tool is not found', async () => {
            // Set up a request without the requested tool
            const requestId = 'test-request-id';
            const mockRequest: LanguageModelRequest = {
                messages: [],
                tools: [
                    {
                        id: 'different-tool',
                        name: 'Different Tool',
                        description: 'A different tool',
                        parameters: {
                            type: 'object',
                            properties: {}
                        },
                        handler: () => Promise.resolve('success')
                    }
                ]
            };

            registry.setRequest(requestId, mockRequest);

            const result = await registry.toolCall(requestId, 'nonexistent-tool', '{}');

            expect(result).to.be.an('object');
            expect(isErrorObject(result)).to.be.true;
            if (isErrorObject(result)) {
                expect(result.error).to.be.true;
                expect(result.message).to.include('Tool \'nonexistent-tool\' not found in the available tools for this request');
            }
        });

        it('should call tool handler successfully when tool exists', async () => {
            const requestId = 'test-request-id';
            const toolId = 'test-tool';
            const expectedResult = 'tool execution result';

            const mockTool: ToolRequest = {
                id: toolId,
                name: 'Test Tool',
                description: 'A test tool',
                parameters: {
                    type: 'object',
                    properties: {}
                },
                handler: (args: string) => Promise.resolve(expectedResult)
            };

            const mockRequest: LanguageModelRequest = {
                messages: [],
                tools: [mockTool]
            };

            registry.setRequest(requestId, mockRequest);

            const result = await registry.toolCall(requestId, toolId, '{}');

            expect(result).to.equal(expectedResult);
        });

        it('should handle synchronous tool handler errors gracefully', async () => {
            const requestId = 'test-request-id';
            const toolId = 'error-tool';
            const errorMessage = 'Tool execution failed';

            const mockTool: ToolRequest = {
                id: toolId,
                name: 'Error Tool',
                description: 'A tool that throws an error',
                parameters: {
                    type: 'object',
                    properties: {}
                },
                handler: () => {
                    throw new Error(errorMessage);
                }
            };

            const mockRequest: LanguageModelRequest = {
                messages: [],
                tools: [mockTool]
            };

            registry.setRequest(requestId, mockRequest);

            const result = await registry.toolCall(requestId, toolId, '{}');

            expect(result).to.be.an('object');
            expect(isErrorObject(result)).to.be.true;
            if (isErrorObject(result)) {
                expect(result.error).to.be.true;
                expect(result.message).to.include(`Error executing tool '${toolId}': ${errorMessage}`);
            }
        });

        it('should handle non-Error exceptions gracefully', async () => {
            const requestId = 'test-request-id';
            const toolId = 'string-error-tool';
            const errorMessage = 'String error';

            const mockTool: ToolRequest = {
                id: toolId,
                name: 'String Error Tool',
                description: 'A tool that throws a string',
                parameters: {
                    type: 'object',
                    properties: {}
                },
                handler: () => {
                    // eslint-disable-next-line no-throw-literal
                    throw errorMessage;
                }
            };

            const mockRequest: LanguageModelRequest = {
                messages: [],
                tools: [mockTool]
            };

            registry.setRequest(requestId, mockRequest);

            const result = await registry.toolCall(requestId, toolId, '{}');

            expect(result).to.be.an('object');
            expect(isErrorObject(result)).to.be.true;
            if (isErrorObject(result)) {
                expect(result.error).to.be.true;
                expect(result.message).to.include(`Error executing tool '${toolId}': ${errorMessage}`);
            }
        });

        it('should handle asynchronous tool handler errors gracefully', async () => {
            const requestId = 'test-request-id';
            const toolId = 'async-error-tool';
            const errorMessage = 'Async tool execution failed';

            const mockTool: ToolRequest = {
                id: toolId,
                name: 'Async Error Tool',
                description: 'A tool that returns a rejected promise',
                parameters: {
                    type: 'object',
                    properties: {}
                },
                handler: () => Promise.reject(new Error(errorMessage))
            };

            const mockRequest: LanguageModelRequest = {
                messages: [],
                tools: [mockTool]
            };

            registry.setRequest(requestId, mockRequest);

            const result = await registry.toolCall(requestId, toolId, '{}');

            expect(result).to.be.an('object');
            expect(isErrorObject(result)).to.be.true;
            if (isErrorObject(result)) {
                expect(result.error).to.be.true;
                expect(result.message).to.include(`Error executing tool '${toolId}': ${errorMessage}`);
            }
        });

        it('should handle tool handler with no tools array', async () => {
            const requestId = 'test-request-id';
            const mockRequest: LanguageModelRequest = {
                messages: []
                // No tools property
            };

            registry.setRequest(requestId, mockRequest);

            const result = await registry.toolCall(requestId, 'any-tool', '{}');

            expect(result).to.be.an('object');
            expect(isErrorObject(result)).to.be.true;
            if (isErrorObject(result)) {
                expect(result.error).to.be.true;
                expect(result.message).to.include('Tool \'any-tool\' not found in the available tools for this request');
            }
        });

        it('should handle tool handler with empty tools array', async () => {
            const requestId = 'test-request-id';
            const mockRequest: LanguageModelRequest = {
                messages: [],
                tools: []
            };

            registry.setRequest(requestId, mockRequest);

            const result = await registry.toolCall(requestId, 'any-tool', '{}');

            expect(result).to.be.an('object');
            expect(isErrorObject(result)).to.be.true;
            if (isErrorObject(result)) {
                expect(result.error).to.be.true;
                expect(result.message).to.include('Tool \'any-tool\' not found in the available tools for this request');
            }
        });
    });
});
