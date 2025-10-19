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
import { FrontendApplicationContribution, RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser';
import {
    MCPFrontendService,
    MCPServerManager,
    MCPServerManagerPath,
    MCPFrontendNotificationService
} from '../common/mcp-server-manager';
import { McpFrontendApplicationContribution } from './mcp-frontend-application-contribution';
import { MCPFrontendServiceImpl } from './mcp-frontend-service';
import { MCPFrontendNotificationServiceImpl } from './mcp-frontend-notification-service';
import { MCPServerManagerServerClientImpl } from './mcp-server-manager-server-client';
import { MCPServerManagerServer, MCPServerManagerServerClient, MCPServerManagerServerPath } from '../common/mcp-protocol';

export default new ContainerModule(bind => {
    bind(FrontendApplicationContribution).to(McpFrontendApplicationContribution).inSingletonScope();
    bind(MCPFrontendService).to(MCPFrontendServiceImpl).inSingletonScope();
    bind(MCPFrontendNotificationService).to(MCPFrontendNotificationServiceImpl).inSingletonScope();
    bind(MCPServerManagerServerClient).to(MCPServerManagerServerClientImpl).inSingletonScope();

    bind(MCPServerManagerServer).toDynamicValue(ctx => {
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const client = ctx.container.get<MCPServerManagerServerClient>(MCPServerManagerServerClient);
        return connection.createProxy<MCPServerManagerServer>(MCPServerManagerServerPath, client);
    }).inSingletonScope();

    bind(MCPServerManager).toDynamicValue(ctx => {
        const mgrServer = ctx.container.get<MCPServerManagerServer>(MCPServerManagerServer);
        const connection = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        const client = ctx.container.get<MCPFrontendNotificationService>(MCPFrontendNotificationService);
        const serverClient = ctx.container.get<MCPServerManagerServerClient>(MCPServerManagerServerClient);
        const backendServerManager = connection.createProxy<MCPServerManager>(MCPServerManagerPath, client);

        // Listen to server updates to clean up removed servers
        client.onDidUpdateMCPServers(() =>
            backendServerManager.getServerNames()
                .then(names => serverClient.cleanServers(names))
                .catch((error: unknown) => {
                    console.error('Error cleaning server descriptions:', error);
                }));

        // We proxy the MCPServerManager to override addOrUpdateServer and getServerDescription
        // to handle the resolve functions via the MCPServerManagerServerClient.
        return new Proxy(backendServerManager, {
            get(target: MCPServerManager, prop: PropertyKey, receiver: unknown): unknown {
                // override addOrUpdateServer to store the original description in the MCPServerManagerServerClient
                // to be used in resolveServerDescription if a resolve function is provided
                if (prop === 'addOrUpdateServer') {
                    return async function (this: MCPServerManager, ...args: [serverDescription: Parameters<MCPServerManager['addOrUpdateServer']>[0]]): Promise<void> {
                        const updated = serverClient.addServerDescription(args[0]);
                        await mgrServer.addOrUpdateServer(updated);
                    };
                }
                // override getServerDescription to mix in the resolve function from the client
                if (prop === 'getServerDescription') {
                    return async function (this: MCPServerManager, name: string): ReturnType<MCPServerManager['getServerDescription']> {
                        const description = await Reflect.apply(target.getServerDescription, target, [name]);
                        if (description) {
                            const resolveFunction = serverClient.getResolveFunction(name);
                            if (resolveFunction) {
                                return {
                                    ...description,
                                    resolve: resolveFunction
                                };
                            }
                        }
                        return description;
                    };
                }
                return Reflect.get(target, prop, receiver);
            }
        });
    }).inSingletonScope();
});
