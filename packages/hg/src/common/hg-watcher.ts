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

import { injectable, inject } from 'inversify';
import { JsonRpcServer, JsonRpcProxy } from '@theia/core';
import { Repository, WorkingDirectoryStatus } from './hg-model';
import { Disposable, DisposableCollection, Emitter, Event } from '@theia/core/lib/common';

/**
 * An event representing a `Hg` status change in one of the watched local working directory.
 */
export interface HgStatusChangeEvent {

    /**
     * The source `Hg` repository where the event belongs to.
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

export namespace HgStatusChangeEvent {

    /**
     * `true` if the argument is a `HgStatusEvent`, otherwise `false`.
     * @param event the argument to check whether it is a Hg status change event or not.
     */
    // tslint:disable-next-line:no-any
    export function is(event: any | undefined): event is HgStatusChangeEvent {
        return !!event && ('source' in event) && ('status' in event);
    }

}

/**
 * Client watcher for `Hg`.
 */
export interface HgWatcherClient {

    /**
     * Invoked with the event that encapsulates the status change in the repository.
     */
    onHgChanged(event: HgStatusChangeEvent): Promise<void>;

}

/**
 * The symbol of the Hg watcher backend for DI.
 */
export const HgWatcherServer = Symbol('HgWatcherServer');

/**
 * Service representation communicating between the backend and the frontend.
 */
export interface HgWatcherServer extends JsonRpcServer<HgWatcherClient> {

    /**
     * Watches status changes in the given repository.
     */
    watchHgChanges(repository: Repository): Promise<number>;

    /**
     * De-registers any previously added watchers identified by the unique `watcher` argument. If the watcher cannot be found
     * with its unique ID, the request will be rejected.
     */
    unwatchHgChanges(watcher: number): Promise<void>;

}

export const HgWatcherServerProxy = Symbol('HgWatcherServerProxy');
export type HgWatcherServerProxy = JsonRpcProxy<HgWatcherServer>;

@injectable()
export class ReconnectingHgWatcherServer implements HgWatcherServer {

    private watcherSequence = 1;
    private readonly watchParams = new Map<number, Repository>();
    private readonly localToRemoteWatcher = new Map<number, number>();

    constructor(
        @inject(HgWatcherServerProxy) private readonly proxy: HgWatcherServerProxy
    ) {
        this.proxy.onDidOpenConnection(() => this.reconnect());
    }

    async watchHgChanges(repository: Repository): Promise<number> {
        const watcher = this.watcherSequence++;
        this.watchParams.set(watcher, repository);
        return this.doWatchHgChanges([watcher, repository]);
    }

    async unwatchHgChanges(watcher: number): Promise<void> {
        this.watchParams.delete(watcher);
        const remote = this.localToRemoteWatcher.get(watcher);
        if (remote) {
            this.localToRemoteWatcher.delete(remote);
            return this.proxy.unwatchHgChanges(remote);
        } else {
            throw new Error(`No Hg watchers were registered with ID: ${watcher}.`);
        }
    }

    dispose(): void {
        this.proxy.dispose();
    }

    setClient(client: HgWatcherClient): void {
        this.proxy.setClient(client);
    }

    private reconnect(): void {
        [...this.watchParams.entries()].forEach(entry => this.doWatchHgChanges(entry));
    }

    private async doWatchHgChanges(entry: [number, Repository]): Promise<number> {
        const [watcher, repository] = entry;
        const remote = await this.proxy.watchHgChanges(repository);
        this.localToRemoteWatcher.set(watcher, remote);
        return watcher;
    }
}

/**
 * Unique WS endpoint path to the Hg watcher service.
 */
export const HgWatcherPath = '/services/hg-watcher';

@injectable()
export class HgWatcher implements HgWatcherClient, Disposable {

    private readonly toDispose: DisposableCollection;
    private readonly onHgEventEmitter: Emitter<HgStatusChangeEvent>;

    constructor(
        @inject(HgWatcherServer) private readonly server: HgWatcherServer
    ) {
        this.toDispose = new DisposableCollection();
        this.onHgEventEmitter = new Emitter<HgStatusChangeEvent>();

        this.toDispose.push(this.onHgEventEmitter);
        this.server.setClient({ onHgChanged: e => this.onHgChanged(e) });
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get onHgEvent(): Event<HgStatusChangeEvent> {
        return this.onHgEventEmitter.event;
    }

    async onHgChanged(event: HgStatusChangeEvent): Promise<void> {
        this.onHgEventEmitter.fire(event);
    }

    async watchHgChanges(repository: Repository): Promise<Disposable> {
        const watcher = await this.server.watchHgChanges(repository);
        const toDispose = new DisposableCollection();
        toDispose.push(Disposable.create(() => this.server.unwatchHgChanges(watcher)));
        return toDispose;
    }

}
