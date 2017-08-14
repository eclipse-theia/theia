/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { status } from 'dugite-extra/lib/command';
import { Git } from '../common/git';
import { Repository, WorkingDirectoryStatus, FileChange } from '../common/model';
import { IStatusResult, IAheadBehind, WorkingDirectoryStatus as DugiteStatus, FileChange as DugiteFileChange } from 'dugite-extra/lib/model';

/**
 * `dugite-extra` based Git implementation.
 */
export class DugiteGit implements Git {

    private pollInterval: number;
    private readonly pollers: Map<Repository, NodeJS.Timer>;
    private readonly listeners: Map<Repository, ((status: WorkingDirectoryStatus) => void)[]>;
    private readonly lastStatus: Map<Repository, WorkingDirectoryStatus>;

    constructor() {
        this.pollInterval = 1000; // TODO use preferences for polling time.
        this.pollers = new Map();
        this.listeners = new Map();
        this.lastStatus = new Map();
    }

    status(repository: Repository): Promise<WorkingDirectoryStatus> {
        const path = FileUri.fsPath(new URI(repository.localUri));
        return status(path).then(result => mapStatus(result, repository));
    }

    on(event: "statusChange", repository: Repository, listener: (status: WorkingDirectoryStatus) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            const key = [...this.listeners.keys()].find(r => Repository.equals(repository, r)) || repository;
            let listeners = this.listeners.get(key);
            if (!listeners) {
                listeners = [];
                this.listeners.set(key, listeners);
            }
            if (listeners.indexOf(listener) !== -1) {
                return resolve();
            }
            if (!this.pollers.has(key)) {
                const poller = setInterval(async () => {
                    const newStatus = await this.status(key);
                    const oldStatus = this.lastStatus.get(key);
                    // Send the change event, only if the status has changed.
                    if (!WorkingDirectoryStatus.equals(oldStatus, newStatus)) {
                        this.lastStatus.set(key, newStatus);
                        listeners!.forEach(listener => listener(newStatus));
                    }
                }, this.pollInterval);
                this.pollers.set(key, poller);
            }
            listeners.push(listener);
            return resolve();
        });
    }

    off(event: "statusChange", repository: Repository, listener: (status: WorkingDirectoryStatus) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            const key = [...this.listeners.keys()].find(r => Repository.equals(repository, r)) || repository;
            const listeners = this.listeners.get(key);
            if (!listeners) {
                return resolve();
            }
            const index = listeners.indexOf(listener);
            if (index !== -1) {
                listeners.splice(index, 1);
                if (listeners.length === 0) {
                    this.listeners.delete(repository);
                    const poller = this.pollers.get(repository);
                    if (poller) {
                        clearTimeout(poller);
                    }
                    this.pollers.delete(repository);
                    this.lastStatus.delete(repository);
                }
            }
            return resolve();
        });
    }

}

function mapStatus(toMap: IStatusResult, repository: Repository): WorkingDirectoryStatus {
    return {
        exists: toMap.exists,
        branch: toMap.currentBranch,
        upstreamBranch: toMap.currentUpstreamBranch,
        aheadBehind: mapAheadBehind(toMap.branchAheadBehind),
        changes: mapFileChanges(toMap.workingDirectory, repository),
        currentHead: toMap.currentTip
    };
}

function mapAheadBehind(toMap: IAheadBehind | undefined): { ahead: number, behind: number } | undefined {
    return toMap ? { ...toMap } : undefined;
}

function mapFileChanges(toMap: DugiteStatus, repository: Repository): FileChange[] {
    return toMap.files.map(file => mapFileChange(file, repository));
}

function mapFileChange(toMap: DugiteFileChange, repository: Repository): FileChange {
    return {
        uri: FileUri.create(path.join(repository.localUri, toMap.path)),
        status: toMap.status,
        oldUri: toMap.oldPath ? FileUri.create(toMap.oldPath) : undefined
    };
}
