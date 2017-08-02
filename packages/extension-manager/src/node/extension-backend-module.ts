/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core';
import { ExtensionServer, extensionPath } from "../common/extension-protocol";
import { NodeExtensionServer, NodeExtensionServerOptions } from './node-extension-server';

export default new ContainerModule(bind => {
    const options: NodeExtensionServerOptions = {
        projectPath: process.cwd()
    };
    bind(NodeExtensionServerOptions).toConstantValue(options);
    bind(NodeExtensionServer).toSelf().inSingletonScope();
    bind(ExtensionServer).toDynamicValue(ctx =>
        ctx.container.get(NodeExtensionServer)
    ).inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler(extensionPath, () =>
            ctx.container.get(ExtensionServer)
        )
    ).inSingletonScope();
});