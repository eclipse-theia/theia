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
import { ExtensionApiContribution, HostedExtensionServerImpl } from './extension-service';
import { HostedExtensionReader } from './extension-reader';
import { HostedExtensionClient, HostedExtensionServer, hostedServicePath } from '../common/extension-protocol';
import { HostedExtensionSupport } from './hosted-extension';

export default new ContainerModule(bind => {
    bind(ExtensionApiContribution).toSelf().inSingletonScope();
    bind(HostedExtensionReader).toSelf().inSingletonScope();
    bind(HostedExtensionServer).to(HostedExtensionServerImpl).inSingletonScope();
    bind(HostedExtensionSupport).toSelf().inSingletonScope();

    bind(BackendApplicationContribution).toDynamicValue(ctx => ctx.container.get(ExtensionApiContribution)).inSingletonScope();
    bind(BackendApplicationContribution).toDynamicValue(ctx => ctx.container.get(HostedExtensionReader)).inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<HostedExtensionClient>(hostedServicePath, client => {
            const server = ctx.container.get<HostedExtensionServer>(HostedExtensionServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();
});
