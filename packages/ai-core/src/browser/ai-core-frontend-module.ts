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

import { bindRootContributionProvider, CommandContribution, CommandHandler, PreferenceContribution, ResourceResolver } from '@theia/core';
import {
    RemoteConnectionProvider,
    ServiceConnectionProvider,
} from '@theia/core/lib/browser/messaging/service-connection-provider';
import { ContainerModule } from '@theia/core/shared/inversify';
import { DefaultLanguageModelAliasRegistry } from './frontend-language-model-alias-registry.js';
import { HideAiPreferencesContribution, aiConfigurationOpenPlaceholderSchema } from './hide-ai-preferences-contribution.js';
import { ModelDiscoveryStatusService } from './model-discovery-status-service.js';
import { FavoriteModelsService } from './favorite-models-service.js';
import { TrustAwarePreferenceReader } from './trust-aware-preference-reader.js';
import { AiConfigurationServiceImpl } from './ai-configuration-service-impl.js';
import { LanguageModelAliasRegistry } from '../common/language-model-alias.js';
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
    Agent,
    FrontendLanguageModelRegistry,
    AiConfigurationService
} from '../common/index.js';
import {
    FrontendLanguageModelRegistryImpl,
    LanguageModelDelegateClientImpl,
} from './frontend-language-model-registry.js';
import { FrontendApplicationContribution, LabelProviderContribution } from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { LanguageGrammarDefinitionContribution } from '@theia/monaco/lib/browser/textmate';
import { AICoreFrontendApplicationContribution } from './ai-core-frontend-application-contribution.js';
import { bindAICorePreferences } from '../common/ai-core-preferences.js';
import { AISettingsServiceImpl } from './ai-settings-service.js';
import { DefaultPromptFragmentCustomizationService } from './frontend-prompt-customization-service.js';
import { DefaultFrontendVariableService, FrontendVariableService } from './frontend-variable-service.js';
import { PromptTemplateContribution } from './prompttemplate-contribution.js';
import { FileVariableContribution } from './file-variable-contribution.js';
import { WorkspaceRelativePathResolver } from './workspace-relative-path-resolver.js';
import { TheiaVariableContribution } from './theia-variable-contribution.js';
import { TodayVariableContribution } from '../common/today-variable-contribution.js';
import { AgentsVariableContribution } from '../common/agents-variable-contribution.js';
import { OpenEditorsVariableContribution } from './open-editors-variable-contribution.js';
import { SkillsVariableContribution } from './skills-variable-contribution.js';
import { AIActivationService, AIActivationServiceImpl } from './ai-activation-service.js';
import { AgentService, AgentServiceImpl } from '../common/agent-service.js';
import { AICommandHandlerFactory } from './ai-command-handler-factory.js';
import { AISettingsService } from '../common/settings-service.js';
import { DefaultSkillService, SkillDirectoryContribution, SkillService } from './skill-service.js';
import { SkillPromptCoordinator } from './skill-prompt-coordinator.js';
import { AiCoreCommandContribution } from './ai-core-command-contribution.js';
import { PromptVariableContribution } from './prompt-variable-contribution.js';
import { ProductNameVariableContribution } from './product-name-variable-contribution.js';
import { CapabilityVariableContribution } from '../common/capability-variable-contribution.js';
import { GenericCapabilitiesVariableContribution } from './generic-capabilities-variable-contribution.js';
import { GenericCapabilitiesPromptFragmentContribution } from './generic-capabilities-prompt-fragment-contribution.js';
import { AgentsMdService, DefaultAgentsMdService } from './agents-md-service.js';
import { AgentsMdVariableContribution } from './agents-md-variable-contribution.js';
import { AgentsMdPromptFragmentContribution } from './agents-md-prompt-fragment-contribution.js';
import { AgentsMdMigrationService } from './agents-md-migration-service.js';
import { AgentsMdFrontendApplicationContribution } from './agents-md-frontend-application-contribution.js';
import { LanguageModelService } from '../common/language-model-service.js';
import { FrontendLanguageModelServiceImpl } from './frontend-language-model-service.js';
import { TokenUsageFrontendService } from './token-usage-frontend-service.js';
import { TokenUsageFrontendServiceImpl, TokenUsageServiceClientImpl } from './token-usage-frontend-service-impl.js';
import { AIVariableUriLabelProvider } from './ai-variable-uri-label-provider.js';
import { AgentNotificationService } from './agent-notification-service.js';
import { OSNotificationService } from './os-notification-service.js';
import { WindowBlinkService } from './window-blink-service.js';

