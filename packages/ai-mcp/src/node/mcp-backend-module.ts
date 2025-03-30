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
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core';
import { MCPServerManagerImpl } from './mcp-server-manager-impl';
import { MCPFrontendNotificationService, MCPServerManager, MCPServerManagerPath } from '../common/mcp-server-manager';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';

// We use a connection module to handle AI services separately for each frontend.
const mcpConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService, bindFrontendService }) => {
    bind(MCPServerManager).to(MCPServerManagerImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx => new RpcConnectionHandler<MCPFrontendNotificationService>(
        MCPServerManagerPath, client => {
            const server = ctx.container.get<MCPServerManager>(MCPServerManager);
            server.setClient(client);
            client.onDidCloseConnection(() => server.disconnectClient(client));
            return server;
        }
    )).inSingletonScope();
});

export default new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(mcpConnectionModule);
});
