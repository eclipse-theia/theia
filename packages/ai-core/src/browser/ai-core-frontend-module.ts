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
import { bindContributionProvider, CommandContribution } from '@theia/core';
import {
    RemoteConnectionProvider,
    ServiceConnectionProvider,
} from '@theia/core/lib/browser/messaging/service-connection-provider';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    LanguageModelDelegateClient,
    LanguageModelFrontendDelegate,
    LanguageModelProvider,
    LanguageModelRegistry,
    LanguageModelRegistryFrontendDelegate,
    languageModelDelegatePath,
    languageModelRegistryDelegatePath,
    PromptService,
    PromptCustomizationService,
    PromptServiceImpl
} from '../common';
import {
    FrontendLanguageModelRegistryImpl,
    LanguageModelDelegateClientImpl,
} from './frontend-language-model-registry';

import { bindPromptPreferences } from './prompt-preferences';
import { PromptTemplateContribution as PromptTemplateContribution } from './prompttemplate-contribution';
import { LanguageGrammarDefinitionContribution } from '@theia/monaco/lib/browser/textmate';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { bindViewContribution, FrontendApplicationContribution, WidgetFactory } from '@theia/core/lib/browser';
import { FrontendPromptCustomizationServiceImpl } from './frontend-prompt-customization-service';
import { AISettingsWidget } from './ai-settings-widget';
import { AISettingsViewContribution } from './ai-settings-view-contribution';
import { AICoreFrontendApplicationContribution } from './ai-core-frontend-application-contribution';
import { AISettingsService } from './ai-settings-service';

export default new ContainerModule(bind => {
    bindContributionProvider(bind, LanguageModelProvider);

    bind(FrontendLanguageModelRegistryImpl).toSelf().inSingletonScope();
    bind(LanguageModelRegistry).toService(FrontendLanguageModelRegistryImpl);

    bind(LanguageModelDelegateClientImpl).toSelf().inSingletonScope();
    bind(LanguageModelDelegateClient).toService(LanguageModelDelegateClientImpl);

    bind(LanguageModelRegistryFrontendDelegate).toDynamicValue(
        ctx => {
            const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
            return connection.createProxy<LanguageModelRegistryFrontendDelegate>(languageModelRegistryDelegatePath);
        }
    );

    bind(LanguageModelFrontendDelegate)
        .toDynamicValue(ctx => {
            const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
            const client = ctx.container.get<LanguageModelDelegateClient>(LanguageModelDelegateClient);
            return connection.createProxy<LanguageModelFrontendDelegate>(languageModelDelegatePath, client);
        })
        .inSingletonScope();

    bindPromptPreferences(bind);

    bind(FrontendPromptCustomizationServiceImpl).toSelf().inSingletonScope();
    bind(PromptCustomizationService).toService(FrontendPromptCustomizationServiceImpl);
    bind(PromptServiceImpl).toSelf().inSingletonScope();
    bind(PromptService).toService(PromptServiceImpl);

    bind(PromptTemplateContribution).toSelf().inSingletonScope();
    bind(LanguageGrammarDefinitionContribution).toService(PromptTemplateContribution);
    bind(CommandContribution).toService(PromptTemplateContribution);
    bind(TabBarToolbarContribution).toService(PromptTemplateContribution);

    bind(AISettingsWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: AISettingsWidget.ID,
            createWidget: () => ctx.container.get(AISettingsWidget)
        }))
        .inSingletonScope();

    bindViewContribution(bind, AISettingsViewContribution);
 	bind(AISettingsService).toSelf().inRequestScope();
    bind(FrontendApplicationContribution).to(AICoreFrontendApplicationContribution).inSingletonScope();
});
