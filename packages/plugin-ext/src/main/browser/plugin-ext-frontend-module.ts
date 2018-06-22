/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import '../../../src/main/style/status-bar.css';

import { ContainerModule } from "inversify";
import { FrontendApplicationContribution, FrontendApplication, WidgetFactory, bindViewContribution } from "@theia/core/lib/browser";
import { MaybePromise, CommandContribution, ResourceResolver } from "@theia/core/lib/common";
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging';
import { PluginWorker } from './plugin-worker';
import { HostedPluginSupport } from "../../hosted/browser/hosted-plugin";
import { HostedPluginWatcher } from "../../hosted/browser/hosted-plugin-watcher";
import { HostedPluginManagerClient } from "./plugin-manager-client";
import { PluginApiFrontendContribution } from "./plugin-frontend-contribution";
import { setUpPluginApi } from "./main-context";
import { HostedPluginServer, hostedServicePath, PluginServer, pluginServerJsonRpcPath } from "../../common/plugin-protocol";
import { ModalNotification } from './dialogs/modal-notification';
import { PluginWidget } from "./plugin-ext-widget";
import { PluginFrontendViewContribution } from "./plugin-frontend-view-contribution";

import { HostedPluginInformer } from "../../hosted/browser/hosted-plugin-informer";
import { HostedPluginController } from "./hosted-plugin-controller";

import '../../../src/main/browser/style/index.css';
import { PluginExtDeployCommandService } from "./plugin-ext-deploy-command";
import { TextEditorService, TextEditorServiceImpl } from './text-editor-service';
import { EditorModelService, EditorModelServiceImpl } from './text-editor-model-service';
import { UntitledResourceResolver } from './editor/untitled-resource';

export default new ContainerModule(bind => {
    bind(ModalNotification).toSelf().inSingletonScope();

    bind(PluginWorker).toSelf().inSingletonScope();
    bind(HostedPluginSupport).toSelf().inSingletonScope();
    bind(HostedPluginWatcher).toSelf().inSingletonScope();
    bind(HostedPluginManagerClient).toSelf().inSingletonScope();

    bind(FrontendApplicationContribution).to(HostedPluginInformer).inSingletonScope();
    bind(FrontendApplicationContribution).to(HostedPluginController).inSingletonScope();

    bind(PluginApiFrontendContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toDynamicValue(c => c.container.get(PluginApiFrontendContribution));

    bind(TextEditorService).to(TextEditorServiceImpl).inSingletonScope();
    bind(EditorModelService).to(EditorModelServiceImpl).inSingletonScope();

    bind(UntitledResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(UntitledResourceResolver);

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

    bindViewContribution(bind, PluginFrontendViewContribution);

    bind(PluginWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: PluginFrontendViewContribution.PLUGINS_WIDGET_FACTORY_ID,
        createWidget: () => ctx.container.get(PluginWidget)
    }));

    bind(PluginExtDeployCommandService).toSelf().inSingletonScope();
    bind(PluginServer).toDynamicValue(ctx => {
        const provider = ctx.container.get(WebSocketConnectionProvider);
        return provider.createProxy<PluginServer>(pluginServerJsonRpcPath);
    }).inSingletonScope();

});
