/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { LocalStorageService } from '@theia/core/lib/browser/storage-service';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { WorkspaceService } from './workspace-service';
import { FileStat } from '@theia/filesystem/lib/common/files';

/*
 * Prefixes any stored data with the current workspace path.
 */
@injectable()
export class WorkspaceStorageService implements StorageService {

    private prefix: string;
    private initialized: Promise<void>;

    @inject(LocalStorageService) protected storageService: StorageService;
    @inject(WorkspaceService) protected workspaceService: WorkspaceService;

    @postConstruct()
    protected init(): void {
        this.initialized = this.workspaceService.roots.then(() => {
            this.updatePrefix();
            this.workspaceService.onWorkspaceLocationChanged(() => this.updatePrefix());
        });
    }

    async setData<T>(key: string, data: T): Promise<void> {
        if (!this.prefix) {
            await this.initialized;
        }
        const fullKey = this.prefixWorkspaceURI(key);
        return this.storageService.setData(fullKey, data);
    }

    async getData<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        await this.initialized;
        const fullKey = this.prefixWorkspaceURI(key);
        return this.storageService.getData(fullKey, defaultValue);
    }

    protected prefixWorkspaceURI(originalKey: string): string {
        return `${this.prefix}:${originalKey}`;
    }

    protected getPrefix(workspaceStat: FileStat | undefined): string {
        return workspaceStat ? workspaceStat.resource.toString() : '_global_';
    }

    private updatePrefix(): void {
        this.prefix = this.getPrefix(this.workspaceService.workspace);
    }
}
