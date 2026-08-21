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

import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import { ExternalApiContribution } from '@theia/external-api/lib/node/external-api-contribution';
import { EXTERNAL_CHAT_SESSION_PROVIDER_PATH, ExternalChatSessionBackendService, ExternalChatSessionProvider } from '../common/external-chat-session-provider';
import { AIExternalApiEndpoint } from './ai-external-api-endpoint';
import { ExternalChatSessionRegistry } from './external-chat-session-registry';

export default new ContainerModule(bind => {
    bind(ExternalChatSessionRegistry).toSelf().inSingletonScope();

    bind(AIExternalApiEndpoint).toSelf().inSingletonScope();
    bind(ExternalApiContribution).toService(AIExternalApiEndpoint);

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<ExternalChatSessionProvider>(EXTERNAL_CHAT_SESSION_PROVIDER_PATH, provider => {
            const registry = ctx.container.get(ExternalChatSessionRegistry);
            registry.addProvider(provider);
            provider.onDidCloseConnection(() => registry.removeProvider(provider));
            const backendService: ExternalChatSessionBackendService = {
                notifySessionsChanged: () => registry.notifySessionsChanged()
            };
            return backendService;
        })
    ).inSingletonScope();
});
