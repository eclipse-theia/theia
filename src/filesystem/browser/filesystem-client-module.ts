/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { FileSystemWatcher } from '../../filesystem/common/filesystem-watcher';
import { CommandContribution } from '../../application/common/command';
import { MenuContribution } from '../../application/common/menu';
import { WebSocketConnection } from '../../messaging/browser/connection';
import { FileCommandContribution, FileMenuContribution } from '../browser/filesystem-commands';
import { FileSystem } from '../common/filesystem';
import { ContainerModule } from 'inversify';

export const fileSystemClientModule = new ContainerModule(bind => {
    bind(FileSystemWatcher).toSelf().inSingletonScope();
    bind(FileSystem).toDynamicValue(ctx => {
        const connnection = ctx.container.get(WebSocketConnection);
        const fileSystemClient = ctx.container.get(FileSystemWatcher).getFileSystemClient();
        return connnection.createProxy<FileSystem>("/filesystem", fileSystemClient);
    })
    bind<CommandContribution>(CommandContribution).to(FileCommandContribution);
    bind<MenuContribution>(MenuContribution).to(FileMenuContribution);
});

