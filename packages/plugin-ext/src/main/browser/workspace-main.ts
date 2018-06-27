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

import { WorkspaceExt, MAIN_RPC_CONTEXT } from "../../api/plugin-api";
import { RPCProtocol } from "../../api/rpc-protocol";
import { WorkspaceService } from "@theia/workspace/lib/browser";
import Uri from 'vscode-uri';
import { WorkspaceFoldersChangeEvent, WorkspaceFolder } from "@theia/plugin";
import { Path } from "@theia/core/lib/common/path";

export class WorkspaceMain {

    private proxy: WorkspaceExt;

    private workspaceRoot: Uri | undefined;

    constructor(rpc: RPCProtocol, workspaceService: WorkspaceService) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.WORKSPACE_EXT);

        workspaceService.root.then((root) => {
            if (root) {
                this.workspaceRoot = Uri.parse(root.uri);
                const workspacePath = new Path(this.workspaceRoot.path);

                const folder: WorkspaceFolder = {
                    uri: this.workspaceRoot,
                    name: workspacePath.base,
                    index: 0
                } as WorkspaceFolder;

                this.proxy.$onWorkspaceFoldersChanged({
                    added: [folder],
                    removed: []
                } as WorkspaceFoldersChangeEvent);
            } else {
                this.proxy.$onWorkspaceFoldersChanged({
                    added: [],
                    removed: []
                } as WorkspaceFoldersChangeEvent);
            }
        });
    }

}
