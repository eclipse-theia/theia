// *****************************************************************************
// Copyright (C) 2025 EclipseSource.
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
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { ConnectionHandler, RpcConnectionHandler, bindContributionProvider, generateUuid } from '@theia/core';
import {
    MCPTheiaServer,
    MCPBackendContribution
} from './mcp-theia-server';
import { MCPToolFrontendDelegate, MCPToolDelegateClient, mcpToolDelegatePath } from '../common/mcp-tool-delegate';
import { MCPTheiaServerImpl } from './mcp-theia-server-impl';
import { MCPBackendContributionManager } from './mcp-backend-contribution-manager';
import { MCPFrontendContributionManager } from './mcp-frontend-contribution-manager';
import { MCPToolFrontendDelegateImpl } from './mcp-tool-frontend-delegate';
import { MCPTestContribution } from './mcp-test-contribution';

const mcpConnectionModule = ConnectionContainerModule.create(({ bind }) => {
    bind(MCPToolFrontendDelegateImpl).toSelf().inSingletonScope();
    bind(MCPToolFrontendDelegate).toService(MCPToolFrontendDelegateImpl);

    bind(ConnectionHandler)
        .toDynamicValue(
            ({ container }) =>
                new RpcConnectionHandler<MCPToolDelegateClient>(
                    mcpToolDelegatePath,
                    client => {
                        const service = container.get<MCPToolFrontendDelegateImpl>(MCPToolFrontendDelegateImpl);
                        const contributionManager = container.get<MCPFrontendContributionManager>(MCPFrontendContributionManager);

                        service.setClient(client);

                        // Generate unique delegate ID and register with contribution manager
                        const delegateId = generateUuid();
                        contributionManager.addFrontendDelegate(delegateId, service);

                        // Setup cleanup when connection closes
                        client.onDidCloseConnection(() => {
                            contributionManager.removeFrontendDelegate(delegateId);
                        });

                        return service;
                    }
                )
        )
        .inSingletonScope();
});

export default new ContainerModule(bind => {

    // Bind the main MCP server implementation in the main backend container
    bind(MCPTheiaServerImpl).toSelf().inSingletonScope();
    bind(MCPTheiaServer).toService(MCPTheiaServerImpl);
    bind(BackendApplicationContribution).toService(MCPTheiaServerImpl);

    // Bind the backend contribution manager in the main backend container
    bind(MCPBackendContributionManager).toSelf().inSingletonScope();

    // Bind the frontend contribution manager in the main backend container
    bind(MCPFrontendContributionManager).toSelf().inSingletonScope();

    // Example backend contributions (uncomment to enable)
    bind(MCPTestContribution).toSelf().inSingletonScope();
    bind(MCPBackendContribution).toService(MCPTestContribution);

    bindContributionProvider(bind, MCPBackendContribution);

    // Bind the connection module for RPC services
    bind(ConnectionContainerModule).toConstantValue(mcpConnectionModule);
});
