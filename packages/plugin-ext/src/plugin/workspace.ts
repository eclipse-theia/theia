/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { WorkspaceFolder, WorkspaceFoldersChangeEvent, WorkspaceFolderPickOptions } from '@theia/plugin';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { WorkspaceExt, WorkspaceFolderPickOptionsMain } from '../api/plugin-api';
import { Path } from '@theia/core/lib/common/path';
import { RPCProtocol } from '../api/rpc-protocol';
import { WorkspaceMain, PLUGIN_RPC_CONTEXT as Ext } from '../api/plugin-api';

export class WorkspaceExtImpl implements WorkspaceExt {

    private proxy: WorkspaceMain;

    private workspaceFoldersChangedEmitter = new Emitter<WorkspaceFoldersChangeEvent>();
    public readonly onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent> = this.workspaceFoldersChangedEmitter.event;

    private folders: WorkspaceFolder[] | undefined;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.WORKSPACE_MAIN);
    }

    get workspaceFolders(): WorkspaceFolder[] | undefined {
        return this.folders;
    }

    get name(): string | undefined {
        if (this.workspaceFolders) {
            return new Path(this.workspaceFolders[0].uri.path).base;
        }

        return undefined;
    }

    $onWorkspaceFoldersChanged(event: WorkspaceFoldersChangeEvent): void {
        this.folders = event.added;
        this.workspaceFoldersChangedEmitter.fire(event);
    }

    pickWorkspaceFolder(options?: WorkspaceFolderPickOptions): PromiseLike<WorkspaceFolder | undefined> {
        return new Promise((resolve, reject) => {
            const optionsMain = {
                placeHolder: options && options.placeHolder ? options.placeHolder : undefined,
                ignoreFocusOut: options && options.ignoreFocusOut
            } as WorkspaceFolderPickOptionsMain;

            this.proxy.$pickWorkspaceFolder(optionsMain).then(value => {
                resolve(value);
            });
        });
    }

}
