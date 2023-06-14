// *****************************************************************************
// Copyright (C) 2022 TypeFox and others.
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

import { WindowTitleUpdater } from '@theia/core/lib/browser/window/window-title-updater';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Widget } from '@theia/core/lib/browser/widgets/widget';
import { WorkspaceService } from './workspace-service';
import { Navigatable } from '@theia/core/lib/browser/navigatable';

@injectable()
export class WorkspaceWindowTitleUpdater extends WindowTitleUpdater {

    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;

    protected override updateTitleWidget(widget?: Widget): void {
        super.updateTitleWidget(widget);
        let folderName: string | undefined;
        let folderPath: string | undefined;
        if (Navigatable.is(widget)) {
            const folder = this.workspaceService.getWorkspaceRootUri(widget.getResourceUri());
            if (folder) {
                folderName = this.labelProvider.getName(folder);
                folderPath = folder.path.toString();
            }
        }
        this.windowTitleService.update({
            folderName,
            folderPath
        });
    }

}
