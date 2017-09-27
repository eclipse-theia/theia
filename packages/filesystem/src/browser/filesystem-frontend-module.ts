/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { ResourceResolver } from '@theia/core/lib/common';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { FileSystem, FileSystemWatcher, FileResourceResolver, fileSystemPath, bindFileSystemPreferences } from "../common";
import { FileIconProvider } from './icons/file-icons';
import {
    fileSystemWatcherPath, FileSystemWatcherServer,
    FileSystemWatcherServerProxy, ReconnectingFileSystemWatcherServer
} from '../common/filesystem-watcher-protocol';

import "../../src/browser/style/index.css";

export default new ContainerModule(bind => {
    bindFileSystemPreferences(bind);

    bind(FileSystemWatcherServerProxy).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy(ctx.container, fileSystemWatcherPath)
    ).inSingletonScope();
    bind(FileSystemWatcherServer).to(ReconnectingFileSystemWatcherServer).inSingletonScope();
    bind(FileSystemWatcher).toSelf().inSingletonScope();

    bind(FileSystem).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy(ctx.container, fileSystemPath)
    ).inSingletonScope();

    bind(FileResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toDynamicValue(ctx => ctx.container.get(FileResourceResolver));

    bind(FileIconProvider).toSelf().inSingletonScope();
});
