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
import { ANTHROPIC_LANGUAGE_MODELS_MANAGER_PATH, AnthropicLanguageModelsManager } from '../common/anthropic-language-models-manager';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { AnthropicLanguageModelsManagerImpl } from './anthropic-language-models-manager-impl';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';

// We use a connection module to handle AI services separately for each frontend.
const anthropicConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService, bindFrontendService }) => {
    bind(AnthropicLanguageModelsManagerImpl).toSelf().inSingletonScope();
    bind(AnthropicLanguageModelsManager).toService(AnthropicLanguageModelsManagerImpl);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(ANTHROPIC_LANGUAGE_MODELS_MANAGER_PATH, () => ctx.container.get(AnthropicLanguageModelsManager))
    ).inSingletonScope();
});

export default new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(anthropicConnectionModule);
});
