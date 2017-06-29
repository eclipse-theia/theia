/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { CommandContribution, MenuContribution, ResourceResolver } from '../../application/common';
import { WebSocketConnectionProvider } from '../../messaging/browser/connection';
import { FileSystem, FileSystemWatcher, FileResourceResolver, fileSystemPath, FileSystemWatcherClientListener } from "../common";
import {
    fileSystemWatcherPath, FileSystemWatcherServer,
    FileSystemWatcherServerProxy, ReconnectingFileSystemWatcherServer
} from '../common/filesystem-watcher-protocol';
import { FileCommandContribution, FileMenuContribution } from './filesystem-commands';

import "theia-core/src/filesystem/browser/style/index.css";

export default new ContainerModule(bind => {
    bind(FileSystemWatcherClientListener).toSelf().inSingletonScope();
    bind(FileSystemWatcherServerProxy).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        const target = ctx.container.get(FileSystemWatcherClientListener);
        return connection.createProxy<FileSystemWatcherServer>(fileSystemWatcherPath, target);
    }).inSingletonScope();
    bind(FileSystemWatcherServer).to(ReconnectingFileSystemWatcherServer).inSingletonScope();
    bind(FileSystemWatcher).toSelf().inSingletonScope();

    bind(FileSystem).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<FileSystem>(fileSystemPath);
    }).inSingletonScope();

    bind(FileResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toDynamicValue(ctx => ctx.container.get(FileResourceResolver));

    bind(CommandContribution).to(FileCommandContribution).inSingletonScope();
    bind(MenuContribution).to(FileMenuContribution).inSingletonScope();
});

