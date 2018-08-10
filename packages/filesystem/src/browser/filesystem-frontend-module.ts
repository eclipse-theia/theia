/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { ContainerModule } from 'inversify';
import { ResourceResolver } from '@theia/core/lib/common';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { FileSystem, fileSystemPath } from '../common';
import {
    fileSystemWatcherPath, FileSystemWatcherServer,
    FileSystemWatcherServerProxy, ReconnectingFileSystemWatcherServer
} from '../common/filesystem-watcher-protocol';
import { FileResourceResolver } from './file-resource';
import { bindFileSystemPreferences } from './filesystem-preferences';
import { FileSystemWatcher } from './filesystem-watcher';
import { FileDialogService } from './file-dialog-service';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bindFileSystemPreferences(bind);

    bind(FileSystemWatcherServerProxy).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy(ctx.container, fileSystemWatcherPath)
    );
    bind(FileSystemWatcherServer).to(ReconnectingFileSystemWatcherServer);
    bind(FileSystemWatcher).toSelf().inSingletonScope();

    bind(FileSystem).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy<FileSystem>(ctx.container, fileSystemPath)
    ).inSingletonScope();

    bind(FileResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toDynamicValue(ctx => ctx.container.get(FileResourceResolver));

    bind(FileDialogService).toSelf().inSingletonScope();
});
