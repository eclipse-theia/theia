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

import { bindContributionProvider, CommandContribution, CommandHandler, ResourceResolver } from '@theia/core';
import {
    RemoteConnectionProvider,
    ServiceConnectionProvider,
} from '@theia/core/lib/browser/messaging/service-connection-provider';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    AIVariableContribution,
    AIVariableService,
    ToolInvocationRegistry,
    ToolInvocationRegistryImpl,
    LanguageModelDelegateClient,
    languageModelDelegatePath,
    LanguageModelFrontendDelegate,
    LanguageModelProvider,
    LanguageModelRegistry,
    LanguageModelRegistryClient,
    languageModelRegistryDelegatePath,
    LanguageModelRegistryFrontendDelegate,
    PromptFragmentCustomizationService,
    PromptService,
    PromptServiceImpl,
    ToolProvider,
    TokenUsageService,
    TOKEN_USAGE_SERVICE_PATH,
    TokenUsageServiceClient,
    AIVariableResourceResolver,
    ConfigurableInMemoryResources,
    Agent
} from '../common';
import {
    FrontendLanguageModelRegistryImpl,
    LanguageModelDelegateClientImpl,
} from './frontend-language-model-registry';
import { FrontendApplicationContribution, LabelProviderContribution, PreferenceContribution } from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { LanguageGrammarDefinitionContribution } from '@theia/monaco/lib/browser/textmate';
import { AICoreFrontendApplicationContribution } from './ai-core-frontend-application-contribution';
import { bindAICorePreferences } from './ai-core-preferences';
import { AgentSettingsPreferenceSchema } from './agent-preferences';
import { AISettingsServiceImpl } from './ai-settings-service';
import { DefaultPromptFragmentCustomizationService } from './frontend-prompt-customization-service';
import { DefaultFrontendVariableService, FrontendVariableService } from './frontend-variable-service';
import { PromptTemplateContribution } from './prompttemplate-contribution';
import { FileVariableContribution } from './file-variable-contribution';
import { TheiaVariableContribution } from './theia-variable-contribution';
import { TodayVariableContribution } from '../common/today-variable-contribution';
import { AgentsVariableContribution } from '../common/agents-variable-contribution';
import { OpenEditorsVariableContribution } from './open-editors-variable-contribution';
import { AIActivationService } from './ai-activation-service';
import { AgentService, AgentServiceImpl } from '../common/agent-service';
import { AICommandHandlerFactory } from './ai-command-handler-factory';
import { AISettingsService } from '../common/settings-service';
import { AiCoreCommandContribution } from './ai-core-command-contribution';
import { PromptVariableContribution } from '../common/prompt-variable-contribution';
import { LanguageModelService } from '../common/language-model-service';
import { FrontendLanguageModelServiceImpl } from './frontend-language-model-service';
import { TokenUsageFrontendService } from './token-usage-frontend-service';
import { TokenUsageFrontendServiceImpl, TokenUsageServiceClientImpl } from './token-usage-frontend-service-impl';
import { AIVariableUriLabelProvider } from './ai-variable-uri-label-provider';
import { AgentCompletionNotificationService } from './agent-completion-notification-service';
import { OSNotificationService } from './os-notification-service';
import { WindowBlinkService } from './window-blink-service';

