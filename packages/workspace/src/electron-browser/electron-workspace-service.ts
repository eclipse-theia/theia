// *****************************************************************************
// Copyright (C) 2026 Daniel Muñoz and others.
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

import '@theia/core/lib/electron-common/electron-api';
import { injectable } from '@theia/core/shared/inversify';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '../browser/workspace-service';

@injectable()
export class ElectronWorkspaceService extends WorkspaceService {

    protected override async setWorkspace(workspaceStat: FileStat | undefined): Promise<void> {
        await super.setWorkspace(workspaceStat);
        if (this._workspace && !this.isUntitledWorkspace(this._workspace.resource)) {
            const fsPath = this._workspace.resource.path.fsPath();
            window.electronTheiaCore.addRecentDocument(fsPath);
        }
    }

}
