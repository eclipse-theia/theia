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
    LanguageModelProviderFrontendDelegateImpl,
    LanguageModelProviderRegistryFrontendDelegateImpl,
} from './language-model-provider-frontend-delegate';
import {
    ConnectionHandler,
    RpcConnectionHandler,
    bindContributionProvider,
} from '@theia/core';
import {
    LanguageModelProviderRegistry,
    DefaultLanguageModelProviderRegistryImpl,
    LanguageModelProvider,
} from '../common';
import {
    LanguageModelProviderDelegateClient,
    LanguageModelProviderFrontendDelegate,
    LanguageModelProviderRegistryFrontendDelegate,
    languageModelProviderDelegatePath,
    languageModelProviderRegistryDelegatePath,
} from '../common/language-model-provider-delegate';

export default new ContainerModule(bind => {
    bindContributionProvider(bind, LanguageModelProvider);
    bind(LanguageModelProviderRegistry)
        .to(DefaultLanguageModelProviderRegistryImpl)
        .inSingletonScope();

    bind(LanguageModelProviderRegistryFrontendDelegate)
        .to(LanguageModelProviderRegistryFrontendDelegateImpl)
        .inSingletonScope();
    bind(ConnectionHandler)
        .toDynamicValue(
            ctx =>
                new RpcConnectionHandler(
                    languageModelProviderRegistryDelegatePath,
                    () =>
                        ctx.container.get(
                            LanguageModelProviderRegistryFrontendDelegate
                        )
                )
        )
        .inSingletonScope();

    bind(LanguageModelProviderFrontendDelegateImpl).toSelf().inSingletonScope();
    bind(LanguageModelProviderFrontendDelegate).toService(
        LanguageModelProviderFrontendDelegateImpl
    );
    bind(ConnectionHandler)
        .toDynamicValue(
            ({ container }) =>
                new RpcConnectionHandler<LanguageModelProviderDelegateClient>(
                    languageModelProviderDelegatePath,
                    client => {
                        const service =
                            container.get<LanguageModelProviderFrontendDelegateImpl>(
                                LanguageModelProviderFrontendDelegateImpl
                            );
                        service.setClient(client);
                        return service;
                    }
                )
        )
        .inSingletonScope();
});
