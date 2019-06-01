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

import { injectable, inject } from 'inversify';
import { QuickOpenService, QuickOpenModel, QuickOpenItem, QuickOpenGroupItem, QuickOpenMode, LabelProvider } from '@theia/core/lib/browser';
import { WorkspaceService } from './workspace-service';
import { getTemporaryWorkspaceFileUri } from '../common';
import { WorkspacePreferences } from './workspace-preferences';
import URI from '@theia/core/lib/common/uri';
import { FileSystem, FileSystemUtils } from '@theia/filesystem/lib/common';
import * as moment from 'moment';

@injectable()
export class QuickOpenWorkspace implements QuickOpenModel {

    protected items: QuickOpenGroupItem[];
    protected opened: boolean;

    @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(FileSystem) protected readonly fileSystem: FileSystem;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(WorkspacePreferences) protected preferences: WorkspacePreferences;

    async open(workspaces: string[]): Promise<void> {
        this.items = [];
        const homeStat = await this.fileSystem.getCurrentUserHome();
        const home = (homeStat) ? new URI(homeStat.uri).path.toString() : undefined;
        let tempWorkspaceFile: URI | undefined;
        if (home) {
            tempWorkspaceFile = getTemporaryWorkspaceFileUri(new URI(home));
        }
        await this.preferences.ready;
        if (!workspaces.length) {
            this.items.push(new QuickOpenGroupItem({
                label: 'No Recent Workspaces',
                run: (mode: QuickOpenMode): boolean => false
            }));
        }
        for (const workspace of workspaces) {
            const uri = new URI(workspace);
            const stat = await this.fileSystem.getFileStat(workspace);
            if (!stat ||
                !this.preferences['workspace.supportMultiRootWorkspace'] && !stat.isDirectory) {
                continue; // skip the workspace files if multi root is not supported
            }
            if (tempWorkspaceFile && uri.toString() === tempWorkspaceFile.toString()) {
                continue; // skip the temporary workspace files
            }
            this.items.push(new QuickOpenGroupItem({
                label: uri.path.base,
                description: (home) ? FileSystemUtils.tildifyPath(uri.path.toString(), home) : uri.path.toString(),
                groupLabel: `last modified ${moment(stat.lastModification).fromNow()}`,
                iconClass: await this.labelProvider.getIcon(stat) + ' file-icon',
                run: (mode: QuickOpenMode): boolean => {
                    if (mode !== QuickOpenMode.OPEN) {
                        return false;
                    }
                    const current = this.workspaceService.workspace;
                    const uriToOpen = new URI(workspace);
                    if ((current && current.uri !== workspace) || !current) {
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

    select() {
        this.items = [];
        this.opened = this.workspaceService.opened;
        this.workspaceService.recentWorkspaces().then(workspaceRoots => {
            if (workspaceRoots) {
                this.open(workspaceRoots);
            }
        });
    }
}
