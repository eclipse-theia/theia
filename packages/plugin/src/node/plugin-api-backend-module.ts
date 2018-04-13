/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
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
