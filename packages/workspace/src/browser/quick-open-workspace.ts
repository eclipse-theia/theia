// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { QuickPickItem, LabelProvider, QuickInputService, QuickInputButton, QuickPickSeparator } from '@theia/core/lib/browser';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { WorkspaceService } from './workspace-service';
import URI from '@theia/core/lib/common/uri';
import { nls, Path } from '@theia/core/lib/common';
import { UntitledWorkspaceService } from '../common/untitled-workspace-service';

interface RecentlyOpenedPick extends QuickPickItem {
    resource?: URI
}

@injectable()
export class QuickOpenWorkspace {
    protected opened: boolean;

    @inject(QuickInputService) @optional() protected readonly quickInputService: QuickInputService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(EnvVariablesServer) protected readonly envServer: EnvVariablesServer;
    @inject(UntitledWorkspaceService) protected untitledWorkspaceService: UntitledWorkspaceService;

    protected readonly removeRecentWorkspaceButton: QuickInputButton = {
        iconClass: 'codicon-remove-close',
        tooltip: nls.localizeByDefault('Remove from Recently Opened')
    };

    async open(workspaces: string[]): Promise<void> {
        const homeDirUri = await this.envServer.getHomeDirUri();
        const home = new URI(homeDirUri).path.fsPath();
        const items: (RecentlyOpenedPick | QuickPickSeparator)[] = [{
            type: 'separator',
            label: nls.localizeByDefault('folders & workspaces')
        }];

        for (const workspace of workspaces) {
            const uri = new URI(workspace);
            const label = uri.path.base;
            if (!label || this.untitledWorkspaceService.isUntitledWorkspace(uri)) {
                continue; // skip temporary workspace files & empty workspace names
            }
            items.push({
                label: label,
                description: Path.tildify(uri.path.fsPath(), home),
                buttons: [this.removeRecentWorkspaceButton],
                resource: uri,
                execute: () => {
                    const current = this.workspaceService.workspace;
                    if ((current && current.resource.toString() !== workspace) || !current) {
                        this.workspaceService.open(uri);
                    }
                }
            });
        }

        this.quickInputService?.showQuickPick(items, {
            placeholder: nls.localize(
                'theia/workspace/openRecentPlaceholder',
                'Type the name of the workspace you want to open'),
            onDidTriggerItemButton: async context => {
                const resource = (context.item as RecentlyOpenedPick).resource;
                if (resource) {
                    await this.workspaceService.removeRecentWorkspace(resource.toString());
                    context.removeItem();
                }
            }
        });
    }

    select(): void {
        this.opened = this.workspaceService.opened;
        this.workspaceService.recentWorkspaces().then(workspaceRoots => {
            if (workspaceRoots) {
                this.open(workspaceRoots);
            }
        });
    }
}