export default new ContainerModule(bind => {
    bindContributionProvider(bind, Agent);
    bindContributionProvider(bind, LanguageModelProvider);

    bind(FrontendLanguageModelRegistryImpl).toSelf().inSingletonScope();
    bind(LanguageModelRegistry).toService(FrontendLanguageModelRegistryImpl);

    bind(LanguageModelDelegateClientImpl).toSelf().inSingletonScope();
    bind(LanguageModelDelegateClient).toService(LanguageModelDelegateClientImpl);
    bind(LanguageModelRegistryClient).toService(LanguageModelDelegateClient);

    bind(LanguageModelRegistryFrontendDelegate).toDynamicValue(
        ctx => {
            const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
            const client = ctx.container.get<LanguageModelRegistryClient>(LanguageModelRegistryClient);
            return connection.createProxy<LanguageModelRegistryFrontendDelegate>(languageModelRegistryDelegatePath, client);
        }
    );

    bind(LanguageModelFrontendDelegate)
        .toDynamicValue(ctx => {
            const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
            const client = ctx.container.get<LanguageModelDelegateClient>(LanguageModelDelegateClient);
            return connection.createProxy<LanguageModelFrontendDelegate>(languageModelDelegatePath, client);
        })
        .inSingletonScope();

    bindAICorePreferences(bind);
    bind(PreferenceContribution).toConstantValue({ schema: AgentSettingsPreferenceSchema });

    bind(DefaultPromptFragmentCustomizationService).toSelf().inSingletonScope();
    bind(PromptFragmentCustomizationService).toService(DefaultPromptFragmentCustomizationService);
    bind(PromptServiceImpl).toSelf().inSingletonScope();
    bind(PromptService).toService(PromptServiceImpl);

    bind(PromptTemplateContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(PromptTemplateContribution);
    bind(CommandContribution).toService(PromptTemplateContribution);
    bind(TabBarToolbarContribution).toService(PromptTemplateContribution);

    bind(AISettingsService).to(AISettingsServiceImpl).inSingletonScope();
    bindContributionProvider(bind, AIVariableContribution);
    bind(DefaultFrontendVariableService).toSelf().inSingletonScope();
    bind(FrontendVariableService).toService(DefaultFrontendVariableService);
    bind(AIVariableService).toService(FrontendVariableService);
    bind(FrontendApplicationContribution).toService(FrontendVariableService);

    bind(TheiaVariableContribution).toSelf().inSingletonScope();
    bind(AIVariableContribution).toService(TheiaVariableContribution);

    bind(AIVariableContribution).to(PromptVariableContribution).inSingletonScope();
    bind(AIVariableContribution).to(TodayVariableContribution).inSingletonScope();
    bind(AIVariableContribution).to(FileVariableContribution).inSingletonScope();
    bind(AIVariableContribution).to(AgentsVariableContribution).inSingletonScope();
    bind(AIVariableContribution).to(OpenEditorsVariableContribution).inSingletonScope();

    bind(FrontendApplicationContribution).to(AICoreFrontendApplicationContribution).inSingletonScope();

    bind(ToolInvocationRegistry).to(ToolInvocationRegistryImpl).inSingletonScope();
    bindContributionProvider(bind, ToolProvider);

    bind(AIActivationService).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(AIActivationService);
    bind(AgentServiceImpl).toSelf().inSingletonScope();
    bind(AgentService).toService(AgentServiceImpl);

    bind(AICommandHandlerFactory).toFactory<CommandHandler>(context => (handler: CommandHandler) => {
        const activationService = context.container.get(AIActivationService);
        return {
            execute: (...args: unknown[]) => handler.execute(...args),
            isEnabled: (...args: unknown[]) => activationService.isActive && (handler.isEnabled?.(...args) ?? true),
            isVisible: (...args: unknown[]) => activationService.isActive && (handler.isVisible?.(...args) ?? true),
            isToggled: handler.isToggled
        };
    });

    bind(AiCoreCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(AiCoreCommandContribution);
    bind(FrontendLanguageModelServiceImpl).toSelf().inSingletonScope();
    bind(LanguageModelService).toService(FrontendLanguageModelServiceImpl);

    bind(TokenUsageFrontendService).to(TokenUsageFrontendServiceImpl).inSingletonScope();
    bind(TokenUsageServiceClient).to(TokenUsageServiceClientImpl).inSingletonScope();

    bind(TokenUsageService).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const client = ctx.container.get<TokenUsageServiceClient>(TokenUsageServiceClient);
        return connection.createProxy<TokenUsageService>(TOKEN_USAGE_SERVICE_PATH, client);
    }).inSingletonScope();
    bind(AIVariableResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(AIVariableResourceResolver);
    bind(AIVariableUriLabelProvider).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(AIVariableUriLabelProvider);

    bind(AgentCompletionNotificationService).toSelf().inSingletonScope();
    bind(OSNotificationService).toSelf().inSingletonScope();
    bind(WindowBlinkService).toSelf().inSingletonScope();
    bind(ConfigurableInMemoryResources).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(ConfigurableInMemoryResources);
});
