/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { injectable, inject } from "inversify";
import { Git } from '../common/git';
import { Repository, WorkingDirectoryStatus } from '../common/model';
import { GitPreferences } from '../common/git-preferences';
import { GitWatcherServer, GitWatcherClient, GitStatusChangeEvent } from '../common/git-watcher';
import { FileSystemWatcherServer } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';

@injectable()
export class DugiteGitWatcherServer implements GitWatcherServer {

    private watcherSequence = 1;
    private client: GitWatcherClient | undefined;
    private readonly watchers: Map<number, NodeJS.Timer>;
    private readonly status: Map<Repository, WorkingDirectoryStatus | undefined>;

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(GitPreferences) protected readonly preferences: GitPreferences,
        @inject(FileSystemWatcherServer) protected readonly filesystemWatcher: FileSystemWatcherServer
    ) {
        this.watchers = new Map();
        this.status = new Map();
    }

    async watchGitChanges(repository: Repository): Promise<number> {
        const watcher = this.watcherSequence++;
        const interval = this.preferences['git.pollInterval']; // TODO refresh timers on preference change.
        const timer = setInterval(async () => {
            try {
                const status = await this.git.status(repository);
                const oldStatus = this.status.get(repository);
                if (this.client && !WorkingDirectoryStatus.equals(status, oldStatus)) {
                    this.status.set(repository, status);
                    const event: GitStatusChangeEvent = {
                        source: repository,
                        status,
                        oldStatus
                    };
                    this.client.onGitChanged(event);
                }
            } catch (error) {
                if (error.message === 'Unable to find path to repository on disk.') {
                    await this.unwatchGitChanges(watcher);
                }
            }
        }, interval);
        this.watchers.set(watcher, timer);
        return watcher;
    }

    async unwatchGitChanges(watcher: number): Promise<void> {
        const timer = this.watchers.get(watcher);
        if (!timer) {
            throw new Error(`No Git watchers were registered with ID: ${watcher}.`);
        }
        clearInterval(timer);
        this.watchers.delete(watcher);
    }

    dispose(): void {
        [...this.watchers.values()].forEach(clearInterval);
    }

    setClient(client?: GitWatcherClient): void {
        this.client = client;
    }

}
