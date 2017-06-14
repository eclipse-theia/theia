
/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { ConnectionHandler, JsonRpcConnectionHandler } from "../../messaging/common";
import { FileSystemNode } from './node-filesystem';
import { FileSystemWatcher } from '../common/filesystem-watcher';
import { FileSystem } from "../common/filesystem";

export const fileSystemServerModule = new ContainerModule(bind => {
    bind(FileSystemWatcher).toSelf();

    bind(FileSystemNode).toSelf().inSingletonScope();
    bind(FileSystem).toDynamicValue(ctx => ctx.container.get(FileSystemNode)).inSingletonScope();

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler("/filesystem", () =>
            ctx.container.get(FileSystem)
        )
    ).inSingletonScope();
});
