/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { bindContributionProvider } from "@theia/core/lib/common/contribution-provider";
import { HostedPluginManager, NodeHostedPluginRunner } from './hosted-plugin-manager';
import { HostedPluginUriPostProcessorSymbolName } from "./hosted-plugin-uri-postprocessor";
import { interfaces } from "inversify";
import { ConnectionHandler, JsonRpcConnectionHandler } from "@theia/core/lib/common/messaging";
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { MetadataScanner } from './metadata-scanner';
import { HostedPluginServerImpl } from './plugin-service';
import { HostedPluginReader } from './plugin-reader';
import { HostedPluginSupport } from './hosted-plugin';
import { TheiaPluginScanner } from './scanners/scanner-theia';
import { HostedPluginServer, PluginScanner, HostedPluginClient, hostedServicePath } from "../../common/plugin-protocol";

export function bindCommonHostedBackend(bind: interfaces.Bind): void {
    bind(HostedPluginReader).toSelf().inSingletonScope();
    bind(HostedPluginServer).to(HostedPluginServerImpl).inSingletonScope();
    bind(HostedPluginSupport).toSelf().inSingletonScope();
    bind(PluginScanner).to(TheiaPluginScanner).inSingletonScope();
    bind(MetadataScanner).toSelf().inSingletonScope();

    bind(BackendApplicationContribution).toDynamicValue(ctx => ctx.container.get(HostedPluginReader)).inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<HostedPluginClient>(hostedServicePath, client => {
            const server = ctx.container.get<HostedPluginServer>(HostedPluginServer);
            server.setClient(client);
            // FIXME: handle multiple remote connections
            /*
            client.onDidCloseConnection(() => server.dispose());*/
            return server;
        })
    ).inSingletonScope();
}

export function bindHostedBackend(bind: interfaces.Bind): void {
    bind(HostedPluginManager).to(NodeHostedPluginRunner).inSingletonScope();
    bindContributionProvider(bind, Symbol.for(HostedPluginUriPostProcessorSymbolName));
    bindCommonHostedBackend(bind);
}
