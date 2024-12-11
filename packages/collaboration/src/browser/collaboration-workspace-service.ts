// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { nls } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { Disposable } from '@theia/core/shared/vscode-languageserver-protocol';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { Workspace, ProtocolBroadcastConnection } from 'open-collaboration-protocol';
import { CollaborationURI } from './collaboration-file-system-provider';

@injectable()
export class CollaborationWorkspaceService extends WorkspaceService {

    protected collabWorkspace?: Workspace;
    protected connection?: ProtocolBroadcastConnection;

    async setHostWorkspace(workspace: Workspace, connection: ProtocolBroadcastConnection): Promise<Disposable> {
        this.collabWorkspace = workspace;
        this.connection = connection;
        await this.setWorkspace({
            isDirectory: false,
            isFile: true,
            isReadonly: false,
            isSymbolicLink: false,
            name: nls.localize('theia/collaboration/collaborationWorkspace', 'Collaboration Workspace'),
            resource: CollaborationURI.create(this.collabWorkspace)
        });
        return Disposable.create(() => {
            this.collabWorkspace = undefined;
            this.connection = undefined;
            this.setWorkspace(undefined);
        });
    }

    protected override async computeRoots(): Promise<FileStat[]> {
        if (this.collabWorkspace) {
            return this.collabWorkspace.folders.map(e => this.entryToStat(e));
        } else {
            return super.computeRoots();
        }
    }

    protected entryToStat(entry: string): FileStat {
        const uri = CollaborationURI.create(this.collabWorkspace!, entry);
        return {
            resource: uri,
            name: entry,
            isDirectory: true,
            isFile: false,
            isReadonly: false,
            isSymbolicLink: false
        };
    }

}
