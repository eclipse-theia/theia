// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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
import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceServer } from '../common/workspace-protocol';
import { ILogger, isStringArray } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';

export const RECENT_WORKSPACES_LOCAL_STORAGE_KEY = 'workspaces';

@injectable()
export class BrowserOnlyWorkspaceServer implements WorkspaceServer {

    @inject(ILogger)
    protected logger: ILogger;

    @inject(FileService)
    protected readonly fileService: FileService;

    async getRecentWorkspaces(): Promise<string[]> {
        const storedWorkspaces = localStorage.getItem(RECENT_WORKSPACES_LOCAL_STORAGE_KEY);
        if (!storedWorkspaces) {
            return [];
        }
        try {
            const parsedWorkspaces = JSON.parse(storedWorkspaces);
            if (isStringArray(parsedWorkspaces)) {
                return parsedWorkspaces;
            }
        } catch (e) {
            this.logger.error(e);
            return [];
        }
        return [];
    }

    async getMostRecentlyUsedWorkspace(): Promise<string | undefined> {
        const workspaces = await this.getRecentWorkspaces();
        return workspaces[0];
    }

    async setMostRecentlyUsedWorkspace(uri: string): Promise<void> {
        const workspaces = await this.getRecentWorkspaces();
        if (workspaces.includes(uri)) {
            workspaces.splice(workspaces.indexOf(uri), 1);
        }
        localStorage.setItem(RECENT_WORKSPACES_LOCAL_STORAGE_KEY, JSON.stringify([uri, ...workspaces]));
    }

    async removeRecentWorkspace(uri: string): Promise<void> {
        const workspaces = await this.getRecentWorkspaces();
        if (workspaces.includes(uri)) {
            workspaces.splice(workspaces.indexOf(uri), 1);
        }
        localStorage.setItem(RECENT_WORKSPACES_LOCAL_STORAGE_KEY, JSON.stringify(workspaces));
    }
}
