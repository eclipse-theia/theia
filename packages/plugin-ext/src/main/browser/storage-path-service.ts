/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { FileStat } from '@theia/filesystem/lib/common/filesystem';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { PluginPathsService } from '../common/plugin-paths-protocol';
import { Emitter, Event } from '@theia/core';

@injectable()
export class StoragePathService {

    private path: string;
    private deferred = new Deferred<string>();

    constructor(
        @inject(WorkspaceService) private readonly workspaceService: WorkspaceService,
        @inject(PluginPathsService) private readonly pluginPathsService: PluginPathsService,
    ) {
        this.workspaceService.onWorkspaceChanged((roots: FileStat[]) => {
            this.updateStoragePath(roots);
        });
    }

    async provideHostStoragePath(): Promise<string | undefined> {
        return this.deferred.promise;
    }

    protected readonly onStoragePathChangeEmitter = new Emitter<string>();
    get onStoragePathChanged(): Event<string> {
        return this.onStoragePathChangeEmitter.event;
    }

    protected readonly onWorkspaceChangeEmitter = new Emitter<FileStat[]>();
    get onWorkspaceChanged(): Event<FileStat[]> {
        return this.onWorkspaceChangeEmitter.event;
    }

    async updateStoragePath(roots: FileStat[]): Promise<void> {
        const workspace = this.workspaceService.workspace;
        if (!workspace) {
            return;
        }

        const path = await this.pluginPathsService.provideHostStoragePath(workspace, roots);
        if (this.path !== path) {
            this.path = path;
            this.deferred.resolve(this.path);
            this.deferred = new Deferred<string>();
            this.deferred.resolve(this.path);
            this.onStoragePathChangeEmitter.fire(this.path);
        }

        this.onWorkspaceChangeEmitter.fire(roots);
    }

}
