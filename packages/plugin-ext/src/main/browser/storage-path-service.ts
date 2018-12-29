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

    private path: string | undefined;
    private pathDeferred = new Deferred<string | undefined>();

    constructor(
        @inject(WorkspaceService) private readonly workspaceService: WorkspaceService,
        @inject(PluginPathsService) private readonly pluginPathsService: PluginPathsService,
    ) {
        this.path = undefined;
        this.workspaceService.roots.then(roots => this.updateStoragePath(roots));
    }

    async provideHostStoragePath(): Promise<string | undefined> {
        return this.pathDeferred.promise;
    }

    protected readonly onStoragePathChangeEmitter = new Emitter<string | undefined>();
    get onStoragePathChanged(): Event<string | undefined> {
        return this.onStoragePathChangeEmitter.event;
    }

    async updateStoragePath(roots: FileStat[]): Promise<void> {
        const workspace = this.workspaceService.workspace;
         if (!workspace) {
             this.path = undefined;
         }

         const newPath = await this.pluginPathsService.provideHostStoragePath(workspace, roots);
         if (this.path !== newPath) {
             this.path = newPath;
             this.pathDeferred.resolve(this.path);
             this.pathDeferred = new Deferred<string>();
             this.pathDeferred.resolve(this.path);
             this.onStoragePathChangeEmitter.fire(this.path);
         }
    }

}
