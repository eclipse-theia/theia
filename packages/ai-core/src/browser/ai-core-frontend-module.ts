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
import { bindContributionProvider } from '@theia/core';
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
    PromptService
} from '../common';
import {
    FrontendLanguageModelRegistryImpl,
    LanguageModelDelegateClientImpl,
} from './frontend-language-model-registry';

import { FrontendPromptServiceImpl } from './frontend-prompt-service';
import { bindPromptPreferences } from './prompt-preferences';
import { bindViewContribution, WidgetFactory } from '@theia/core/lib/browser';

import { AISettingsWidget } from './ai-settings-widget';
import { AISettingsViewContribution } from './ai-settings-view-contribution'

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
    bind(FrontendPromptServiceImpl).toSelf().inSingletonScope();
    bind(PromptService).toService(FrontendPromptServiceImpl);

    bind(AISettingsWidget).toSelf().inSingletonScope();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: AISettingsWidget.ID,
            createWidget: () => ctx.container.get(AISettingsWidget)
        }))
        .inSingletonScope();

    bindViewContribution(bind, AISettingsViewContribution);

});
