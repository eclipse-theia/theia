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
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { ConnectionHandler, PreferenceContribution, RpcConnectionHandler } from '@theia/core';
import { MCPServerManagerImpl } from './mcp-server-manager-impl';
import {
    MCPFrontendNotificationService,
    MCPServerManager,
    MCPServerManagerPath
} from '../common/mcp-server-manager';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { McpServersPreferenceSchema } from '../common/mcp-preferences';
import { MCPServerManagerServerImpl } from './mcp-server-manager-server';
import { MCPServerManagerServer, MCPServerManagerServerClient, MCPServerManagerServerPath } from '../common/mcp-protocol';
import { MCPOAuthFrontendDelegate, MCPOAuthFrontendDelegateClient, mcpOAuthFrontendDelegatePath } from '../common/mcp-oauth';
import { MCPOAuthFrontendDelegateImpl } from './mcp-oauth-frontend-delegate';
import { MCPOAuthCallbackService } from './mcp-oauth-callback-service';
import { MCPOAuthCallbackResponder } from './mcp-oauth-callback-responder';
import { MCPOAuthCallbackBackendContribution } from './mcp-oauth-callback-backend-contribution';
import { MCPOAuthClientProviderFactory } from './mcp-oauth-client-provider-factory';
import { MCPOAuthCredentialStore } from './mcp-oauth-credential-store';

// We use a connection module to handle AI services separately for each frontend.
const mcpConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService, bindFrontendService }) => {
    bind(MCPOAuthClientProviderFactory).toSelf().inSingletonScope();
    bind(MCPOAuthCredentialStore).toSelf().inSingletonScope();
    bind(MCPOAuthFrontendDelegateImpl).toSelf().inSingletonScope();
    bind(MCPOAuthFrontendDelegate).toService(MCPOAuthFrontendDelegateImpl);
    bind(MCPServerManager).to(MCPServerManagerImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx => new RpcConnectionHandler<MCPFrontendNotificationService>(
        MCPServerManagerPath, client => {
            const server = ctx.container.get<MCPServerManager>(MCPServerManager);
            server.setClient(client);
            client.onDidCloseConnection(() => server.disconnectClient(client));
            return server;
        }
    )).inSingletonScope();
    bind(MCPServerManagerServer).to(MCPServerManagerServerImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx => new RpcConnectionHandler<MCPServerManagerServerClient>(
        MCPServerManagerServerPath, client => {
            const server = ctx.container.get<MCPServerManagerServer>(MCPServerManagerServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.disconnectClient(client));
            return server;
        }
    )).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx => new RpcConnectionHandler<MCPOAuthFrontendDelegateClient>(
        mcpOAuthFrontendDelegatePath, client => {
            const delegate = ctx.container.get<MCPOAuthFrontendDelegate>(MCPOAuthFrontendDelegate);
            delegate.setClient(client);
            client.onDidCloseConnection(() => delegate.disconnectClient(client));
            return delegate;
        }
    )).inSingletonScope();
});

export default new ContainerModule(bind => {
    bind(PreferenceContribution).toConstantValue({ schema: McpServersPreferenceSchema });
    bind(MCPOAuthCallbackService).toSelf().inSingletonScope();
    bind(MCPOAuthCallbackResponder).toSelf().inSingletonScope();
    bind(MCPOAuthCallbackBackendContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(MCPOAuthCallbackBackendContribution);
    bind(ConnectionContainerModule).toConstantValue(mcpConnectionModule);
});
