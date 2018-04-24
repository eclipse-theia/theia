/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { ContainerModule } from "inversify";
import { FrontendApplicationContribution, FrontendApplication } from "@theia/core/lib/browser";
import { MaybePromise, CommandContribution } from "@theia/core/lib/common";
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging';
import { PluginWorker } from './plugin-worker';
import { HostedPluginServer, hostedServicePath } from '../common/plugin-protocol';
import { HostedPluginSupport } from './hosted-plugin';
import { setUpPluginApi } from './main-context';
import { HostedPluginWatcher } from './hosted-plugin-watcher';
import { PluginApiFrontendContribution } from './plugin-api-frontend-contribution';
import { HostedPluginManagerClient } from "./hosted-plugin-manager-client";

export default new ContainerModule(bind => {
    bind(PluginWorker).toSelf().inSingletonScope();
    bind(HostedPluginSupport).toSelf().inSingletonScope();
    bind(HostedPluginWatcher).toSelf().inSingletonScope();
    bind(HostedPluginManagerClient).toSelf().inSingletonScope();

    bind(PluginApiFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toDynamicValue(c => c.container.get(PluginApiFrontendContribution));
    bind(CommandContribution).toDynamicValue(c => c.container.get(PluginApiFrontendContribution));

    bind(FrontendApplicationContribution).toDynamicValue(ctx => ({
        onStart(app: FrontendApplication): MaybePromise<void> {
            const worker = ctx.container.get(PluginWorker);

            setUpPluginApi(worker.rpc, ctx.container);
            ctx.container.get(HostedPluginSupport).checkAndLoadPlugin(ctx.container);
        }
    }));
    bind(HostedPluginServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        const hostedWatcher = ctx.container.get(HostedPluginWatcher);
        return connection.createProxy<HostedPluginServer>(hostedServicePath, hostedWatcher.getHostedPluginClient());
    }).inSingletonScope();
});
