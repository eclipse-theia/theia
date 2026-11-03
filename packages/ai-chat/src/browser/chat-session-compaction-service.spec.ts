// *****************************************************************************
// Copyright (C) 2026 Yash Kakade and others.
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
import * as sinon from 'sinon';
import {
    AgentService, DefaultAIVariableService, LanguageModel, LanguageModelMessage, LanguageModelRequirement, LanguageModelResponse, LanguageModelService, PromptFragment,
    PromptService, PromptServiceImpl, ToolInvocationRegistryImpl, UserRequest
} from '@theia/ai-core';
import { PromptVariableContribution } from '@theia/ai-core/lib/browser/prompt-variable-contribution';
import { CommandService, ILogger, Logger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { Container } from '@theia/core/shared/inversify';
import {
    AbstractChatAgent, ChatAgent, ChatAgentLocation, ChatRequest, ChatSessionCompaction, ChatSessionCompactionService, ChatResponseContent, CompactionChatResponseContent,
    CompactionChatResponseContentImpl, ErrorChatResponseContent, MutableChatModel, MutableChatRequestModel, ParsedChatRequest, ParsedChatRequestAgentPart, ParsedChatRequestPart,
    ParsedChatRequestTextPart, ParsedChatRequestVariablePart,
    SESSION_COMPACTION_PROVIDER, TextChatResponseContentImpl
} from '../common';
import { ChatAgentServiceImpl } from '../common/chat-agent-service';
import { ChatRequestParserImpl } from '../common/chat-request-parser';
import { ChatSessionSummaryAgent } from '../common/chat-session-summary-agent';
import { CHAT_SESSION_SUMMARY_PROMPT } from '../common/chat-session-summary-agent-prompt';
import { ChatSessionCompactionServiceImpl, COMPACT_COMMAND_FRAGMENT_ID } from './chat-session-compaction-service';
import { ChatSessionSummarizer } from './chat-session-summarizer';

disableJSDOM();

const SUMMARY_PROMPT = 'Summarize the conversation above.';

/** Stands in for the summary agent with a language model: it records the real prompt and answers with a fixed text. */
class FakeSummaryAgent extends AbstractChatAgent {
    readonly id = ChatSessionSummaryAgent.ID;
    readonly name = 'Fake Summary';
    readonly languageModelRequirements: LanguageModelRequirement[] = [];
    protected readonly defaultLanguageModelPurpose = 'chat';
    protected override logger: ILogger = new MockLogger();

    prompt: LanguageModelMessage[] = [];
    answer = 'the summary';
    failure: Error | undefined;
    block: Deferred<void> | undefined;
    invocations = 0;
    inner: MutableChatRequestModel | undefined;
    /** The request to the language model, if a test sets a language model service. */
    llmRequest: UserRequest | undefined;

    override async invoke(request: MutableChatRequestModel): Promise<void> {
        this.invocations++;
        this.inner = request;
        this.prompt = await this.getMessages(request.session, true);
        if (this.languageModelService) {
            await this.sendLlmRequest(request, this.prompt, [], undefined, { id: 'anthropic/model' } as LanguageModel);
        }
        await this.block?.promise;
        if (request.response.isCanceled) {
            return;
        }
        if (this.failure) {
            this.handleError(request, this.failure);
            return;
        }
        request.response.response.addContent(new TextChatResponseContentImpl(this.answer));
        request.response.setTokenUsage({ inputTokens: 1000, outputTokens: 20 });
        request.response.complete();
    }

    protected addContentsToResponse(_response: LanguageModelResponse, _request: MutableChatRequestModel): Promise<void> {
        return Promise.resolve();
    }

    nextPrompt(model: MutableChatModel): Promise<LanguageModelMessage[]> {
        return this.getMessages(model);
    }

    recordLlmRequests(): void {
        this.languageModelService = {
            sendRequest: async (_model: LanguageModel, request: UserRequest) => {
                this.llmRequest = request;
                return { text: '' };
            }
        } as unknown as LanguageModelService;
    }

    useCompactionService(compactionService: ChatSessionCompactionService): void {
        this.compactionService = compactionService;
    }
}

function textPart(text: string): ParsedChatRequestPart {
    return new ParsedChatRequestTextPart({ start: 0, endExclusive: text.length }, text);
}

function commandPart(arg: string): ParsedChatRequestPart {
    return new ParsedChatRequestVariablePart({ start: 0, endExclusive: arg.length + 1 }, 'prompt', arg);
}

function parsed(text: string, parts: ParsedChatRequestPart[] = [textPart(text)]): ParsedChatRequest {
    const request: ChatRequest = { text };
    return { request, parts, toolRequests: new Map(), variables: [] };
}

function texts(messages: LanguageModelMessage[]): string[] {
    return messages.filter(LanguageModelMessage.isTextMessage).map(message => `${message.actor}: ${message.text}`);
}

describe('ChatSessionCompactionServiceImpl', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let service: ChatSessionCompactionServiceImpl;
    let summaryAgent: FakeSummaryAgent;
    let commands: PromptFragment[];
    let registered: PromptFragment[];
    let model: MutableChatModel;

    beforeEach(() => {
        summaryAgent = new FakeSummaryAgent();
        registered = [];
        const container = new Container();
        container.bind(AgentService).toConstantValue({ getAgents: () => [summaryAgent] } as unknown as AgentService);
        container.bind(PromptService).toConstantValue({
            addBuiltInPromptFragment: (fragment: PromptFragment) => { registered.push(fragment); },
            getResolvedPromptFragment: async () => ({ id: 'summary', text: SUMMARY_PROMPT }),
            getCommands: () => commands
        } as unknown as PromptService);
        container.bind(ILogger).toConstantValue(new MockLogger());
        container.bind(ChatSessionSummarizer).toSelf().inSingletonScope();
        container.bind(ChatSessionCompactionServiceImpl).toSelf().inSingletonScope();
        service = container.get(ChatSessionCompactionServiceImpl);
        commands = [...registered];
        model = new MutableChatModel(ChatAgentLocation.Panel);
    });

    function addExchange(text: string, answer: string): MutableChatRequestModel {
        const request = model.addRequest(parsed(text));
        request.response.response.addContent(new TextChatResponseContentImpl(answer));
        request.response.complete();
        return request;
    }

    function addCommand(arg = 'compact'): MutableChatRequestModel {
        return model.addRequest(parsed(`/${arg}`, [commandPart(arg)]));
    }

    function markers(request: MutableChatRequestModel): ChatResponseContent[] {
        return request.response.response.content.filter(CompactionChatResponseContent.is);
    }

    describe('isCompactionCommand', () => {
        it('registers the command for all agents', () => {
            expect(registered).to.have.lengthOf(1);
            expect(registered[0].id).to.equal(COMPACT_COMMAND_FRAGMENT_ID);
            expect((registered[0] as { commandName?: string }).commandName).to.equal('compact');
            expect((registered[0] as { commandAgents?: string[] }).commandAgents).to.equal(undefined);
        });

        it('accepts the command, alone or with an argument or a mentioned agent', () => {
            expect(service.isCompactionCommand(addCommand(), summaryAgent)).to.equal(true);
            expect(service.isCompactionCommand(addCommand('compact|focus on tests'), summaryAgent)).to.equal(true);
            const mentioned = model.addRequest(parsed('@Coder /compact', [
                new ParsedChatRequestAgentPart({ start: 0, endExclusive: 6 }, 'Coder', 'Coder'),
                textPart(' '),
                commandPart('compact')
            ]));
            expect(service.isCompactionCommand(mentioned, summaryAgent)).to.equal(true);
        });

        it('rejects other requests', () => {
            expect(service.isCompactionCommand(model.addRequest(parsed('compact this')), summaryAgent)).to.equal(false);
            expect(service.isCompactionCommand(addCommand('remember'), summaryAgent)).to.equal(false);
            expect(service.isCompactionCommand(addCommand('compacting'), summaryAgent)).to.equal(false);
            const insideText = model.addRequest(parsed('please /compact', [textPart('please '), commandPart('compact')]));
            expect(service.isCompactionCommand(insideText, summaryAgent)).to.equal(false);
        });

        it('is the command that an agent based on the chat model handles in place of invoke', async () => {
            addExchange('one', 'a');
            summaryAgent.useCompactionService(service);
            const command = addCommand();

            expect(await summaryAgent.handleCommand(model.addRequest(parsed('compact this')))).to.equal(false);
            expect(summaryAgent.invocations).to.equal(0);

            expect(await summaryAgent.handleCommand(command)).to.equal(true);
            expect(command.isCompactionRequest).to.equal(true);
            expect(command.response.isComplete).to.equal(true);
            // Only the inner summary request invokes the agent, not the command
            expect(summaryAgent.invocations).to.equal(1);
            expect(summaryAgent.inner).to.not.equal(command);
        });

        it('is not handled by an agent without a compaction service', async () => {
            expect(await summaryAgent.handleCommand(addCommand())).to.equal(false);
        });

        it('gives precedence to another command with the same name', () => {
            commands = [{ id: 'my-compact', template: 'mine', isCommand: true, commandName: 'compact' } as PromptFragment];

            expect(service.isCompactionCommand(addCommand(), summaryAgent)).to.equal(false);
        });
    });

    describe('with the real request parser and prompt service', () => {
        let parser: ChatRequestParserImpl;
        let promptService: PromptServiceImpl;
        let chatAgentService: sinon.SinonStubbedInstance<ChatAgentServiceImpl>;

        beforeEach(() => {
            promptService = new PromptServiceImpl();
            (promptService as unknown as { logger: ILogger }).logger = new MockLogger();
            const container = new Container();
            container.bind(AgentService).toConstantValue({ getAgents: () => [summaryAgent] } as unknown as AgentService);
            container.bind(PromptService).toConstantValue(promptService);
            container.bind(ILogger).toConstantValue(new MockLogger());
            container.bind(ChatSessionSummarizer).toSelf().inSingletonScope();
            container.bind(ChatSessionCompactionServiceImpl).toSelf().inSingletonScope();
            service = container.get(ChatSessionCompactionServiceImpl);

            const variableService = new DefaultAIVariableService({ getContributions: () => [] });
            (variableService as unknown as Record<string, unknown>)['logger'] = new MockLogger();
            const promptVariables = new PromptVariableContribution();
            (promptVariables as unknown as Record<string, unknown>)['promptService'] = promptService;
            (promptVariables as unknown as Record<string, unknown>)['logger'] = new MockLogger();
            (promptVariables as unknown as Record<string, unknown>)['commandService'] = {} as CommandService;
            promptVariables.registerVariables(variableService);
            chatAgentService = sinon.createStubInstance(ChatAgentServiceImpl);
            parser = new ChatRequestParserImpl(
                chatAgentService,
                variableService,
                sinon.createStubInstance(ToolInvocationRegistryImpl),
                sinon.createStubInstance(Logger) as ILogger
            );
            (parser as unknown as { promptService: PromptService }).promptService = promptService;
        });

        async function isCommand(text: string, agent: ChatAgent = summaryAgent): Promise<boolean> {
            const message = await parser.parseChatRequest({ text }, ChatAgentLocation.Panel, { variables: [] });
            return service.isCompactionCommand(model.addRequest(message), agent);
        }

        it('recognizes the typed command', async () => {
            expect(await isCommand('/compact')).to.equal(true);
            expect(await isCommand('  /compact  ')).to.equal(true);
            expect(await isCommand('/compact focus on the tests')).to.equal(true);
        });

        it('passes the typed text to the summary prompt', async () => {
            promptService.addBuiltInPromptFragment({ id: CHAT_SESSION_SUMMARY_PROMPT.id, template: SUMMARY_PROMPT });
            addExchange('one', 'a');
            const message = await parser.parseChatRequest({ text: '/compact focus on the tests' }, ChatAgentLocation.Panel, { variables: [] });

            await service.compact(model.addRequest(message));

            expect(texts(summaryAgent.prompt).at(-1)).to.equal(`user: ${SUMMARY_PROMPT}\n\nAlso follow these instructions from the user: focus on the tests`);
        });

        it('does not recognize the command inside other text', async () => {
            expect(await isCommand('please /compact')).to.equal(false);
            expect(await isCommand('/compact\nand more text')).to.equal(false);
            expect(await isCommand('/compacting')).to.equal(false);
        });

        it('leaves the command to an agent with its own command of this name', async () => {
            promptService.addBuiltInPromptFragment({ id: 'own-compact', template: '/compact', isCommand: true, commandName: 'compact', commandAgents: [summaryAgent.id] });

            expect(await isCommand('/compact')).to.equal(false);
        });

        describe('resolves a command to the template for the agent that gets the request', () => {
            const OWN_AGENT = 'Own';

            async function promptText(text: string, agentId?: string): Promise<string> {
                const options = agentId ? { selectAgentId: () => agentId } : undefined;
                const message = await parser.parseChatRequest({ text }, ChatAgentLocation.Panel, { variables: [] }, options);
                return message.parts.map(part => part.promptText).join('');
            }

            beforeEach(() => {
                // Registered first, so a lookup by name alone finds this one
                promptService.addBuiltInPromptFragment({ id: 'review-all', template: 'Review for all: $ARGUMENTS', isCommand: true, commandName: 'review' });
                promptService.addBuiltInPromptFragment({
                    id: 'review-own', template: 'Review for Own: $ARGUMENTS', isCommand: true, commandName: 'review', commandAgents: [OWN_AGENT]
                });
                promptService.addBuiltInPromptFragment({
                    id: 'own-compact', template: 'Compact for Own: $ARGUMENTS', isCommand: true, commandName: 'compact', commandAgents: [OWN_AGENT]
                });
            });

            it('uses the command for the selected agent', async () => {
                expect(await promptText('/review focus on the tests', OWN_AGENT)).to.equal('Review for Own: focus on the tests');
                expect(await promptText('/compact focus on the tests', OWN_AGENT)).to.equal('Compact for Own: focus on the tests');
            });

            it('uses the command for all agents for another agent', async () => {
                expect(await promptText('/review focus on the tests', 'Other')).to.equal('Review for all: focus on the tests');
                expect(await promptText('/compact focus on the tests', 'Other')).to.equal('/compact');
            });

            it('uses the agent that the agent service resolves if no agent is selected', async () => {
                chatAgentService.resolveAgent.returns({ id: OWN_AGENT } as ChatAgent);

                expect(await promptText('/review focus on the tests')).to.equal('Review for Own: focus on the tests');
            });

            it('agrees with the commands of the completion', async () => {
                for (const agentId of [OWN_AGENT, 'Other']) {
                    const completion = promptService.getCommands(agentId).find(command => command.commandName === 'review');
                    expect(promptService.getPromptFragmentByCommandName('review', agentId)?.id).to.equal(completion?.id);
                }
            });
        });

        it('leaves the command to a custom command of the user for all agents', async () => {
            promptService.addBuiltInPromptFragment({ id: 'custom-compact', template: 'Be brief.', isCommand: true, commandName: 'compact' });

            expect(await isCommand('/compact')).to.equal(false);
        });
    });

    describe('compact', () => {
        it('replaces the history in the prompt with the summary and stays in the session', async () => {
            const one = addExchange('one', 'a');
            const two = addExchange('two', 'b');
            const command = addCommand();

            await service.compact(command);

            expect(command.isCompactionRequest).to.equal(true);
            expect(command.response.isComplete).to.equal(true);
            expect(command.response.isError).to.equal(false);
            const [marker] = markers(command) as CompactionChatResponseContent[];
            expect(marker.provider).to.equal(SESSION_COMPACTION_PROVIDER);
            expect(marker.summary).to.equal('the summary');
            expect(ChatSessionCompaction.getStaleRequests(model)).to.deep.equal([one, two]);
            expect(model.getRequests()).to.have.lengthOf(3);

            addExchange('three', 'c');
            expect(texts(await summaryAgent.nextPrompt(model))).to.deep.equal([
                'user: The earlier part of this conversation was compacted. This is its summary:\n\nthe summary',
                'user: three',
                'ai: c'
            ]);
        });

        it('summarizes the history without the command', async () => {
            addExchange('one', 'a');
            const command = addCommand();

            await service.compact(command);

            expect(texts(summaryAgent.prompt)).to.deep.equal(['user: one', 'ai: a', `user: ${SUMMARY_PROMPT}`]);
        });

        it('adds the text after the command to the summary prompt', async () => {
            addExchange('one', 'a');

            await service.compact(addCommand('compact|focus on tests'));

            expect(texts(summaryAgent.prompt).at(-1)).to.equal(`user: ${SUMMARY_PROMPT}\n\nAlso follow these instructions from the user: focus on tests`);
        });

        it('keeps the compaction setting of the session, so that the provider replays a server-side marker', async () => {
            model.setSettings({ commonSettings: { compaction: { enabled: true, tokenThreshold: 50000 } }, temperature: 0.1 });
            const one = model.addRequest(parsed('one'));
            one.response.response.addContent(new CompactionChatResponseContentImpl('anthropic', { content: 'server summary' }, 'server summary'));
            one.response.response.addContent(new TextChatResponseContentImpl('a'));
            one.response.complete();
            summaryAgent.recordLlmRequests();

            await service.compact(addCommand());

            expect(summaryAgent.llmRequest?.compaction).to.deep.equal({ enabled: true, tokenThreshold: 50000 });
            // Only the compaction setting: the provider settings of the session are not for the summary agent
            expect(summaryAgent.llmRequest?.settings).to.deep.equal({});
            const replayed = summaryAgent.llmRequest?.messages.filter(LanguageModelMessage.isCompactionMessage);
            expect(replayed?.map(message => message.provider)).to.deep.equal(['anthropic']);
        });

        it('sends no compaction setting if the session has none', async () => {
            addExchange('one', 'a');
            summaryAgent.recordLlmRequests();

            await service.compact(addCommand());

            expect(summaryAgent.llmRequest?.compaction).to.equal(undefined);
        });

        it('records the usage of the summary request', async () => {
            addExchange('one', 'a');
            const command = addCommand();

            await service.compact(command);

            expect(command.response.tokenUsage).to.deep.equal({ inputTokens: 1000, outputTokens: 20 });
        });

        it('summarizes only the summary and later messages in a second compaction', async () => {
            addExchange('one', 'a');
            await service.compact(addCommand());
            addExchange('two', 'b');

            await service.compact(addCommand());

            expect(texts(summaryAgent.prompt)).to.deep.equal([
                'user: The earlier part of this conversation was compacted. This is its summary:\n\nthe summary',
                'user: two',
                'ai: b',
                `user: ${SUMMARY_PROMPT}`
            ]);
        });

        it('does not call the language model if there is nothing to compact', async () => {
            const command = addCommand();

            await service.compact(command);

            expect(summaryAgent.invocations).to.equal(0);
            expect(command.response.isComplete).to.equal(true);
            expect(markers(command)).to.deep.equal([]);
            expect(command.response.response.asDisplayString()).to.equal('There is nothing to compact yet.');
        });

        it('does not call the language model right after a compaction', async () => {
            addExchange('one', 'a');
            await service.compact(addCommand());
            summaryAgent.invocations = 0;

            await service.compact(addCommand());

            expect(summaryAgent.invocations).to.equal(0);
        });

        it('keeps the history if the language model fails', async () => {
            addExchange('one', 'a');
            summaryAgent.failure = new Error('model unavailable');
            const command = addCommand();

            await service.compact(command);

            expect(command.response.isError).to.equal(true);
            expect(command.response.response.content.some(ErrorChatResponseContent.is)).to.equal(true);
            expect(markers(command)).to.deep.equal([]);
            expect(ChatSessionCompaction.getStaleRequests(model)).to.deep.equal([]);
            expect(texts(await summaryAgent.nextPrompt(model))).to.deep.equal(['user: one', 'ai: a']);
        });

        it('keeps the history if the summary is empty', async () => {
            addExchange('one', 'a');
            summaryAgent.answer = '  ';
            const command = addCommand();

            await service.compact(command);

            expect(command.response.isError).to.equal(true);
            expect(ChatSessionCompaction.getStaleRequests(model)).to.deep.equal([]);
        });

        it('keeps the history and stops the summary request if the user cancels', async () => {
            addExchange('one', 'a');
            summaryAgent.block = new Deferred();
            const command = addCommand();

            const compaction = service.compact(command);
            await new Promise(resolve => setTimeout(resolve));
            command.cancel();
            summaryAgent.block.resolve();
            await compaction;

            expect(summaryAgent.inner?.response.isCanceled).to.equal(true);
            expect(command.response.isError).to.equal(false);
            expect(markers(command)).to.deep.equal([]);
            expect(ChatSessionCompaction.getStaleRequests(model)).to.deep.equal([]);
        });
    });
});
