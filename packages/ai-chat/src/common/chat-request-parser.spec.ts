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
import { ChatAgentLocation } from './chat-agents';
import { ChatContext, ChatRequest } from './chat-model';
import { expect } from 'chai';
import { AIVariable, DefaultAIVariableService, ResolvedAIVariable, ToolInvocationRegistryImpl, ToolRequest } from '@theia/ai-core';
import { ILogger, Logger } from '@theia/core';
import { ParsedChatRequestTextPart, ParsedChatRequestVariablePart } from './parsed-chat-request';

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
        expect(result.parts).to.deep.contain({
            text: 'What is the best pizza topping?',
            range: { start: 0, endExclusive: 31 }
        });
    });

    it('parses text with variable name', async () => {
        const req: ChatRequest = {
            text: 'What is the #best pizza topping?'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);
        expect(result).to.deep.contain({
            parts: [{
                text: 'What is the ',
                range: { start: 0, endExclusive: 12 }
            }, {
                variableName: 'best',
                variableArg: undefined,
                range: { start: 12, endExclusive: 17 }
            }, {
                text: ' pizza topping?',
                range: { start: 17, endExclusive: 32 }
            }]
        });
    });

    it('parses text with variable name with argument', async () => {
        const req: ChatRequest = {
            text: 'What is the #best:by-poll pizza topping?'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);
        expect(result).to.deep.contain({
            parts: [{
                text: 'What is the ',
                range: { start: 0, endExclusive: 12 }
            }, {
                variableName: 'best',
                variableArg: 'by-poll',
                range: { start: 12, endExclusive: 25 }
            }, {
                text: ' pizza topping?',
                range: { start: 25, endExclusive: 40 }
            }]
        });
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
});
