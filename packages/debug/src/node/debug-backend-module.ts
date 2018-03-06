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

import { ConnectionHandler, JsonRpcConnectionHandler } from "@theia/core/lib/common";
import { ContainerModule } from 'inversify';
import {
    DebugConfigurationManager,
    DebugConfigurationManagerImpl,
    DebugServerImpl,
    DebugSessionManager,
    DebugSessionManagerImpl
} from "./debug";
import { DebugPath, DebugServer, DebugConfigurationRegistry } from "../common/debug-server";

export default new ContainerModule(bind => {
    bind(DebugConfigurationManager).to(DebugConfigurationManagerImpl).inSingletonScope();
    bind(DebugConfigurationRegistry).to(DebugConfigurationManagerImpl).inSingletonScope();
    bind(DebugSessionManager).to(DebugSessionManagerImpl).inSingletonScope();
    bind(DebugServer).to(DebugServerImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(context =>
        new JsonRpcConnectionHandler(DebugPath, client => {
            const server = context.container.get<DebugServer>(DebugServer);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();
});
