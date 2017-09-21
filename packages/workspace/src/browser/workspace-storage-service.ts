/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { StorageService } from '@theia/core/lib/browser/storage-service';
import { WorkspaceService } from './workspace-service';
import { inject, injectable } from 'inversify';
import { FileStat } from '@theia/filesystem/lib/common/filesystem';
import { ILogger } from '@theia/core/lib/common';
import { LocalStorageService } from '@theia/core/lib/browser/storage-service';

/*
 * Prefixes any stored data with the current workspace path.
 */
@injectable()
export class WorkspaceStorageService implements StorageService {

    // we cache the root here because we cannot work with promises during window.onunload (see packages/core/src/browser/shell-layout-restorer.ts)
    private root: FileStat;
    private rootPromise: Promise<FileStat>;
    protected storageService: StorageService;

    constructor( @inject(WorkspaceService) protected workspaceService: WorkspaceService,
        @inject(ILogger) protected logger: ILogger) {
        this.rootPromise = this.workspaceService.root;
        this.rootPromise.then(stat => this.root = stat);
        this.storageService = new LocalStorageService(this.logger);
    }

    async setData<T>(key: string, data: T): Promise<void> {
        if (!this.root) {
            await this.rootPromise;
        }
        const fullKey = this.prefixWorkspaceURI(key);
        return this.storageService.setData(fullKey, data);
    }

    async getData<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        await this.rootPromise;
        const fullKey = this.prefixWorkspaceURI(key);
        return this.storageService.getData(fullKey, defaultValue);
    }

    protected prefixWorkspaceURI(originalKey: string): string {
        return this.root.uri + ":" + originalKey;
    }
}
