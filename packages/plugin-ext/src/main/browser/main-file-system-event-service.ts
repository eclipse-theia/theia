// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// based on https://github.com/microsoft/vscode/blob/04c36be045a94fee58e5f8992d3e3fd980294a84/src/vs/workbench/api/browser/mainThreadFileSystemEventService.ts

import { interfaces } from '@theia/core/shared/inversify';
import { RPCProtocol } from '../../common/rpc-protocol';
import { MAIN_RPC_CONTEXT, FileSystemEvents, MainFileSystemEventServiceShape } from '../../common/plugin-api-rpc';
import { UriComponents } from '../../common/uri-components';
import { URI } from '@theia/core';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangeType, WatchOptions } from '@theia/filesystem/lib/common/files';

export class MainFileSystemEventService implements MainFileSystemEventServiceShape {

    private readonly toDispose = new DisposableCollection();
    private readonly watches = new Map<number, Disposable>();

    constructor(
        rpc: RPCProtocol,
        container: interfaces.Container,
        private readonly fileService = container.get(FileService)
    ) {
        const proxy = rpc.getProxy(MAIN_RPC_CONTEXT.ExtHostFileSystemEventService);

        this.toDispose.push(fileService.onDidFilesChange(event => {
            // file system events - (changes the editor and others make)
            const events: FileSystemEvents = {
                created: [],
                changed: [],
                deleted: []
            };
            for (const change of event.changes) {
                switch (change.type) {
                    case FileChangeType.ADDED:
                        events.created.push(change.resource['codeUri']);
                        break;
                    case FileChangeType.UPDATED:
                        events.changed.push(change.resource['codeUri']);
                        break;
                    case FileChangeType.DELETED:
                        events.deleted.push(change.resource['codeUri']);
                        break;
                }
            }

            proxy.$onFileEvent(events);
        }));

        // BEFORE file operation
        fileService.addFileOperationParticipant({
            participate: (target, source, operation, timeout, token) => proxy.$onWillRunFileOperation(operation, target['codeUri'], source?.['codeUri'], timeout, token)
        });

        // AFTER file operation
        this.toDispose.push(fileService.onDidRunUserOperation(e => proxy.$onDidRunFileOperation(e.operation, e.target['codeUri'], e.source?.['codeUri'])));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    $watch(session: number, resource: UriComponents, options: WatchOptions): void {
        this.watches.set(session, this.fileService.watch(URI.fromComponents(resource), options));
    }

    $unwatch(session: number): void {
        const watch = this.watches.get(session);
        if (watch) {
            watch.dispose();
            this.watches.delete(session);
        }
    }
}
