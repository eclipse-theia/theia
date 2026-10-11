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

import { nls } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import '@theia/core/lib/electron-common/electron-api';
import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceService } from '../browser/workspace-service';

@injectable()
export class ElectronWorkspaceContribution implements FrontendApplicationContribution {
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;

    onStart(): void {
        this.workspaceService.onWorkspaceChanged(async () => {
            // With the current WorkspaceService implementation, if we await for the ready signal before
            // installing the listener, we miss the first event (the one that we actually want!).
            await this.workspaceService.ready;
            const recent = await this.workspaceService.recentWorkspaces();
            window.electronTheiaCore.updateRecentWorkspaces(recent, nls.localize('theia/core/jumpListName', 'Recent Workspaces'));

        });
    }
}
