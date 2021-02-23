/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// based on https://github.com/microsoft/vscode/blob/04c36be045a94fee58e5f8992d3e3fd980294a84/src/vs/workbench/api/browser/mainThreadFileSystemEventService.ts

import { interfaces } from '@theia/core/shared/inversify';
import { RPCProtocol } from '../../common/rpc-protocol';
import { MAIN_RPC_CONTEXT, FileSystemEvents } from '../../common/plugin-api-rpc';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangeType } from '@theia/filesystem/lib/common/files';

export class MainFileSystemEventService {

    private readonly toDispose = new DisposableCollection();

    constructor(
        rpc: RPCProtocol,
        container: interfaces.Container
    ) {
        const proxy = rpc.getProxy(MAIN_RPC_CONTEXT.ExtHostFileSystemEventService);
        const fileService = container.get(FileService);

        // file system events - (changes the editor and other make)
        const events: FileSystemEvents = {
            created: [],
            changed: [],
            deleted: []
        };
        this.toDispose.push(fileService.onDidFilesChange(event => {
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
            events.created.length = 0;
            events.changed.length = 0;
            events.deleted.length = 0;
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
}
