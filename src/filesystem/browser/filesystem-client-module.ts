/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { CommandContribution, MenuContribution, ResourceResolver } from '../../application/common';
import { WebSocketConnectionProvider } from '../../messaging/browser/connection';
import { FileSystem, FileSystemWatcher, FileResourceResolver } from "../common";
import { FileCommandContribution, FileMenuContribution } from './filesystem-commands';

export const fileSystemClientModule = new ContainerModule(bind => {
    bind(FileSystemWatcher).toSelf().inSingletonScope();
    bind(FileSystem).toDynamicValue(ctx => {
        const connnection = ctx.container.get(WebSocketConnectionProvider);
        const fileSystemClient = ctx.container.get(FileSystemWatcher).getFileSystemClient();
        return connnection.createProxy<FileSystem>("/filesystem", fileSystemClient);
    }).inSingletonScope();

    bind(FileResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toDynamicValue(ctx => ctx.container.get(FileResourceResolver));

    bind<CommandContribution>(CommandContribution).to(FileCommandContribution).inSingletonScope();
    bind<MenuContribution>(MenuContribution).to(FileMenuContribution).inSingletonScope();
});

