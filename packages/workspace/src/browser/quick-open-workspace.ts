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
import { WorkspacePreferences } from './workspace-preferences';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { nls, Path } from '@theia/core/lib/common';
import { UntitledWorkspaceService } from '../common/untitled-workspace-service';

interface RecentlyOpenedPick extends QuickPickItem {
    resource?: URI
}

@injectable()
export class QuickOpenWorkspace {
    protected items: Array<RecentlyOpenedPick | QuickPickSeparator>;
    protected opened: boolean;

    @inject(QuickInputService) @optional() protected readonly quickInputService: QuickInputService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(WorkspacePreferences) protected preferences: WorkspacePreferences;
    @inject(EnvVariablesServer) protected readonly envServer: EnvVariablesServer;
    @inject(UntitledWorkspaceService) protected untitledWorkspaceService: UntitledWorkspaceService;

    protected readonly removeRecentWorkspaceButton: QuickInputButton = {
        iconClass: 'codicon-remove-close',
        tooltip: nls.localizeByDefault('Remove from Recently Opened')
    };

    async open(workspaces: string[]): Promise<void> {
        this.items = [];
        const [homeDirUri] = await Promise.all([
            this.envServer.getHomeDirUri(),
            this.workspaceService.getUntitledWorkspace()
        ]);
        const home = new URI(homeDirUri).path.toString();
        await this.preferences.ready;
        this.items.push({
            type: 'separator',
            label: nls.localizeByDefault('folders & workspaces')
        });
        for (const workspace of workspaces) {
            const uri = new URI(workspace);
            let stat: FileStat | undefined;
            try {
                stat = await this.fileService.resolve(uri);
            } catch { }
            if (this.untitledWorkspaceService.isUntitledWorkspace(uri) || !stat) {
                continue; // skip the temporary workspace files or an undefined stat.
            }
            const icon = this.labelProvider.getIcon(stat);
            const iconClasses = icon === '' ? undefined : [icon + ' file-icon'];

            this.items.push({
                label: uri.path.base,
                description: Path.tildify(uri.path.toString(), home),
                iconClasses,
                buttons: [this.removeRecentWorkspaceButton],
                resource: uri,
                execute: () => {
                    const current = this.workspaceService.workspace;
                    const uriToOpen = new URI(workspace);
                    if ((current && current.resource.toString() !== workspace) || !current) {
                        this.workspaceService.open(uriToOpen);
                    }
                },
            });
        }
        this.quickInputService?.showQuickPick(this.items, {
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
        this.items = [];
        this.opened = this.workspaceService.opened;
        this.workspaceService.recentWorkspaces().then(workspaceRoots => {
            if (workspaceRoots) {
                this.open(workspaceRoots);
            }
        });
    }
}
