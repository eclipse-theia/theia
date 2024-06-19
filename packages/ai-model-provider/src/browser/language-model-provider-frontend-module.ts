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
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    LanguageModelProvider,
    LanguageModelProviderDelegateClient,
    LanguageModelProviderFrontendDelegate,
    LanguageModelProviderRegistry,
    LanguageModelProviderRegistryFrontendDelegate,
    languageModelProviderDelegatePath,
    languageModelProviderRegistryDelegatePath,
} from '../common';
import {
    RemoteConnectionProvider,
    ServiceConnectionProvider,
} from '@theia/core/lib/browser/messaging/service-connection-provider';
import {
    FrontendLanguageModelProviderRegistryImpl,
    LanguageModelProviderDelegateClientImpl,
} from './frontend-language-model-provider-registry';
import { bindContributionProvider } from '@theia/core';

export default new ContainerModule(bind => {
    bindContributionProvider(bind, LanguageModelProvider);

    bind(FrontendLanguageModelProviderRegistryImpl).toSelf().inSingletonScope();
    bind(LanguageModelProviderRegistry).toService(
        FrontendLanguageModelProviderRegistryImpl
    );

    bind(LanguageModelProviderDelegateClientImpl).toSelf().inSingletonScope();
    bind(LanguageModelProviderDelegateClient)
        .toService(LanguageModelProviderDelegateClientImpl);

    bind(LanguageModelProviderRegistryFrontendDelegate).toDynamicValue(
        ctx => {
            const connection = ctx.container.get<ServiceConnectionProvider>(
                RemoteConnectionProvider
            );
            return connection.createProxy<LanguageModelProviderRegistryFrontendDelegate>(
                languageModelProviderRegistryDelegatePath
            );
        }
    );

    bind(LanguageModelProviderFrontendDelegate)
        .toDynamicValue(ctx => {
            const connection = ctx.container.get<ServiceConnectionProvider>(
                RemoteConnectionProvider
            );
            const client =
                ctx.container.get<LanguageModelProviderDelegateClient>(
                    LanguageModelProviderDelegateClient
                );
            return connection.createProxy<LanguageModelProviderFrontendDelegate>(
                languageModelProviderDelegatePath,
                client
            );
        })
        .inSingletonScope();
});
