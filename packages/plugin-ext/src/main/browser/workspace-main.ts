/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
