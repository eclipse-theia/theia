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

import { Agent, AgentService, AIVariableContribution, bindToolProvider } from '@theia/ai-core/lib/common';
import { bindContributionProvider, CommandContribution } from '@theia/core';
import { FrontendApplicationContribution, LabelProviderContribution, PreferenceContribution } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    ChatAgent,
    ChatAgentService,
    ChatAgentServiceImpl,
    ChatRequestParser,
    ChatRequestParserImpl,
    ChatService,
    ToolCallChatResponseContentFactory,
    PinChatAgent,
    ChatServiceFactory,
    ChatAgentServiceFactory
} from '../common';
import { ChatAgentsVariableContribution } from '../common/chat-agents-variable-contribution';
import { CustomChatAgent } from '../common/custom-chat-agent';
import { DefaultResponseContentFactory, DefaultResponseContentMatcherProvider, ResponseContentMatcherProvider } from '../common/response-content-matcher';
import { aiChatPreferences } from './ai-chat-preferences';
import { bindChatToolPreferences, ToolConfirmationManager } from './chat-tool-preferences';
import { ChangeSetElementArgs, ChangeSetFileElement, ChangeSetFileElementFactory } from './change-set-file-element';
import { AICustomAgentsFrontendApplicationContribution } from './custom-agent-frontend-application-contribution';
import { FrontendChatServiceImpl } from './frontend-chat-service';
import { CustomAgentFactory } from './custom-agent-factory';
import { ChatToolRequestService } from '../common/chat-tool-request-service';
import { FrontendChatToolRequestService } from './chat-tool-request-service';
import { ChangeSetFileService } from './change-set-file-service';
import { ContextVariableLabelProvider } from './context-variable-label-provider';
import { ContextFileVariableLabelProvider } from './context-file-variable-label-provider';
import { FileChatVariableContribution } from './file-chat-variable-contribution';
import { ContextSummaryVariableContribution } from '../common/context-summary-variable';
import { ContextDetailsVariableContribution } from '../common/context-details-variable';
import { ChangeSetVariableContribution } from './change-set-variable';
import { ChatSessionNamingAgent, ChatSessionNamingService } from '../common/chat-session-naming-service';
import { ChangeSetDecorator, ChangeSetDecoratorService } from './change-set-decorator-service';
import { ChatSessionSummaryAgent } from '../common/chat-session-summary-agent';
import { TaskContextVariableContribution } from './task-context-variable-contribution';
import { TaskContextVariableLabelProvider } from './task-context-variable-label-provider';
import { TaskContextService, TaskContextStorageService } from './task-context-service';
import { InMemoryTaskContextStorage } from './task-context-storage-service';
import { AIChatFrontendContribution } from './ai-chat-frontend-contribution';
import { ImageContextVariableContribution } from './image-context-variable-contribution';
import { AgentDelegationTool } from './agent-delegation-tool';

