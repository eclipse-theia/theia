/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { DisposableCollection, Disposable } from "@theia/core";
import { Repository } from '../common';
import { GitWatcherServer, GitWatcherClient } from '../common/git-watcher';
import { GitRepositoryManager } from "./git-repository-manager";

@injectable()
export class DugiteGitWatcherServer implements GitWatcherServer {

    protected client: GitWatcherClient | undefined;

    protected watcherSequence = 1;
    protected readonly watchers = new Map<number, Disposable>();
    protected readonly subscriptions = new Map<string, DisposableCollection>();

    constructor(
        @inject(GitRepositoryManager) protected readonly manager: GitRepositoryManager
    ) { }

    dispose(): void {
        for (const watcher of this.watchers.values()) {
            watcher.dispose();
        }
        this.watchers.clear();
        this.subscriptions.clear();
    }

    async watchGitChanges(repository: Repository): Promise<number> {
        const reference = await this.manager.getWatcher(repository);
        const watcher = reference.object;

        const repositoryUri = repository.localUri;
        let subscriptions = this.subscriptions.get(repositoryUri);
        if (subscriptions === undefined) {
            const unsubscribe = watcher.onStatusChanged(e => {
                if (this.client) {
                    this.client.onGitChanged(e);
                }
            });
            subscriptions = new DisposableCollection();
            subscriptions.onDispose(() => {
                unsubscribe.dispose();
                this.subscriptions.delete(repositoryUri);
            });
            this.subscriptions.set(repositoryUri, subscriptions);
        }

        watcher.watch();
        subscriptions.push(reference);
        const watcherId = this.watcherSequence++;
        this.watchers.set(watcherId, reference);
        return watcherId;
    }

    async unwatchGitChanges(watcher: number): Promise<void> {
        const disposable = this.watchers.get(watcher);
        if (disposable) {
            disposable.dispose();
            this.watchers.delete(watcher);
        } else {
            throw new Error(`No Git watchers were registered with ID: ${watcher}.`);
        }
    }

    setClient(client?: GitWatcherClient): void {
        this.client = client;
    }

}
