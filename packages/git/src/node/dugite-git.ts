/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import URI from '@theia/core/lib/common/uri';
import { Disposable } from '@theia/core/lib/common';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { status } from 'dugite-extra/lib/command';
import { Git } from '../common/git';
import { Repository, WorkingDirectoryStatus, FileChange } from '../common/model';
import { IStatusResult, IAheadBehind, WorkingDirectoryStatus as DugiteStatus, FileChange as DugiteFileChange } from 'dugite-extra/lib/model';

/**
 * `dugite-extra` based Git implementation.
 */
export class DugiteGit implements Git {

    private static LISTENER_ID = 0;

    private pollInterval: number;
    private readonly pollers: Map<Repository, NodeJS.Timer>;
    private readonly listeners: Map<Repository, { disposable: Disposable, callback: (status: WorkingDirectoryStatus) => void }[]>;
    private readonly lastStatus: Map<Repository, WorkingDirectoryStatus>;
    private readonly listenerMapping: Map<number, { disposable: Disposable, callback: (status: WorkingDirectoryStatus) => void }>;

    constructor() {
        this.pollInterval = 1000; // TODO use preferences for polling time.
        this.pollers = new Map();
        this.listeners = new Map();
        this.lastStatus = new Map();
        this.listenerMapping = new Map();
    }

    status(repository: Repository): Promise<WorkingDirectoryStatus> {
        const path = FileUri.fsPath(new URI(repository.localUri));
        return status(path).then(result => mapStatus(result, repository));
    }

    onStatusChange(repository: Repository, callback: (status: WorkingDirectoryStatus) => void): Promise<Disposable> {
        return new Promise((resolve, reject) => {
            const key = [...this.listeners.keys()].find(r => Repository.equals(repository, r)) || repository;
            let collection = this.listeners.get(key);
            if (!collection) {
                collection = [];
                this.listeners.set(key, collection);
            }
            if (!this.pollers.has(key)) {
                const poller = setInterval(async () => {
                    const newStatus = await this.status(key);
                    const oldStatus = this.lastStatus.get(key);
                    // Send the change event, only if the status has changed.
                    if (!WorkingDirectoryStatus.equals(oldStatus, newStatus)) {
                        this.lastStatus.set(key, newStatus);
                        collection!.map(entry => entry.callback).forEach(callback => callback(newStatus));
                    }
                }, this.pollInterval);
                this.pollers.set(key, poller);
            }
            const listenerId = ++DugiteGit.LISTENER_ID;
            const _git = this;
            const disposable = {
                dispose() {
                    _git.dispose(listenerId, key);
                }
            }
            const entry = { disposable, callback };
            collection!.push(entry);
            this.listenerMapping.set(listenerId, entry);
            return resolve(disposable);
        });
    }

    private dispose(listenerId: number, repository: Repository) {
        const entry = this.listenerMapping.get(listenerId);
        if (entry) {
            const listeners = this.listeners.get(repository);
            if (listeners) {
                const index = listeners.indexOf(entry);
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
            }
        }
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
