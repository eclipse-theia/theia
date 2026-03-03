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

import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import {
    CopilotLanguageModelsManager,
    COPILOT_LANGUAGE_MODELS_MANAGER_PATH,
    CopilotAuthService,
    COPILOT_AUTH_SERVICE_PATH,
    CopilotAuthServiceClient
} from '../common';
import { CopilotLanguageModelsManagerImpl } from './copilot-language-models-manager-impl';
import { CopilotAuthServiceImpl } from './copilot-auth-service-impl';

const copilotConnectionModule = ConnectionContainerModule.create(({ bind }) => {
    bind(CopilotAuthServiceImpl).toSelf().inSingletonScope();
    bind(CopilotAuthService).toService(CopilotAuthServiceImpl);

    bind(CopilotLanguageModelsManagerImpl).toSelf().inSingletonScope();
    bind(CopilotLanguageModelsManager).toService(CopilotLanguageModelsManagerImpl);

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<CopilotAuthServiceClient>(
            COPILOT_AUTH_SERVICE_PATH,
            client => {
                const authService = ctx.container.get<CopilotAuthServiceImpl>(CopilotAuthService);
                authService.setClient(client);
                return authService;
            }
        )
    ).inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler(
            COPILOT_LANGUAGE_MODELS_MANAGER_PATH,
            () => ctx.container.get(CopilotLanguageModelsManager)
        )
    ).inSingletonScope();
});

export default new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(copilotConnectionModule);
});
