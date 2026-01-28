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

import * as sinon from 'sinon';
import { ChatAgentServiceImpl } from './chat-agent-service';
import { ChatRequestParserImpl } from './chat-request-parser';
import { ChatAgent, ChatAgentLocation } from './chat-agents';
import { ChatContext, ChatRequest } from './chat-model';
import { expect } from 'chai';
import { AIVariable, DefaultAIVariableService, ResolvedAIVariable, ToolInvocationRegistryImpl, ToolRequest } from '@theia/ai-core';
import { ILogger, Logger } from '@theia/core';
import { ParsedChatRequestAgentPart, ParsedChatRequestFunctionPart, ParsedChatRequestTextPart, ParsedChatRequestVariablePart } from './parsed-chat-request';
import { AgentDelegationTool } from '../browser/agent-delegation-tool';

describe('ChatRequestParserImpl', () => {
    const chatAgentService = sinon.createStubInstance(ChatAgentServiceImpl);
    const variableService = sinon.createStubInstance(DefaultAIVariableService);
    const toolInvocationRegistry = sinon.createStubInstance(ToolInvocationRegistryImpl);
    const logger: ILogger = sinon.createStubInstance(Logger);
    const parser = new ChatRequestParserImpl(chatAgentService, variableService, toolInvocationRegistry, logger);

    beforeEach(() => {
        // Reset our stubs before each test
        sinon.reset();
    });

    it('parses simple text', async () => {
        const req: ChatRequest = {
            text: 'What is the best pizza topping?'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);
        expect(result.parts.length).to.equal(1);
        const part = result.parts[0] as ParsedChatRequestTextPart;
        expect(part.kind).to.equal('text');
        expect(part.text).to.equal('What is the best pizza topping?');
        expect(part.range).to.deep.equal({ start: 0, endExclusive: 31 });
    });

    it('parses text with variable name', async () => {
        const req: ChatRequest = {
            text: 'What is the #best pizza topping?'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);
        expect(result.parts.length).to.equal(3);

        const textPart1 = result.parts[0] as ParsedChatRequestTextPart;
        expect(textPart1.kind).to.equal('text');
        expect(textPart1.text).to.equal('What is the ');
        expect(textPart1.range).to.deep.equal({ start: 0, endExclusive: 12 });

        const varPart = result.parts[1] as ParsedChatRequestVariablePart;
        expect(varPart.kind).to.equal('var');
        expect(varPart.variableName).to.equal('best');
        expect(varPart.variableArg).to.be.undefined;
        expect(varPart.range).to.deep.equal({ start: 12, endExclusive: 17 });

        const textPart2 = result.parts[2] as ParsedChatRequestTextPart;
        expect(textPart2.kind).to.equal('text');
        expect(textPart2.text).to.equal(' pizza topping?');
        expect(textPart2.range).to.deep.equal({ start: 17, endExclusive: 32 });
    });

    it('parses text with variable name with argument', async () => {
        const req: ChatRequest = {
            text: 'What is the #best:by-poll pizza topping?'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);
        expect(result.parts.length).to.equal(3);

        const textPart1 = result.parts[0] as ParsedChatRequestTextPart;
        expect(textPart1.kind).to.equal('text');
        expect(textPart1.text).to.equal('What is the ');
        expect(textPart1.range).to.deep.equal({ start: 0, endExclusive: 12 });

        const varPart = result.parts[1] as ParsedChatRequestVariablePart;
        expect(varPart.kind).to.equal('var');
        expect(varPart.variableName).to.equal('best');
        expect(varPart.variableArg).to.equal('by-poll');
        expect(varPart.range).to.deep.equal({ start: 12, endExclusive: 25 });

        const textPart2 = result.parts[2] as ParsedChatRequestTextPart;
        expect(textPart2.kind).to.equal('text');
        expect(textPart2.text).to.equal(' pizza topping?');
        expect(textPart2.range).to.deep.equal({ start: 25, endExclusive: 40 });
    });

    it('parses text with variable name with numeric argument', async () => {
        const req: ChatRequest = {
            text: '#size-class:2'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);
        expect(result.parts[0]).to.contain(
            {
                variableName: 'size-class',
                variableArg: '2'
            }
        );
    });

    it('parses text with variable name with POSIX path argument', async () => {
        const req: ChatRequest = {
            text: '#file:/path/to/file.ext'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);
        expect(result.parts[0]).to.contain(
            {
                variableName: 'file',
                variableArg: '/path/to/file.ext'
            }
        );
    });

    it('parses text with variable name with Win32 path argument', async () => {
        const req: ChatRequest = {
            text: '#file:c:\\path\\to\\file.ext'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);
        expect(result.parts[0]).to.contain(
            {
                variableName: 'file',
                variableArg: 'c:\\path\\to\\file.ext'
            }
        );
    });

    it('resolves variable and extracts tool functions from resolved variable', async () => {
        // Set up two test tool requests that will be referenced in the variable content
        const testTool1: ToolRequest = {
            id: 'testTool1',
            name: 'Test Tool 1',
            handler: async () => undefined,
            parameters: {
                type: 'object',
                properties: {}
            },
        };
        const testTool2: ToolRequest = {
            id: 'testTool2',
            name: 'Test Tool 2',
            handler: async () => undefined,
            parameters: {
                type: 'object',
                properties: {}
            },
        };
        // Configure the tool registry to return our test tools
        toolInvocationRegistry.getFunction.withArgs(testTool1.id).returns(testTool1);
        toolInvocationRegistry.getFunction.withArgs(testTool2.id).returns(testTool2);

        // Set up the test variable to include in the request
        const testVariable: AIVariable = {
            id: 'testVariable',
            name: 'testVariable',
            description: 'A test variable',
        };
        // Configure the variable service to return our test variable
        // One tool reference uses chat format and one uses prompt format because the parser needs to handle both.
        variableService.getVariable.withArgs(testVariable.name).returns(testVariable);
        variableService.resolveVariable.withArgs(
            { variable: testVariable.name, arg: 'myarg' },
            sinon.match.any
        ).resolves({
            variable: testVariable,
            arg: 'myarg',
            value: 'This is a test with ~testTool1 and **~{testTool2}** and more text.',
        });

        // Create a request with the test variable
        const req: ChatRequest = {
            text: 'Test with #testVariable:myarg'
        };
        const context: ChatContext = { variables: [] };

        // Parse the request
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);

        // Verify the variable part contains the correct properties
        expect(result.parts.length).to.equal(2);
        expect(result.parts[0] instanceof ParsedChatRequestTextPart).to.be.true;
        expect(result.parts[1] instanceof ParsedChatRequestVariablePart).to.be.true;
        const variablePart = result.parts[1] as ParsedChatRequestVariablePart;
        expect(variablePart).to.have.property('resolution');
        expect(variablePart.resolution).to.deep.equal({
            variable: testVariable,
            arg: 'myarg',
            value: 'This is a test with ~testTool1 and **~{testTool2}** and more text.',
        } satisfies ResolvedAIVariable);

        // Verify both tool functions were extracted from the variable content
        expect(result.toolRequests.size).to.equal(2);
        expect(result.toolRequests.has(testTool1.id)).to.be.true;
        expect(result.toolRequests.has(testTool2.id)).to.be.true;

        // Verify the result contains the tool requests returned by the registry
        expect(result.toolRequests.get(testTool1.id)).to.deep.equal(testTool1);
        expect(result.toolRequests.get(testTool2.id)).to.deep.equal(testTool2);
    });

    it('parses simple command without arguments', async () => {
        const req: ChatRequest = {
            text: '/hello'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);

        expect(result.parts.length).to.equal(1);
        expect(result.parts[0] instanceof ParsedChatRequestVariablePart).to.be.true;
        const varPart = result.parts[0] as ParsedChatRequestVariablePart;
        expect(varPart.variableName).to.equal('prompt');
        expect(varPart.variableArg).to.equal('hello');
    });

    it('parses command with single argument', async () => {
        const req: ChatRequest = {
            text: '/explain topic'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);

        expect(result.parts.length).to.equal(1);
        const varPart = result.parts[0] as ParsedChatRequestVariablePart;
        expect(varPart.variableName).to.equal('prompt');
        expect(varPart.variableArg).to.equal('explain|topic');
    });

    it('parses command with multiple arguments', async () => {
        const req: ChatRequest = {
            text: '/compare item1 item2'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);

        const varPart = result.parts[0] as ParsedChatRequestVariablePart;
        expect(varPart.variableName).to.equal('prompt');
        expect(varPart.variableArg).to.equal('compare|item1 item2');
    });

    it('parses command with quoted arguments', async () => {
        const req: ChatRequest = {
            text: '/cmd "arg with spaces" other'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);

        const varPart = result.parts[0] as ParsedChatRequestVariablePart;
        expect(varPart.variableArg).to.equal('cmd|"arg with spaces" other');
    });

    it('handles command with escaped quotes', async () => {
        const req: ChatRequest = {
            text: '/cmd "arg with \\"quote\\"" other'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);

        const varPart = result.parts[0] as ParsedChatRequestVariablePart;
        expect(varPart.variableArg).to.equal('cmd|"arg with \\"quote\\"" other');
    });

    it('treats the first @agent mention as the selector and does not allow later mentions to override it', async () => {
        const createAgent = (id: string): ChatAgent => ({
            id,
            name: id,
            description: '',
            tags: [],
            variables: [],
            prompts: [],
            agentSpecificVariables: [],
            functions: [],
            languageModelRequirements: [],
            locations: [ChatAgentLocation.Panel],
            invoke: async () => undefined,
        });
        const req: ChatRequest = {
            text: '@agentA do X @agentB do Y'
        };
        const context: ChatContext = { variables: [] };

        chatAgentService.getAgents.returns([
            createAgent('agentA'),
            createAgent('agentB'),
        ]);

        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);
        const agentParts = result.parts.filter(p => p instanceof ParsedChatRequestAgentPart) as ParsedChatRequestAgentPart[];

        expect(agentParts.length).to.equal(1);
        expect(agentParts[0].agentId).to.equal('agentA');
        expect(agentParts[0].agentName).to.equal('agentA');
    });

    it('delegateToAgent(agentId, prompt) composes a request that forces selecting agentId even if prompt mentions other agents', async () => {
        const createAgent = (id: string): ChatAgent => ({
            id,
            name: id,
            description: '',
            tags: [],
            variables: [],
            prompts: [],
            agentSpecificVariables: [],
            functions: [],
            languageModelRequirements: [],
            locations: [ChatAgentLocation.Panel],
            invoke: async () => undefined,
        });

        const tool = new AgentDelegationTool();
        (tool as unknown as { getChatAgentService: () => unknown }).getChatAgentService = () => ({
            getAgent: sinon.stub().withArgs('agentA').returns(createAgent('agentA')),
            getAgents: sinon.stub().returns([createAgent('agentA')]),
        });

        const sendRequest = sinon.stub().callsFake(async (_sessionId: string, request: ChatRequest) => {
            const parseResult = await parser.parseChatRequest(request, ChatAgentLocation.Panel, { variables: [] });
            const agentParts = parseResult.parts.filter(p => p instanceof ParsedChatRequestAgentPart) as ParsedChatRequestAgentPart[];
            expect(agentParts.length).to.equal(1);
            expect(agentParts[0].agentId).to.equal('agentA');

            return {
                requestCompleted: Promise.resolve({ cancel: () => undefined }),
                responseCompleted: Promise.resolve({ response: { asString: () => 'ok' } }),
            };
        });

        (tool as unknown as { getChatService: () => unknown }).getChatService = () => ({
            getActiveSession: sinon.stub().returns(undefined),
            setActiveSession: sinon.stub(),
            createSession: sinon.stub().returns({
                id: 'session-1',
                model: {
                    changeSet: {
                        onDidChange: sinon.stub().returns({}),
                        getElements: sinon.stub().returns([]),
                        setTitle: sinon.stub(),
                        addElements: sinon.stub(),
                    }
                }
            }),
            sendRequest,
            deleteSession: sinon.stub().resolves(undefined),
        });

        const toolRequest = tool.getTool();
        await toolRequest.handler(
            JSON.stringify({ agentId: 'agentA', prompt: 'do X @agentB do Y' }),
            {
                request: {
                    session: { changeSet: { setTitle: sinon.stub(), addElements: sinon.stub() } },
                    response: {
                        cancellationToken: { isCancellationRequested: false, onCancellationRequested: sinon.stub() },
                        response: { addContent: sinon.stub() },
                    },
                },
            } as unknown as Parameters<typeof toolRequest.handler>[1]
        );

        expect(sendRequest.calledOnce).to.be.true;
        const delegatedChatRequest = sendRequest.firstCall.args[1] as ChatRequest;
        expect(delegatedChatRequest.text).to.equal('@agentA do X @agentB do Y');
    });

    describe('parsed chat request part kind assignments', () => {
        it('ParsedChatRequestTextPart has kind assigned at runtime', () => {
            const part = new ParsedChatRequestTextPart({ start: 0, endExclusive: 5 }, 'hello');
            expect(part.kind).to.equal('text');
        });

        it('ParsedChatRequestVariablePart has kind assigned at runtime', () => {
            const part = new ParsedChatRequestVariablePart({ start: 0, endExclusive: 5 }, 'varName', undefined);
            expect(part.kind).to.equal('var');
        });

        it('ParsedChatRequestFunctionPart has kind assigned at runtime', () => {
            const toolRequest: ToolRequest = {
                id: 'testTool',
                name: 'Test Tool',
                handler: async () => undefined,
                parameters: { type: 'object', properties: {} }
            };
            const part = new ParsedChatRequestFunctionPart({ start: 0, endExclusive: 5 }, toolRequest);
            expect(part.kind).to.equal('function');
        });

        it('ParsedChatRequestAgentPart has kind assigned at runtime', () => {
            const part = new ParsedChatRequestAgentPart({ start: 0, endExclusive: 5 }, 'agentId', 'agentName');
            expect(part.kind).to.equal('agent');
        });
    });
});