export default new ContainerModule(bind => {
    bindRootContributionProvider(bind, Agent);
    bindRootContributionProvider(bind, LanguageModelProvider);

    bind(FrontendLanguageModelRegistryImpl).toSelf().inSingletonScope();
    bind(FrontendLanguageModelRegistry).toService(FrontendLanguageModelRegistryImpl);
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

    bind(DefaultPromptFragmentCustomizationService).toSelf().inSingletonScope();
    bind(PromptFragmentCustomizationService).toService(DefaultPromptFragmentCustomizationService);
    bind(PromptServiceImpl).toSelf().inSingletonScope();
    bind(PromptService).toService(PromptServiceImpl);

    bind(PromptTemplateContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(PromptTemplateContribution);
    bind(CommandContribution).toService(PromptTemplateContribution);
    bind(TabBarToolbarContribution).toService(PromptTemplateContribution);

    bind(AISettingsServiceImpl).toSelf().inSingletonScope();
    bind(AISettingsService).toService(AISettingsServiceImpl);

    bind(DefaultSkillService).toSelf().inSingletonScope();
    bind(SkillService).toService(DefaultSkillService);

    bind(SkillPromptCoordinator).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SkillPromptCoordinator);

    bind(DefaultAgentsMdService).toSelf().inSingletonScope();
    bind(AgentsMdService).toService(DefaultAgentsMdService);
    bind(AgentsMdMigrationService).toSelf().inSingletonScope();
    bind(AgentsMdFrontendApplicationContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(AgentsMdFrontendApplicationContribution);
    bind(CommandContribution).toService(AgentsMdFrontendApplicationContribution);

    bindRootContributionProvider(bind, SkillDirectoryContribution);

    bindRootContributionProvider(bind, AIVariableContribution);
    bind(DefaultFrontendVariableService).toSelf().inSingletonScope();
    bind(FrontendVariableService).toService(DefaultFrontendVariableService);
    bind(AIVariableService).toService(FrontendVariableService);
    bind(FrontendApplicationContribution).toService(FrontendVariableService);

    bind(TheiaVariableContribution).toSelf().inSingletonScope();
    bind(AIVariableContribution).toService(TheiaVariableContribution);

    bind(PromptVariableContribution).toSelf().inSingletonScope();
    bind(AIVariableContribution).toService(PromptVariableContribution);
    bind(AIVariableContribution).to(TodayVariableContribution).inSingletonScope();
    bind(WorkspaceRelativePathResolver).toSelf().inSingletonScope();
    bind(AIVariableContribution).to(FileVariableContribution).inSingletonScope();
    bind(AgentsVariableContribution).toSelf().inSingletonScope();
    bind(AIVariableContribution).toService(AgentsVariableContribution);
    bind(AIVariableContribution).to(OpenEditorsVariableContribution).inSingletonScope();
    bind(SkillsVariableContribution).toSelf().inSingletonScope();
    bind(AIVariableContribution).toService(SkillsVariableContribution);
    bind(AgentsMdVariableContribution).toSelf().inSingletonScope();
    bind(AIVariableContribution).toService(AgentsMdVariableContribution);
    bind(AIVariableContribution).to(CapabilityVariableContribution).inSingletonScope();
    bind(AIVariableContribution).to(ProductNameVariableContribution).inSingletonScope();

    bind(GenericCapabilitiesVariableContribution).toSelf().inSingletonScope();
    bind(AIVariableContribution).toService(GenericCapabilitiesVariableContribution);

    bind(GenericCapabilitiesPromptFragmentContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(GenericCapabilitiesPromptFragmentContribution);

    bind(AgentsMdPromptFragmentContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(AgentsMdPromptFragmentContribution);

    bind(FrontendApplicationContribution).to(AICoreFrontendApplicationContribution).inSingletonScope();

    bind(ToolInvocationRegistry).to(ToolInvocationRegistryImpl).inSingletonScope();
    bindRootContributionProvider(bind, ToolProvider);

    bind(AIActivationServiceImpl).toSelf().inSingletonScope();
    bind(AIActivationService).toService(AIActivationServiceImpl);
    bind(FrontendApplicationContribution).toService(AIActivationService);

    bind(AgentServiceImpl).toSelf().inSingletonScope();
    bind(AgentService).toService(AgentServiceImpl);

    bind(AICommandHandlerFactory).toFactory<CommandHandler>(context => (handler: CommandHandler) => {
        const activationService = context.container.get<AIActivationService>(AIActivationService);
        return {
            execute: (...args: unknown[]) => handler.execute(...args),
            isEnabled: (...args: unknown[]) => activationService.canRun && (handler.isEnabled?.(...args) ?? true),
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

    bind(DefaultLanguageModelAliasRegistry).toSelf().inSingletonScope();
    bind(LanguageModelAliasRegistry).toService(DefaultLanguageModelAliasRegistry);

    // Hide all AI preferences from the Settings UI; they are managed in the AI Configuration view (#316).
    bind(PreferenceContribution).to(HideAiPreferencesContribution).inSingletonScope();
    // ...and leave a single placeholder entry there that links to the AI Configuration view.
    bind(PreferenceContribution).toConstantValue({ schema: aiConfigurationOpenPlaceholderSchema });

    bind(ModelDiscoveryStatusService).toSelf().inSingletonScope();
    bind(FavoriteModelsService).toSelf().inSingletonScope();

    // Internal implementation detail of AiConfigurationService; consumers inject AiConfigurationService.
    bind(TrustAwarePreferenceReader).toSelf().inSingletonScope();

    bind(AiConfigurationServiceImpl).toSelf().inSingletonScope();
    bind(AiConfigurationService).toService(AiConfigurationServiceImpl);

    bind(TokenUsageService).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const client = ctx.container.get<TokenUsageServiceClient>(TokenUsageServiceClient);
        return connection.createProxy<TokenUsageService>(TOKEN_USAGE_SERVICE_PATH, client);
    }).inSingletonScope();
    bind(AIVariableResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(AIVariableResourceResolver);
    bind(AIVariableUriLabelProvider).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(AIVariableUriLabelProvider);

    bind(AgentNotificationService).toSelf().inSingletonScope();
    bind(OSNotificationService).toSelf().inSingletonScope();
    bind(WindowBlinkService).toSelf().inSingletonScope();
    bind(ConfigurableInMemoryResources).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(ConfigurableInMemoryResources);
});
