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

import {ConnectionHandler, JsonRpcConnectionHandler} from "@theia/core/lib/common";
import {ContainerModule} from 'inversify';
import {DebugImpl} from "./debug";
import {DebugPath, Debug} from "../common/debug-model";

export default new ContainerModule(bind => {
    bind(Debug).to(DebugImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(context =>
        new JsonRpcConnectionHandler(DebugPath, client => {
            const server = context.container.get<Debug>(Debug);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();
});
