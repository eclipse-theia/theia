// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { ConnectionHandler, PreferenceContribution, RpcConnectionHandler } from '@theia/core';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    CHATGPT_AUTH_SERVICE_PATH,
    CHATGPT_LANGUAGE_MODELS_MANAGER_PATH,
    ChatGptAuthService,
    ChatGptAuthServiceClient,
    ChatGptLanguageModelsManager,
    ChatGptPreferencesSchema
} from '../common';
import { ChatGptAuthServiceImpl, createRemoteAuthService } from './chatgpt-auth-service-impl';
import { ChatGptLanguageModelsManagerImpl } from './chatgpt-language-models-manager-impl';
import { ChatGptModelCatalog } from './chatgpt-model-catalog';
import { ChatGptResponseApiUtils } from './chatgpt-response-api-utils';

// The language model registry is scoped to a frontend connection, hence so is the manager driving it.
const chatGptConnectionModule = ConnectionContainerModule.create(({ bind }) => {
    bind(ChatGptLanguageModelsManagerImpl).toSelf().inSingletonScope();
    bind(ChatGptLanguageModelsManager).toService(ChatGptLanguageModelsManagerImpl);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(CHATGPT_LANGUAGE_MODELS_MANAGER_PATH, () => ctx.container.get(ChatGptLanguageModelsManager))
    ).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<ChatGptAuthServiceClient>(CHATGPT_AUTH_SERVICE_PATH, client => {
            // The service is owned by the backend container because all frontends share the same stored credentials.
            const authService = ctx.container.get<ChatGptAuthServiceImpl>(ChatGptAuthServiceImpl);
            const registration = authService.addClient(client);
            client.onDidCloseConnection(() => registration.dispose());
            return createRemoteAuthService(authService);
        })
    ).inSingletonScope();
});

export default new ContainerModule(bind => {
    bind(PreferenceContribution).toConstantValue({ schema: ChatGptPreferencesSchema });
    bind(ChatGptAuthServiceImpl).toSelf().inSingletonScope();
    bind(ChatGptAuthService).toService(ChatGptAuthServiceImpl);
    // Owned by the backend container as well, so all frontends share one listing of the account's models.
    bind(ChatGptModelCatalog).toSelf().inSingletonScope();
    // Bound under its own symbol so that the OpenAI models keep using the unmodified `OpenAiResponseApiUtils`.
    bind(ChatGptResponseApiUtils).toSelf().inSingletonScope();
    bind(ConnectionContainerModule).toConstantValue(chatGptConnectionModule);
});
