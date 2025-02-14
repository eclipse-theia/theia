// *****************************************************************************
// Copyright (C) 2024 TypeFox GmbH.
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
import { OLLAMA_LANGUAGE_MODELS_MANAGER_PATH, OllamaLanguageModelsManager } from '../common/ollama-language-models-manager';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { OllamaLanguageModelsManagerImpl } from './ollama-language-models-manager-impl';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';

export const OllamaModelFactory = Symbol('OllamaModelFactory');

// We use a connection module to handle AI services separately for each frontend.
const ollamaConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService, bindFrontendService }) => {
    bind(OllamaLanguageModelsManagerImpl).toSelf().inSingletonScope();
    bind(OllamaLanguageModelsManager).toService(OllamaLanguageModelsManagerImpl);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(OLLAMA_LANGUAGE_MODELS_MANAGER_PATH, () => ctx.container.get(OllamaLanguageModelsManager))
    ).inSingletonScope();
});

export default new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(ollamaConnectionModule);
});
