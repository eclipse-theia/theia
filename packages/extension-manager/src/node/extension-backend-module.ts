/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { ContainerModule, interfaces } from 'inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core';
import { CliContribution } from '@theia/core/lib/node';
import { ExtensionServer, ExtensionClient, extensionPath } from '../common/extension-protocol';
import { ExtensionKeywords, NodeExtensionServer } from './node-extension-server';
import { ApplicationProject, ApplicationProjectOptions } from './application-project';
import { NpmClient, NpmClientOptions } from './npm-client';
import { ApplicationProjectArgs, ApplicationProjectCliContribution } from './application-project-cli';

export const extensionKeyword = 'theia-extension';

export function bindNodeExtensionServer(bind: interfaces.Bind, args?: ApplicationProjectArgs): void {
    if (args) {
        bind(NpmClientOptions).toConstantValue(args);
        bind(ApplicationProjectOptions).toConstantValue(args);
    } else {
        bind(ApplicationProjectCliContribution).toSelf().inSingletonScope();
        bind(CliContribution).toService(ApplicationProjectCliContribution);
        bind(NpmClientOptions).toDynamicValue(ctx =>
            ctx.container.get(ApplicationProjectCliContribution).args
        ).inSingletonScope();
        bind(ApplicationProjectOptions).toDynamicValue(ctx =>
            ctx.container.get(ApplicationProjectCliContribution).args
        ).inSingletonScope();
    }
    bind(NpmClient).toSelf().inSingletonScope();
    bind(ApplicationProject).toSelf().inSingletonScope();

    bind(ExtensionKeywords).toConstantValue([extensionKeyword]);
    bind(NodeExtensionServer).toSelf().inSingletonScope();
    bind(ExtensionServer).toService(NodeExtensionServer);
}

export default new ContainerModule(bind => {
    bindNodeExtensionServer(bind);

    const clients = new Set<ExtensionClient>();
    const dispatchingClient: ExtensionClient = {
        onDidChange: change => clients.forEach(client => client.onDidChange(change)),
        onDidStopInstallation: result => clients.forEach(client => client.onDidStopInstallation(result)),
        onWillStartInstallation: param => clients.forEach(client => client.onWillStartInstallation(param))
    };
    bind(ConnectionHandler).toDynamicValue(ctx => {
        const server = ctx.container.get<ExtensionServer>(ExtensionServer);
        server.setClient(dispatchingClient);
        return new JsonRpcConnectionHandler<ExtensionClient>(extensionPath, client => {
            clients.add(client);
            client.onDidCloseConnection(() => {
                clients.delete(client);
            });
            return server;
        });
    }).inSingletonScope();
});
