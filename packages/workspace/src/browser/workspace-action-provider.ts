/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import { WorkspaceServer } from '../common';
import { injectable, inject } from 'inversify';
import { QuickOpenBaseAction, QuickOpenItem, QuickOpenActionProvider, QuickOpenAction } from '@theia/core/lib/browser';

@injectable()
export class RemoveWorkspaceAction extends QuickOpenBaseAction {

    @inject(WorkspaceServer)
    protected readonly workspaceServer: WorkspaceServer;

    constructor() {
        super({ id: 'remove:workspace:action' });
        this.class = 'fa fa-times';
    }

    async run(item?: QuickOpenItem): Promise<void> {
        if (item && item.getUri()) {
            return (
                this.workspaceServer.removeRecentWorkspace &&
                this.workspaceServer.removeRecentWorkspace(item.getUri()!.toString(true))
            );
        }
        return;
    }
}

@injectable()
export class WorkspaceActionProvider implements QuickOpenActionProvider {

    @inject(RemoveWorkspaceAction)
    protected removeWorkspaceAction: RemoveWorkspaceAction;

    @inject(WorkspaceServer)
    protected readonly workspaceServer: WorkspaceServer;

    hasActions(): boolean {
        return true;
    }

    async getActions(): Promise<QuickOpenAction[]> {
        return this.workspaceServer.removeRecentWorkspace
            ? [this.removeWorkspaceAction]
            : [];
    }
}
