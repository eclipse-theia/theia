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
import { bindContributionProvider, CommandContribution, CommandHandler } from '@theia/core';
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
    PromptCustomizationService,
    PromptService,
    PromptServiceImpl,
    ToolProvider
} from '../common';
import {
    FrontendLanguageModelRegistryImpl,
    LanguageModelDelegateClientImpl,
} from './frontend-language-model-registry';

import { bindViewContribution, FrontendApplicationContribution, WidgetFactory } from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { LanguageGrammarDefinitionContribution } from '@theia/monaco/lib/browser/textmate';
import { AIAgentConfigurationWidget } from './ai-configuration/agent-configuration-widget';
import { AIConfigurationSelectionService } from './ai-configuration/ai-configuration-service';
import { AIAgentConfigurationViewContribution } from './ai-configuration/ai-configuration-view-contribution';
import { AIConfigurationContainerWidget } from './ai-configuration/ai-configuration-widget';
import { AIVariableConfigurationWidget } from './ai-configuration/variable-configuration-widget';
import { AICoreFrontendApplicationContribution } from './ai-core-frontend-application-contribution';
import { bindAICorePreferences } from './ai-core-preferences';
import { AISettingsServiceImpl } from './ai-settings-service';
import { FrontendPromptCustomizationServiceImpl } from './frontend-prompt-customization-service';
import { FrontendVariableService } from './frontend-variable-service';
import { PromptTemplateContribution } from './prompttemplate-contribution';
import { TomorrowVariableContribution } from '../common/tomorrow-variable-contribution';
import { TheiaVariableContribution } from './theia-variable-contribution';
import { TodayVariableContribution } from '../common/today-variable-contribution';
import { AgentsVariableContribution } from '../common/agents-variable-contribution';
import { AIActivationService } from './ai-activation-service';
import { AgentService, AgentServiceImpl } from '../common/agent-service';
import { AICommandHandlerFactory } from './ai-command-handler-factory';
import { AISettingsService } from '../common/settings-service';

export default new ContainerModule(bind => {
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

    bind(FrontendPromptCustomizationServiceImpl).toSelf().inSingletonScope();
    bind(PromptCustomizationService).toService(FrontendPromptCustomizationServiceImpl);
    bind(PromptServiceImpl).toSelf().inSingletonScope();
    bind(PromptService).toService(PromptServiceImpl);

    bind(PromptTemplateContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(PromptTemplateContribution);
    bind(CommandContribution).toService(PromptTemplateContribution);
    bind(TabBarToolbarContribution).toService(PromptTemplateContribution);

    bind(AIConfigurationSelectionService).toSelf().inSingletonScope();
    bind(AIConfigurationContainerWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: AIConfigurationContainerWidget.ID,
            createWidget: () => ctx.container.get(AIConfigurationContainerWidget)
        }))
        .inSingletonScope();

    bindViewContribution(bind, AIAgentConfigurationViewContribution);
    bind(AISettingsService).to(AISettingsServiceImpl).inRequestScope();
    bindContributionProvider(bind, AIVariableContribution);
    bind(FrontendVariableService).toSelf().inSingletonScope();
    bind(AIVariableService).toService(FrontendVariableService);
    bind(FrontendApplicationContribution).toService(FrontendVariableService);
    bind(AIVariableContribution).to(TheiaVariableContribution).inSingletonScope();
    bind(AIVariableContribution).to(TodayVariableContribution).inSingletonScope();
    bind(AIVariableContribution).to(TomorrowVariableContribution).inSingletonScope();
    bind(AIVariableContribution).to(AgentsVariableContribution).inSingletonScope();

    bind(FrontendApplicationContribution).to(AICoreFrontendApplicationContribution).inSingletonScope();

    bind(AIVariableConfigurationWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: AIVariableConfigurationWidget.ID,
            createWidget: () => ctx.container.get(AIVariableConfigurationWidget)
        }))
        .inSingletonScope();

    bind(AIAgentConfigurationWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: AIAgentConfigurationWidget.ID,
            createWidget: () => ctx.container.get(AIAgentConfigurationWidget)
        }))
        .inSingletonScope();

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
            isToggled: (...args: unknown[]) => handler.isToggled?.(...args) ?? false
        };
    });
});
