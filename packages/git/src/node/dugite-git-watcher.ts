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
// import { WorkspaceServer } from '@theia/workspace/lib/common/workspace-protocol';

@injectable()
export class DugiteGitWatcherServer implements GitWatcherServer {

    private watcherSequence = 1;
    private client: GitWatcherClient | undefined;
    private readonly watchers: Map<number, NodeJS.Timer>;
    private readonly status: Map<Repository, WorkingDirectoryStatus | undefined>;

    constructor(
        @inject(Git) private readonly git: Git,
        @inject(GitPreferences) private readonly preferences: GitPreferences,
        // @inject(WorkspaceServer) private readonly workspace: WorkspaceServer
    ) {
        this.watchers = new Map();
        this.status = new Map();
    }

    async watchGitChanges(repository?: Repository): Promise<number> {
        const watcher = this.watcherSequence++;
        if (!repository) {
            throw new Error('Global watchers are not yet implemented.');
        } else {
            const interval = this.preferences['git.pollInterval']; // TODO refresh timers on preference change.
            const timer = setInterval(async () => {
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
            }, interval);
            this.watchers.set(watcher, timer);
        }
        return watcher;
    }

    async unwatchGitChanges(watcher: number): Promise<void> {
        if (!this.watchers.delete(watcher)) {
            throw new Error(`No Git watchers were registered with ID: ${watcher}.`);
        }
    }

    dispose(): void {
        [...this.watchers.values()].forEach(timer => clearInterval(timer));
    }

    setClient(client?: GitWatcherClient): void {
        this.client = client;
    }

}
