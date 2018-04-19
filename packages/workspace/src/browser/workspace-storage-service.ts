/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { StorageService } from '@theia/core/lib/browser/storage-service';
import { WorkspaceService } from './workspace-service';
import { inject, injectable, postConstruct } from 'inversify';
import { ILogger } from '@theia/core/lib/common';
import { LocalStorageService } from '@theia/core/lib/browser/storage-service';

/*
 * Prefixes any stored data with the current workspace path.
 */
@injectable()
export class WorkspaceStorageService implements StorageService {

    private prefix: string;
    private initialized: Promise<void>;
    protected storageService: StorageService;

    @inject(WorkspaceService)
    protected workspaceService: WorkspaceService;

    @inject(ILogger)
    protected logger: ILogger;

    constructor() {
        this.storageService = new LocalStorageService(this.logger);
    }

    @postConstruct()
    protected async init(): Promise<void> {
        const instanceId = await this.workspaceService.getTheiaId();
        const workspaceId = await this.workspaceService.getWorkspaceId();
        this.prefix = `${instanceId}:${workspaceId ? workspaceId : '_global_'}`;
        this.initialized = Promise.resolve();
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
        return this.prefix + ":" + originalKey;
    }
}
