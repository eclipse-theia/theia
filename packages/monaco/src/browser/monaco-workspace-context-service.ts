// *****************************************************************************
// Copyright (C) 2025 1C-Soft LLC and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/monaco-editor-core/esm/vs/base/common/event';
import { URI } from '@theia/monaco-editor-core/esm/vs/base/common/uri';
import {
    ISingleFolderWorkspaceIdentifier,
    IWorkspace,
    IWorkspaceContextService,
    IWorkspaceFolder,
    IWorkspaceFoldersChangeEvent,
    IWorkspaceFoldersWillChangeEvent,
    IWorkspaceIdentifier,
    UNKNOWN_EMPTY_WINDOW_WORKSPACE,
    WorkbenchState
} from '@theia/monaco-editor-core/esm/vs/platform/workspace/common/workspace';

/**
 * A minimal implementation of {@link IWorkspaceContextService} to replace the `StandaloneWorkspaceContextService` in Monaco
 * as a workaround for the issue of showing no context menu for editor minimap (#15217).
 */
@injectable()
export class MonacoWorkspaceContextService implements IWorkspaceContextService {

    declare readonly _serviceBrand: undefined;

    protected readonly onDidChangeWorkbenchStateEmitter = new Emitter<WorkbenchState>();
    readonly onDidChangeWorkbenchState = this.onDidChangeWorkbenchStateEmitter.event;

    protected readonly onDidChangeWorkspaceNameEmitter = new Emitter<void>();
    readonly onDidChangeWorkspaceName = this.onDidChangeWorkspaceNameEmitter.event;

    protected readonly onWillChangeWorkspaceFoldersEmitter = new Emitter<IWorkspaceFoldersWillChangeEvent>();
    readonly onWillChangeWorkspaceFolders = this.onWillChangeWorkspaceFoldersEmitter.event;

    protected readonly onDidChangeWorkspaceFoldersEmitter = new Emitter<IWorkspaceFoldersChangeEvent>();
    readonly onDidChangeWorkspaceFolders = this.onDidChangeWorkspaceFoldersEmitter.event;

    protected workspace: IWorkspace = { id: UNKNOWN_EMPTY_WINDOW_WORKSPACE.id, folders: [] };

    getCompleteWorkspace(): Promise<IWorkspace> {
        return Promise.resolve(this.getWorkspace());
    }

    getWorkspace(): IWorkspace {
        return this.workspace;
    }

    getWorkbenchState(): WorkbenchState {
        return WorkbenchState.EMPTY;
    }

    getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
        // eslint-disable-next-line no-null/no-null
        return null;
    }

    isCurrentWorkspace(workspaceIdOrFolder: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI): boolean {
        return false;
    }

    isInsideWorkspace(resource: URI): boolean {
        return false;
    }
}
