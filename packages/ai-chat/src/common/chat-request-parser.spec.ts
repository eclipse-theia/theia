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
import { AIVariable, DefaultAIVariableService, PromptService, ResolvedAIVariable, ToolInvocationRegistryImpl, ToolRequest } from '@theia/ai-core';
import { ILogger, Logger } from '@theia/core';
import { ParsedChatRequestAgentPart, ParsedChatRequestFunctionPart, ParsedChatRequestTextPart, ParsedChatRequestVariablePart } from './parsed-chat-request';
import { AgentDelegationTool } from '../browser/agent-delegation-tool';

describe('ChatRequestParserImpl', () => {
    /** Command names the stubbed `PromptService` knows about. Anything else is not a command. */
    const KNOWN_COMMANDS = ['hello', 'explain', 'compare', 'cmd', 'summarize', 'skill-one', 'skill-two', 'bigquery:query-builder', 'io.github.acme_tools:my-skill'];
    /** Prompt fragments that are not marked as commands, but can still be invoked by their id. */
    const KNOWN_FRAGMENT_IDS = ['coder-system'];

    const promptService = {
        isKnownCommand: (name: string) => KNOWN_COMMANDS.includes(name) || KNOWN_FRAGMENT_IDS.includes(name),
        getCommands: () => KNOWN_COMMANDS.map(name => ({ id: `command-${name}`, template: '', isCommand: true, commandName: name }))
    } as unknown as PromptService;

    const chatAgentService = sinon.createStubInstance(ChatAgentServiceImpl);
    const variableService = sinon.createStubInstance(DefaultAIVariableService);
    const toolInvocationRegistry = sinon.createStubInstance(ToolInvocationRegistryImpl);
    const logger: ILogger = sinon.createStubInstance(Logger);
    const parser = new ChatRequestParserImpl(chatAgentService, variableService, toolInvocationRegistry, logger);
    // The parser injects the PromptService as a property, so it has to be assigned manually here.
    (parser as unknown as { promptService: PromptService }).promptService = promptService;

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

    it('parses multiple commands in one message', async () => {
        const req: ChatRequest = {
            text: '/skill-one /skill-two'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);

        expect(result.parts.length).to.equal(3);
        const firstCommand = result.parts[0] as ParsedChatRequestVariablePart;
        const separator = result.parts[1] as ParsedChatRequestTextPart;
        const secondCommand = result.parts[2] as ParsedChatRequestVariablePart;
        expect(firstCommand.variableName).to.equal('prompt');
        expect(firstCommand.variableArg).to.equal('skill-one');
        expect(separator.text).to.equal(' ');
        expect(secondCommand.variableName).to.equal('prompt');
        expect(secondCommand.variableArg).to.equal('skill-two');
    });

    it('inserts a separator between two argument-taking commands', async () => {
        const req: ChatRequest = {
            text: '/summarize foo /hello bar'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);

        expect(result.parts.length).to.equal(3);
        const firstCommand = result.parts[0] as ParsedChatRequestVariablePart;
        const separator = result.parts[1] as ParsedChatRequestTextPart;
        const secondCommand = result.parts[2] as ParsedChatRequestVariablePart;
        expect(firstCommand.variableArg).to.equal('summarize|foo');
        expect(separator.kind).to.equal('text');
        expect(separator.text).to.equal(' ');
        expect(secondCommand.variableArg).to.equal('hello|bar');
    });

    it('keeps path-like slash arguments as command arguments', async () => {
        const req: ChatRequest = {
            text: '/explain /path/to/file'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);

        expect(result.parts.length).to.equal(1);
        const varPart = result.parts[0] as ParsedChatRequestVariablePart;
        expect(varPart.variableName).to.equal('prompt');
        expect(varPart.variableArg).to.equal('explain|/path/to/file');
    });

    it('does not treat path segments as commands', async () => {
        const req: ChatRequest = {
            text: 'please look at /home/user/notes.txt and fix the bug'
        };
        const context: ChatContext = { variables: [] };
        const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, context);

        expect(result.parts.length).to.equal(1);
        expect(result.parts[0].kind).to.equal('text');
        expect(result.parts[0].text).to.equal(req.text);
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

        // Set up the parser's agent service so it can recognise agents during parsing
        chatAgentService.getAgents.returns([createAgent('agentA'), createAgent('agentB')]);

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
                responseCompleted: Promise.resolve({ response: { content: [{ kind: 'text', content: 'ok', asString: () => 'ok' }] } }),
            };
        });

        (tool as unknown as { getChatService: () => unknown }).getChatService = () => ({
            getActiveSession: sinon.stub().returns(undefined),
            setActiveSession: sinon.stub(),
            createSession: sinon.stub().returns({
                id: 'session-1',
                model: {
                    changeSet: {
                        onDidChange: sinon.stub().returns({ dispose: sinon.stub() }),
                        getElements: sinon.stub().returns([]),
                        setTitle: sinon.stub(),
                        addElements: sinon.stub(),
                    },
                    onDidChange: sinon.stub().returns({ dispose: sinon.stub() })
                }
            }),
            sendRequest,
            deleteSession: sinon.stub().resolves(undefined),
        });

        const toolRequest = tool.getTool();
        await toolRequest.handler(
            JSON.stringify({ agentId: 'agentA', prompt: 'do X @agentB do Y' }),
            {
                cancellationToken: { isCancellationRequested: false, onCancellationRequested: sinon.stub() },
                request: {
                    session: { changeSet: { setTitle: sinon.stub(), addElements: sinon.stub() } },
                },
                response: {
                    cancellationToken: { isCancellationRequested: false, onCancellationRequested: sinon.stub() },
                    response: { addContent: sinon.stub() },
                },
            } as unknown as Parameters<typeof toolRequest.handler>[1]
        );

        expect(sendRequest.calledOnce).to.be.true;
        const delegatedChatRequest = sendRequest.firstCall.args[1] as ChatRequest;
        expect(delegatedChatRequest.text).to.equal('@agentA do X @agentB do Y');
    });

    describe('deferred tool references', () => {
        const deferredTool: ToolRequest = {
            id: 'deferredTool',
            name: 'Deferred Tool',
            handler: async () => undefined,
            parameters: { type: 'object', properties: {} }
        };
        const eagerTool: ToolRequest = {
            id: 'eagerTool',
            name: 'Eager Tool',
            handler: async () => undefined,
            parameters: { type: 'object', properties: {} }
        };

        beforeEach(() => {
            toolInvocationRegistry.getFunction.withArgs(deferredTool.id).returns(deferredTool);
            toolInvocationRegistry.getFunction.withArgs(eagerTool.id).returns(eagerTool);
        });

        it('parses ~?toolId chat-format syntax as a deferred tool reference', async () => {
            const req: ChatRequest = { text: 'Please use ~?deferredTool here' };
            const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, { variables: [] });

            const fnPart = result.parts.find(p => p instanceof ParsedChatRequestFunctionPart) as ParsedChatRequestFunctionPart;
            expect(fnPart, 'expected a function part').to.not.be.undefined;
            expect(fnPart.toolRequest.id).to.equal('deferredTool');
            expect(fnPart.deferred).to.be.true;
            expect(fnPart.text).to.equal('~?deferredTool');

            expect(result.toolRequests.size).to.equal(1);
            expect(result.deferredToolIds?.has('deferredTool')).to.be.true;
        });

        it('parses ~{?toolId} prompt-format syntax as a deferred tool reference', async () => {
            const req: ChatRequest = { text: 'Use ~{?deferredTool} now.' };
            const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, { variables: [] });

            const fnPart = result.parts.find(p => p instanceof ParsedChatRequestFunctionPart) as ParsedChatRequestFunctionPart;
            expect(fnPart, 'expected a function part').to.not.be.undefined;
            expect(fnPart.toolRequest.id).to.equal('deferredTool');
            expect(fnPart.deferred).to.be.true;

            expect(result.deferredToolIds?.has('deferredTool')).to.be.true;
        });

        it('does not mark plain references as deferred', async () => {
            const req: ChatRequest = { text: 'Use ~eagerTool and ~{eagerTool} please.' };
            const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, { variables: [] });

            const fnParts = result.parts.filter(p => p instanceof ParsedChatRequestFunctionPart) as ParsedChatRequestFunctionPart[];
            expect(fnParts.length).to.equal(2);
            for (const part of fnParts) {
                expect(part.deferred).to.be.false;
            }
            expect(result.deferredToolIds?.size ?? 0).to.equal(0);
        });

        it('mixes deferred and non-deferred references in a single request', async () => {
            const req: ChatRequest = { text: 'Use ~eagerTool first, then ~?deferredTool please' };
            const result = await parser.parseChatRequest(req, ChatAgentLocation.Panel, { variables: [] });

            const fnParts = result.parts.filter(p => p instanceof ParsedChatRequestFunctionPart) as ParsedChatRequestFunctionPart[];
            expect(fnParts.length).to.equal(2);
            const eagerPart = fnParts.find(p => p.toolRequest.id === 'eagerTool');
            const deferredPart = fnParts.find(p => p.toolRequest.id === 'deferredTool');

            expect(eagerPart?.deferred).to.be.false;
            expect(deferredPart?.deferred).to.be.true;
            expect(result.deferredToolIds?.size).to.equal(1);
            expect(result.deferredToolIds?.has('deferredTool')).to.be.true;
            expect(result.deferredToolIds?.has('eagerTool')).to.be.false;
        });
    });

    describe('slash command disambiguation', () => {
        const parse = (text: string) => parser.parseChatRequest({ text }, ChatAgentLocation.Panel, { variables: [] });

        /** Every character of the input has to be covered by exactly one part, in order and without gaps. */
        const expectFullCoverage = (parts: ReadonlyArray<{ range: { start: number, endExclusive: number } }>, text: string): void => {
            let expectedStart = 0;
            for (const part of parts) {
                expect(part.range.start, `part starting at ${part.range.start} does not continue at ${expectedStart}`).to.equal(expectedStart);
                expectedStart = part.range.endExclusive;
            }
            expect(expectedStart, 'parts do not cover the whole message').to.equal(text.length);
        };

        const expectPlainText = async (text: string) => {
            const result = await parse(text);
            expect(result.parts.map(p => p.kind), `expected only text parts for ${JSON.stringify(text)}`).to.deep.equal(['text']);
            expect(result.parts[0].text).to.equal(text);
            expectFullCoverage(result.parts, text);
        };

        describe('unknown commands stay plain text', () => {
            const unknownCommandInputs = [
                'please look at /home/user/notes.txt and fix the bug',
                '/home/user/notes.txt is broken',
                'read /usr/local/bin/theia',
                'the file is at /etc/hosts',
                'compare /tmp/a.txt with /tmp/b.txt',
                'run cd /home && ls',
                'see /usr/lib/node/foo.js:12 for the stack trace',
                'what does the option --foo /bar do?',
                '/does-not-exist do something',
                '/tmp',
                'move it to /tmp',
                'the separator is / on Unix'
            ];

            unknownCommandInputs.forEach(text => {
                it(`keeps ${JSON.stringify(text)} as plain text`, () => expectPlainText(text));
            });

            it('does not drop any user text when a path follows a known command name prefix', async () => {
                // `/summarizes` is not a known command, even though `/summarize` is.
                await expectPlainText('/summarizes the file');
            });

            it('does not treat a known command name as a command when it is a path segment', async () => {
                // `summarize` is known, but `/summarize/foo` is a path, not a command invocation.
                await expectPlainText('/summarize/foo is a path');
            });

            it('does not treat a known command name followed by punctuation as a command', async () => {
                await expectPlainText('did you mean /summarize?');
            });
        });

        describe('slashes that are not command leaders', () => {
            const nonLeaderInputs = [
                'A: 10/20 and B: 30/40',
                'use and/or here',
                '2026/08/04 is the date',
                'see https://example.com/foo/bar for details',
                'the regex is a\\/b'
            ];

            nonLeaderInputs.forEach(text => {
                it(`keeps ${JSON.stringify(text)} as plain text`, () => expectPlainText(text));
            });
        });

        describe('known commands still parse', () => {
            it('parses a known command without arguments', async () => {
                const text = '/summarize';
                const result = await parse(text);

                expect(result.parts.length).to.equal(1);
                const command = result.parts[0] as ParsedChatRequestVariablePart;
                expect(command.variableName).to.equal('prompt');
                expect(command.variableArg).to.equal('summarize');
                expectFullCoverage(result.parts, text);
            });

            it('parses a known command with arguments', async () => {
                const text = '/summarize foo bar';
                const result = await parse(text);

                expect(result.parts.length).to.equal(1);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('summarize|foo bar');
                expectFullCoverage(result.parts, text);
            });

            it('keeps a path as the argument of a known command', async () => {
                const text = '/summarize /home/user/notes.txt';
                const result = await parse(text);

                expect(result.parts.length).to.equal(1);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('summarize|/home/user/notes.txt');
                expectFullCoverage(result.parts, text);
            });

            it('keeps an unknown slash token inside the arguments of a known command', async () => {
                const text = '/summarize foo /unknown bar';
                const result = await parse(text);

                expect(result.parts.length).to.equal(1);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('summarize|foo /unknown bar');
                expectFullCoverage(result.parts, text);
            });

            it('parses a known command in the middle of a message', async () => {
                const text = 'please /summarize this';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['text', 'var']);
                expect(result.parts[0].text).to.equal('please ');
                expect((result.parts[1] as ParsedChatRequestVariablePart).variableArg).to.equal('summarize|this');
                expectFullCoverage(result.parts, text);
            });

            it('parses two adjacent known commands', async () => {
                const text = '/skill-one /skill-two';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['var', 'text', 'var']);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('skill-one');
                expect(result.parts[1].text).to.equal(' ');
                expect((result.parts[2] as ParsedChatRequestVariablePart).variableArg).to.equal('skill-two');
                expectFullCoverage(result.parts, text);
            });

            it('separates two argument-taking known commands', async () => {
                const text = '/summarize foo /explain bar';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['var', 'text', 'var']);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('summarize|foo');
                expect(result.parts[1].text).to.equal(' ');
                expect((result.parts[2] as ParsedChatRequestVariablePart).variableArg).to.equal('explain|bar');
                expectFullCoverage(result.parts, text);
            });

            it('parses the same command twice, each with its own argument', async () => {
                const text = '/hello Klaus /hello Maria';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['var', 'text', 'var']);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('hello|Klaus');
                expect(result.parts[1].text).to.equal(' ');
                expect((result.parts[2] as ParsedChatRequestVariablePart).variableArg).to.equal('hello|Maria');
                expectFullCoverage(result.parts, text);
            });

            it('parses the same command three times', async () => {
                const text = '/hello Klaus /hello Maria /hello Bob';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['var', 'text', 'var', 'text', 'var']);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('hello|Klaus');
                expect((result.parts[2] as ParsedChatRequestVariablePart).variableArg).to.equal('hello|Maria');
                expect((result.parts[4] as ParsedChatRequestVariablePart).variableArg).to.equal('hello|Bob');
                expectFullCoverage(result.parts, text);
            });

            it('parses the same command twice without arguments', async () => {
                const text = '/hello /hello';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['var', 'text', 'var']);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('hello');
                expect(result.parts[1].text).to.equal(' ');
                expect((result.parts[2] as ParsedChatRequestVariablePart).variableArg).to.equal('hello');
                expectFullCoverage(result.parts, text);
            });

            it('accepts a prompt fragment id as a command', async () => {
                const text = '/coder-system';
                const result = await parse(text);

                expect(result.parts.length).to.equal(1);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('coder-system');
            });

            it('parses a qualified command name containing a colon as one command', async () => {
                // A skill supplied by an installed artifact is addressed as `<qualifier>:<skill>`, so
                // the colon has to be part of the command name rather than terminate it.
                const text = '/bigquery:query-builder';
                const result = await parse(text);

                expect(result.parts.length).to.equal(1);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('bigquery:query-builder');
                expectFullCoverage(result.parts, text);
            });

            it('parses a qualified command name with arguments', async () => {
                const text = '/bigquery:query-builder count the rows';
                const result = await parse(text);

                expect(result.parts.length).to.equal(1);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('bigquery:query-builder|count the rows');
                expectFullCoverage(result.parts, text);
            });

            it('parses a qualified command name whose qualifier contains periods', async () => {
                // The qualifier is the plugin's directory name, which is derived from its identifier -
                // `io.github.acme/tools` becomes `io.github.acme_tools`, periods and all. Without them
                // in the charset the token falls through to the model as plain text, with no error.
                const text = '/io.github.acme_tools:my-skill';
                const result = await parse(text);

                expect(result.parts.length).to.equal(1);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('io.github.acme_tools:my-skill');
                expectFullCoverage(result.parts, text);
            });

            it('leaves an unknown colon-separated slash token as plain text', async () => {
                // Widening the command charset must not turn arbitrary text into a command.
                await expectPlainText('/unknown:thing');
                await expectPlainText('/io.github.other_tools:my-skill');
            });

            it('keeps trailing whitespace out of the command part', async () => {
                const text = '/summarize   ';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['var', 'text']);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('summarize');
                expect(result.parts[1].text).to.equal('   ');
                expectFullCoverage(result.parts, text);
            });

            it('trims whitespace around arguments', async () => {
                const text = '/summarize \t foo \t ';
                const result = await parse(text);

                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('summarize|foo');
                expectFullCoverage(result.parts, text);
            });
        });

        describe('arguments do not span multiple lines', () => {
            it('does not consume the following line for a command without arguments', async () => {
                const text = '/summarize\nsecond line';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['var', 'text']);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('summarize');
                expect(result.parts[1].text).to.equal('\nsecond line');
                expectFullCoverage(result.parts, text);
            });

            it('does not consume the following line for a command with arguments', async () => {
                const text = '/summarize foo\nsecond line\nthird line';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['var', 'text']);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('summarize|foo');
                expect(result.parts[1].text).to.equal('\nsecond line\nthird line');
                expectFullCoverage(result.parts, text);
            });

            it('handles CRLF line endings', async () => {
                const text = '/summarize foo\r\nsecond line';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['var', 'text']);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('summarize|foo');
                expect(result.parts[1].text).to.equal('\r\nsecond line');
                expectFullCoverage(result.parts, text);
            });

            it('parses a command on a later line', async () => {
                const text = 'first line\n/summarize foo\nthird line';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['text', 'var', 'text']);
                expect(result.parts[0].text).to.equal('first line\n');
                expect((result.parts[1] as ParsedChatRequestVariablePart).variableArg).to.equal('summarize|foo');
                expect(result.parts[2].text).to.equal('\nthird line');
                expectFullCoverage(result.parts, text);
            });

            it('parses one command per line', async () => {
                const text = '/summarize foo\n/explain bar';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['var', 'text', 'var']);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('summarize|foo');
                expect(result.parts[1].text).to.equal('\n');
                expect((result.parts[2] as ParsedChatRequestVariablePart).variableArg).to.equal('explain|bar');
                expectFullCoverage(result.parts, text);
            });

            it('parses the same command on consecutive lines', async () => {
                const text = '/hello Klaus\n/hello Maria';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['var', 'text', 'var']);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('hello|Klaus');
                expect(result.parts[1].text).to.equal('\n');
                expect((result.parts[2] as ParsedChatRequestVariablePart).variableArg).to.equal('hello|Maria');
                expectFullCoverage(result.parts, text);
            });

            it('keeps a blank line between two commands', async () => {
                const text = '/hello Klaus\n\n/hello Maria';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['var', 'text', 'var']);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('hello|Klaus');
                expect(result.parts[1].text).to.equal('\n\n');
                expect((result.parts[2] as ParsedChatRequestVariablePart).variableArg).to.equal('hello|Maria');
                expectFullCoverage(result.parts, text);
            });

            it('mixes a line break with a repetition on the same line', async () => {
                const text = '/hello Klaus\n/hello Maria and /hello Bob';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['var', 'text', 'var', 'text', 'var']);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableArg).to.equal('hello|Klaus');
                expect(result.parts[1].text).to.equal('\n');
                expect((result.parts[2] as ParsedChatRequestVariablePart).variableArg).to.equal('hello|Maria and');
                expect(result.parts[3].text).to.equal(' ');
                expect((result.parts[4] as ParsedChatRequestVariablePart).variableArg).to.equal('hello|Bob');
                expectFullCoverage(result.parts, text);
            });

            it('keeps a multi-line paste containing paths untouched', async () => {
                await expectPlainText('here is a stack trace:\n at /usr/lib/node/foo.js:12\nplease fix it');
            });
        });

        describe('interaction with other request parts', () => {
            it('does not turn a path into a command when it follows a variable', async () => {
                const text = '#file:/path/to/file.ext look at /home/user/notes.txt';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['var', 'text']);
                expect((result.parts[0] as ParsedChatRequestVariablePart).variableName).to.equal('file');
                expect(result.parts[1].text).to.equal(' look at /home/user/notes.txt');
                expectFullCoverage(result.parts, text);
            });

            it('does not turn a path into a command when it follows an agent mention', async () => {
                chatAgentService.getAgents.returns([{
                    id: 'agentA',
                    name: 'agentA',
                    description: '',
                    tags: [],
                    variables: [],
                    prompts: [],
                    agentSpecificVariables: [],
                    functions: [],
                    languageModelRequirements: [],
                    locations: [ChatAgentLocation.Panel],
                    invoke: async () => undefined
                } as ChatAgent]);
                const text = '@agentA please read /etc/hosts';
                const result = await parse(text);

                expect(result.parts.map(p => p.kind)).to.deep.equal(['agent', 'text']);
                expect(result.parts[1].text).to.equal(' please read /etc/hosts');
                expectFullCoverage(result.parts, text);
            });
        });
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