export default new ContainerModule(bind => {
    bindContributionProvider(bind, ChatAgent);

    bind(FrontendChatToolRequestService).toSelf().inSingletonScope();
    bind(ChatToolRequestService).toService(FrontendChatToolRequestService);

    bind(ChatAgentServiceImpl).toSelf().inSingletonScope();
    bind(ChatAgentService).toService(ChatAgentServiceImpl);
    bind(PinChatAgent).toConstantValue(true);

    bind(ChatSessionNamingService).toSelf().inSingletonScope();
    bind(ChatSessionNamingAgent).toSelf().inSingletonScope();
    bind(Agent).toService(ChatSessionNamingAgent);

    bindContributionProvider(bind, ResponseContentMatcherProvider);
    bind(DefaultResponseContentMatcherProvider).toSelf().inSingletonScope();
    bind(ResponseContentMatcherProvider).toService(DefaultResponseContentMatcherProvider);
    bind(DefaultResponseContentFactory).toSelf().inSingletonScope();

    bind(AIVariableContribution).to(ChatAgentsVariableContribution).inSingletonScope();

    bind(ChatRequestParserImpl).toSelf().inSingletonScope();
    bind(ChatRequestParser).toService(ChatRequestParserImpl);

    bind(FrontendChatServiceImpl).toSelf().inSingletonScope();
    bind(ChatService).toService(FrontendChatServiceImpl);

    bind(ChatServiceFactory).toDynamicValue(ctx => () =>
        ctx.container.get<ChatService>(ChatService)
    );
    bind(ChatAgentServiceFactory).toDynamicValue(ctx => () =>
        ctx.container.get<ChatAgentService>(ChatAgentService)
    );

    bind(PreferenceContribution).toConstantValue({ schema: aiChatPreferences });

    // Tool confirmation preferences
    bindChatToolPreferences(bind);
    bind(ToolConfirmationManager).toSelf().inSingletonScope();

    bind(CustomChatAgent).toSelf();
    bind(CustomAgentFactory).toFactory<CustomChatAgent, [string, string, string, string, string]>(
        ctx => (id: string, name: string, description: string, prompt: string, defaultLLM: string) => {
            const agent = ctx.container.get<CustomChatAgent>(CustomChatAgent);
            agent.id = id;
            agent.name = name;
            agent.description = description;
            agent.prompt = prompt;
            agent.languageModelRequirements = [{
                purpose: 'chat',
                identifier: defaultLLM,
            }];
            ctx.container.get<ChatAgentService>(ChatAgentService).registerChatAgent(agent);
            ctx.container.get<AgentService>(AgentService).registerAgent(agent);
            return agent;
        });
    bind(FrontendApplicationContribution).to(AICustomAgentsFrontendApplicationContribution).inSingletonScope();

    bind(ContextVariableLabelProvider).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(ContextVariableLabelProvider);
    bind(ContextFileVariableLabelProvider).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(ContextFileVariableLabelProvider);

    bind(ChangeSetFileService).toSelf().inSingletonScope();
    bind(ChangeSetFileElementFactory).toFactory(ctx => (args: ChangeSetElementArgs) => {
        const container = ctx.container.createChild();
        container.bind(ChangeSetElementArgs).toConstantValue(args);
        container.bind(ChangeSetFileElement).toSelf().inSingletonScope();
        return container.get(ChangeSetFileElement);
    });

    bind(ChangeSetDecoratorService).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ChangeSetDecoratorService);
    bindContributionProvider(bind, ChangeSetDecorator);
    bind(ToolCallChatResponseContentFactory).toSelf().inSingletonScope();
    bind(AIVariableContribution).to(FileChatVariableContribution).inSingletonScope();
    bind(AIVariableContribution).to(ContextSummaryVariableContribution).inSingletonScope();
    bind(AIVariableContribution).to(ContextDetailsVariableContribution).inSingletonScope();
    bind(AIVariableContribution).to(ChangeSetVariableContribution).inSingletonScope();

    bind(ChatSessionSummaryAgent).toSelf().inSingletonScope();
    bind(Agent).toService(ChatSessionSummaryAgent);

    bind(TaskContextVariableContribution).toSelf().inSingletonScope();
    bind(AIVariableContribution).toService(TaskContextVariableContribution);
    bind(TaskContextVariableLabelProvider).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(TaskContextVariableLabelProvider);

    bind(ImageContextVariableContribution).toSelf().inSingletonScope();
    bind(AIVariableContribution).toService(ImageContextVariableContribution);
    bind(LabelProviderContribution).toService(ImageContextVariableContribution);

    bind(TaskContextService).toSelf().inSingletonScope();
    bind(InMemoryTaskContextStorage).toSelf().inSingletonScope();
    bind(TaskContextStorageService).toService(InMemoryTaskContextStorage);
    bind(AIChatFrontendContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(AIChatFrontendContribution);

    bindToolProvider(AgentDelegationTool, bind);
});
