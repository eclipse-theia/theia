/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */
import { ContainerModule } from "inversify";
import { FrontendApplicationContribution, FrontendApplication } from "@theia/core/lib/browser";
import { MaybePromise } from "@theia/core/lib/common";
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging';
import { PluginWorker } from './plugin-worker';
import { HostedPluginServer, hostedServicePath } from '../common/plugin-protocol';
import { HostedPluginSupport } from './hosted-plugin';
import { setUpPluginApi } from './main-context';
import { HostedPluginWatcher } from './hosted-plugin-watcher';

export default new ContainerModule(bind => {
    bind(PluginWorker).toSelf().inSingletonScope();
    bind(HostedPluginSupport).toSelf().inSingletonScope();
    bind(HostedPluginWatcher).toSelf().inSingletonScope();

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
