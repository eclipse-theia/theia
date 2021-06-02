/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { QuickOpenService, QuickOpenModel, QuickOpenItem, QuickOpenGroupItem, QuickOpenMode, LabelProvider } from '@theia/core/lib/browser';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { WorkspaceService } from './workspace-service';
import { WorkspacePreferences } from './workspace-preferences';
import URI from '@theia/core/lib/common/uri';
import * as moment from 'moment';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { Path } from '@theia/core/lib/common';

@injectable()
export class QuickOpenWorkspace implements QuickOpenModel {

    protected items: QuickOpenGroupItem[];
    protected opened: boolean;

    @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(WorkspacePreferences) protected preferences: WorkspacePreferences;
    @inject(EnvVariablesServer) protected readonly envServer: EnvVariablesServer;

    async open(workspaces: string[]): Promise<void> {
        this.items = [];
        const [homeDirUri, tempWorkspaceFile] = await Promise.all([
            this.envServer.getHomeDirUri(),
            this.workspaceService.getUntitledWorkspace()
        ]);
        const home = new URI(homeDirUri).path.toString();
        await this.preferences.ready;
        if (!workspaces.length) {
            this.items.push(new QuickOpenGroupItem({
                label: 'No Recent Workspaces',
                run: (mode: QuickOpenMode): boolean => false
            }));
        }
        for (const workspace of workspaces) {
            const uri = new URI(workspace);
            let stat: FileStat | undefined;
            try {
                stat = await this.fileService.resolve(uri);
            } catch { }
            if (!stat ||
                !this.preferences['workspace.supportMultiRootWorkspace'] && !stat.isDirectory) {
                continue; // skip the workspace files if multi root is not supported
            }
            if (uri.toString() === tempWorkspaceFile.toString()) {
                continue; // skip the temporary workspace files
            }
            const icon = this.labelProvider.getIcon(stat);
            const iconClass = icon === '' ? undefined : icon + ' file-icon';
            this.items.push(new QuickOpenGroupItem({
                label: uri.path.base,
                description: Path.tildify(uri.path.toString(), home),
                groupLabel: `last modified ${moment(stat.mtime).fromNow()}`,
                iconClass,
                run: (mode: QuickOpenMode): boolean => {
                    if (mode !== QuickOpenMode.OPEN) {
                        return false;
                    }
                    const current = this.workspaceService.workspace;
                    const uriToOpen = new URI(workspace);
                    if ((current && current.resource.toString() !== workspace) || !current) {
                        this.workspaceService.open(uriToOpen);
                    }
                    return true;
                },
            }));
        }

        this.quickOpenService.open(this, {
            placeholder: 'Type the name of the workspace you want to open',
            fuzzyMatchLabel: true,
            fuzzySort: false
        });
    }

    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
        acceptor(this.items);
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
