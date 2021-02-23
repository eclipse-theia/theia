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

import { injectable, inject } from '@theia/core/shared/inversify';
import { JsonRpcServer, JsonRpcProxy } from '@theia/core';
import { Repository, WorkingDirectoryStatus } from './git-model';
import { Disposable, DisposableCollection, Emitter, Event } from '@theia/core/lib/common';

/**
 * An event representing a `Git` status change in one of the watched local working directory.
 */
export interface GitStatusChangeEvent {

    /**
     * The source `Git` repository where the event belongs to.
     */
    readonly source: Repository;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function is(event: any | undefined): event is GitStatusChangeEvent {
        return !!event && ('source' in event) && ('status' in event);
    }

}

/**
 * Client watcher for `Git`.
 */
export interface GitWatcherClient {

    /**
     * Invoked with the event that encapsulates the status change in the repository.
     */
    onGitChanged(event: GitStatusChangeEvent): Promise<void>;

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
     * Watches status changes in the given repository.
     */
    watchGitChanges(repository: Repository): Promise<number>;

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
    private readonly watchParams = new Map<number, Repository>();
    private readonly localToRemoteWatcher = new Map<number, number>();

    constructor(
        @inject(GitWatcherServerProxy) private readonly proxy: GitWatcherServerProxy
    ) {
        this.proxy.onDidOpenConnection(() => this.reconnect());
    }

    async watchGitChanges(repository: Repository): Promise<number> {
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

    private async doWatchGitChanges(entry: [number, Repository]): Promise<number> {
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
    private readonly onGitEventEmitter: Emitter<GitStatusChangeEvent>;

    constructor(
        @inject(GitWatcherServer) private readonly server: GitWatcherServer
    ) {
        this.toDispose = new DisposableCollection();
        this.onGitEventEmitter = new Emitter<GitStatusChangeEvent>();

        this.toDispose.push(this.onGitEventEmitter);
        this.server.setClient({ onGitChanged: e => this.onGitChanged(e) });
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get onGitEvent(): Event<GitStatusChangeEvent> {
        return this.onGitEventEmitter.event;
    }

    async onGitChanged(event: GitStatusChangeEvent): Promise<void> {
        this.onGitEventEmitter.fire(event);
    }

    async watchGitChanges(repository: Repository): Promise<Disposable> {
        const watcher = await this.server.watchGitChanges(repository);
        const toDispose = new DisposableCollection();
        toDispose.push(Disposable.create(() => this.server.unwatchGitChanges(watcher)));
        return toDispose;
    }

}
