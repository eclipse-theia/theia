/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { CommandContribution, MenuContribution, ResourceProvider } from '../../application/common';
import { WebSocketConnection } from '../../messaging/browser/connection';
import { FileSystem, FileSystemWatcher, FileResourceProvider } from "../common";
import { FileCommandContribution, FileMenuContribution } from './filesystem-commands';

export const fileSystemClientModule = new ContainerModule(bind => {
    bind(FileSystemWatcher).toSelf().inSingletonScope();
    bind(FileSystem).toDynamicValue(ctx => {
        const connnection = ctx.container.get(WebSocketConnection);
        const fileSystemClient = ctx.container.get(FileSystemWatcher).getFileSystemClient();
        return connnection.createProxy<FileSystem>("/filesystem", fileSystemClient);
    })

    bind(FileResourceProvider).toSelf().inSingletonScope();
    bind(ResourceProvider).toDynamicValue(ctx => ctx.container.get(FileResourceProvider));

    bind<CommandContribution>(CommandContribution).to(FileCommandContribution);
    bind<MenuContribution>(MenuContribution).to(FileMenuContribution);
});

