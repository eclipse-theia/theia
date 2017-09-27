/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { injectable, inject } from "inversify";
import { JsonRpcServer, JsonRpcProxy } from '@theia/core';
import { Repository, WorkingDirectoryStatus } from './model';
import { Disposable, DisposableCollection, Emitter, Event } from '@theia/core/lib/common';

/**
 * An event representing a Git change.
 */
export interface GitEvent {

    /**
     * The source `Git` repository where the event belongs to.
     */
    readonly source: Repository;

    /**
     * The old `Git` source. Might be missing.
     */
    readonly oldSource?: Repository;

}

/**
 * An event representing a `Git` status change in one of the watched local working directory.
 */
export interface GitStatusChangeEvent extends GitEvent {

    /**
     * The new working directory state.
     */
    readonly status: WorkingDirectoryStatus;

    /**
     * The previous working directory state, if any.
     */
    readonly oldStatus?: WorkingDirectoryStatus;

}

export namespace GitStatusChangeEvent {

    /**
     * `true` if the argument is a `GitStatusEvent`, otherwise `false`.
     * @param event the argument to check whether it is a Git status change event or not.
     */
    export function is(event: any | undefined): event is GitStatusChangeEvent {
        return (<GitStatusChangeEvent>event).status !== undefined;
    }

}

/**
 * Client watcher for `Git`.
 */
export interface GitWatcherClient {

    /**
     * Invoked with the event that encapsulates the change.
     */
    onGitChanged(event: GitEvent): Promise<void>;

}

/**
 * The symbol of the Git watcher backend for DI.
 */
export const GitWatcherServer = Symbol('GitWatcherServer');

/**
 * Service representation communicating between the backend and the frontend.
 */
export interface GitWatcherServer extends JsonRpcServer<GitWatcherClient> {

    /**
     * Watches status changes in the repository if the repository is defined, if the `repository` argument is absent,
     * then it watches changes among the repositories. For instance, if a new repository is cloned in the workspace,
     * then a new `GitEvent` with `source` to the new repository, and `undefined` for `oldSource` will be fired to indicate,
     * that a new repository change can be tracked by the client.
     */
    watchGitChanges(repository?: Repository): Promise<number>;

    /**
     * De-registers any previously added watchers identified by the unique `watcher` argument. If the watcher cannot be found
     * with its unique ID, the request will be rejected.
     */
    unwatchGitChanges(watcher: number): Promise<void>;

}

export const GitWatcherServerProxy = Symbol('GitWatcherServerProxy');
export type GitWatcherServerProxy = JsonRpcProxy<GitWatcherServer>;

@injectable()
export class ReconnectingGitWatcherServer implements GitWatcherServer {

    private watcherSequence = 1;
    private readonly watchParams = new Map<number, Repository | undefined>();
    private readonly localToRemoteWatcher = new Map<number, number>();

    constructor(
        @inject(GitWatcherServerProxy) private readonly proxy: GitWatcherServerProxy
    ) {
        this.proxy.onDidOpenConnection(() => this.reconnect());
    }

    async watchGitChanges(repository?: Repository): Promise<number> {
        const watcher = this.watcherSequence++;
        this.watchParams.set(watcher, repository);
        return this.doWatchGitChanges([watcher, repository]);
    }

    async unwatchGitChanges(watcher: number): Promise<void> {
        this.watchParams.delete(watcher);
        const remote = this.localToRemoteWatcher.get(watcher);
        if (remote) {
            this.localToRemoteWatcher.delete(remote);
            return this.proxy.unwatchGitChanges(remote);
        } else {
            throw new Error(`No Git watchers were registered with ID: ${watcher}.`);
        }
    }

    dispose(): void {
        this.proxy.dispose();
    }

    setClient(client: GitWatcherClient): void {
        this.proxy.setClient(client);
    }

    private reconnect(): void {
        [...this.watchParams.entries()].forEach(entry => this.doWatchGitChanges(entry));
    }

    private async doWatchGitChanges(entry: [number, Repository | undefined]): Promise<number> {
        const [watcher, repository] = entry;
        const remote = await this.proxy.watchGitChanges(repository);
        this.localToRemoteWatcher.set(watcher, remote);
        return watcher;
    }
}

/**
 * Unique WS endpoint path to the Git watcher service.
 */
export const GitWatcherPath = '/services/git-watcher';

@injectable()
export class GitWatcher implements GitWatcherClient, Disposable {

    private readonly toDispose: DisposableCollection;
    private readonly onGitEventEmitter: Emitter<GitEvent>;

    constructor(
        @inject(GitWatcherServer) private readonly server: GitWatcherServer
    ) {
        this.toDispose = new DisposableCollection();
        this.onGitEventEmitter = new Emitter<GitEvent>();

        this.toDispose.push(this.onGitEventEmitter);
        this.server.setClient({
            onGitChanged: e => this.onGitChanged(e)
        });
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get onGitEvent(): Event<GitEvent> {
        return this.onGitEventEmitter.event;
    }

    async onGitChanged(event: GitEvent): Promise<void> {
        this.onGitEventEmitter.fire(event);
    }

    async watchGitChanges(repository?: Repository): Promise<Disposable> {
        const watcher = await this.server.watchGitChanges(repository);
        const toDispose = new DisposableCollection();
        toDispose.push(Disposable.create(() => this.server.unwatchGitChanges(watcher)));
        return toDispose;
    }

}
