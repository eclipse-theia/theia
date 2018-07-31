/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
    bindCommonHostedBackend(bind);

    bind(HostedPluginManager).to(NodeHostedPluginRunner).inSingletonScope();
    bind(PluginScanner).to(TheiaPluginScanner).inSingletonScope();
    bindContributionProvider(bind, Symbol.for(HostedPluginUriPostProcessorSymbolName));
}
