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
import { WorkspaceServiceImpl } from '../browser/workspace-service';

@injectable()
export class ElectronWorkspaceServiceImpl extends WorkspaceServiceImpl {
    protected override async setWorkspace(workspaceStat: FileStat | undefined): Promise<void> {
        console.log('*** (electron) SET Workspace: ' + workspaceStat?.resource);
        await super.setWorkspace(workspaceStat);
        const recent = await this.server.getRecentWorkspaces();
        window.electronTheiaCore.updateRecentWorkspaces(recent);
    }
}
