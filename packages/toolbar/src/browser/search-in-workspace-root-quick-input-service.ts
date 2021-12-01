/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { LabelProvider, QuickInputService, QuickPickItem } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { CommandService } from '@theia/core';
import { SearchInWorkspaceCommands } from '@theia/search-in-workspace/lib/browser/search-in-workspace-frontend-contribution';

@injectable()
export class SearchInWorkspaceQuickInputService {
    @inject(QuickInputService) protected readonly quickInputService: QuickInputService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(CommandService) protected readonly commandService: CommandService;
    protected quickPickItems: QuickPickItem[] = [];

    open(): void {
        this.quickPickItems = this.createWorkspaceList();
        this.quickInputService.showQuickPick(this.quickPickItems, {
            placeholder: 'Workspace root to search',
        });
    }

    protected createWorkspaceList(): QuickPickItem[] {
        const roots = this.workspaceService.tryGetRoots();
        return roots.map(root => {
            const uri = root.resource;
            return {
                label: this.labelProvider.getName(uri),
                execute: (): Promise<void> => this.commandService.executeCommand(SearchInWorkspaceCommands.FIND_IN_FOLDER.id, [uri]),
            };
        });
    }
}
