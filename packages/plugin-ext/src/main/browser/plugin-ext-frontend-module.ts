/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { ContainerModule } from "inversify";
import { FrontendApplicationContribution, FrontendApplication, WidgetFactory, KeybindingContribution } from "@theia/core/lib/browser";
import { MaybePromise, CommandContribution, MenuContribution } from "@theia/core/lib/common";
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging';
import { PluginWorker } from './plugin-worker';
import { HostedPluginSupport } from "../../hosted/browser/hosted-plugin";
import { HostedPluginWatcher } from "../../hosted/browser/hosted-plugin-watcher";
import { HostedPluginManagerClient } from "./plugin-manager-client";
import { PluginApiFrontendContribution } from "./plugin-frontend-contribution";
import { setUpPluginApi } from "./main-context";
import { HostedPluginServer, hostedServicePath } from "../../common/plugin-protocol";
import { ModalNotification } from './dialogs/modal-notification';
import { PluginWidget } from "./plugin-ext-widget";
import { PluginFrontendViewContribution } from "./plugin-frontend-view-contribution";

import '../../../src/main/browser/style/index.css';

export default new ContainerModule(bind => {
    bind(ModalNotification).toSelf().inSingletonScope();

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

    bind(PluginFrontendViewContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toDynamicValue(c => c.container.get(PluginFrontendViewContribution));
    bind(CommandContribution).toDynamicValue(c => c.container.get(PluginFrontendViewContribution));
    bind(KeybindingContribution).toDynamicValue(c => c.container.get(PluginFrontendViewContribution));
    bind(MenuContribution).toDynamicValue(c => c.container.get(PluginFrontendViewContribution));

    bind(PluginWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: PluginFrontendViewContribution.PLUGINS_WIDGET_FACTORY_ID,
        createWidget: () => ctx.container.get(PluginWidget)
    }));

});
