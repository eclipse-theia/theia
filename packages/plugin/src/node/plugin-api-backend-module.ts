/*
 * Copyright (C) 2015-2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { ContainerModule } from "inversify";
import { ConnectionHandler, JsonRpcConnectionHandler } from "@theia/core/lib/common/messaging";
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { PluginApiContribution, HostedPluginServerImpl } from './plugin-service';
import { HostedPluginReader } from './plugin-reader';
import { HostedPluginClient, HostedPluginServer, hostedServicePath } from '../common/plugin-protocol';
import { HostedPluginSupport } from './hosted-plugin';

export default new ContainerModule(bind => {
    bind(PluginApiContribution).toSelf().inSingletonScope();
    bind(HostedPluginReader).toSelf().inSingletonScope();
    bind(HostedPluginServer).to(HostedPluginServerImpl).inSingletonScope();
    bind(HostedPluginSupport).toSelf().inSingletonScope();

    bind(BackendApplicationContribution).toDynamicValue(ctx => ctx.container.get(PluginApiContribution)).inSingletonScope();
    bind(BackendApplicationContribution).toDynamicValue(ctx => ctx.container.get(HostedPluginReader)).inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<HostedPluginClient>(hostedServicePath, client => {
            const server = ctx.container.get<HostedPluginServer>(HostedPluginServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();
});
