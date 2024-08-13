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
    LanguageModelFrontendDelegateImpl,
    LanguageModelRegistryFrontendDelegateImpl,
} from './language-model-frontend-delegate';
import {
    ConnectionHandler,
    RpcConnectionHandler,
    bindContributionProvider,
} from '@theia/core';
import {
    LanguageModelRegistry,
    LanguageModelProvider,
    PromptService,
    PromptServiceImpl,
    LanguageModelDelegateClient,
    LanguageModelFrontendDelegate,
    LanguageModelRegistryFrontendDelegate,
    languageModelDelegatePath,
    languageModelRegistryDelegatePath,
    LanguageModelRegistryClient
} from '../common';
import { BackendLanguageModelRegistry } from './backend-language-model-registry';

export default new ContainerModule(bind => {
    bindContributionProvider(bind, LanguageModelProvider);
    bind(BackendLanguageModelRegistry).toSelf().inSingletonScope();
    bind(LanguageModelRegistry).toService(BackendLanguageModelRegistry);

    bind(LanguageModelRegistryFrontendDelegate).to(LanguageModelRegistryFrontendDelegateImpl).inSingletonScope();
    bind(ConnectionHandler)
        .toDynamicValue(
            ctx =>
                new RpcConnectionHandler<LanguageModelRegistryClient>(
                    languageModelRegistryDelegatePath,
                    client => {
                        const registryDelegate = ctx.container.get<LanguageModelRegistryFrontendDelegateImpl>(
                            LanguageModelRegistryFrontendDelegate
                        );
                        registryDelegate.setClient(client);
                        return registryDelegate;
                    }
                )
        )
        .inSingletonScope();

    bind(LanguageModelFrontendDelegateImpl).toSelf().inSingletonScope();
    bind(LanguageModelFrontendDelegate).toService(LanguageModelFrontendDelegateImpl);
    bind(ConnectionHandler)
        .toDynamicValue(
            ({ container }) =>
                new RpcConnectionHandler<LanguageModelDelegateClient>(
                    languageModelDelegatePath,
                    client => {
                        const service =
                            container.get<LanguageModelFrontendDelegateImpl>(
                                LanguageModelFrontendDelegateImpl
                            );
                        service.setClient(client);
                        return service;
                    }
                )
        )
        .inSingletonScope();

    bind(PromptServiceImpl).toSelf().inSingletonScope();
    bind(PromptService).toService(PromptServiceImpl);
});
