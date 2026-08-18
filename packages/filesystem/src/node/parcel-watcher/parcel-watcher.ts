// *****************************************************************************
// Copyright (C) 2017-2018 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import path = require('path');
import { promises as fsp } from 'fs';
import { Minimatch } from 'minimatch';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { FileChangeType, FileSystemWatcherServiceClient } from '../../common/filesystem-watcher-protocol';
import { FileChangeCollection } from '../file-change-collection';
import { timeout } from '@theia/core/lib/common/promise-util';
import { subscribe, Options, AsyncSubscription, Event } from '@theia/core/shared/@parcel/watcher';
import { isOSX, isWindows } from '@theia/core';
import { AbstractFileSystemWatcher, AbstractWatcherProvider, ResolvedWatchOptions, WatcherLogger, WatchRequest } from '../filesystem-watcher';

/**
 * The excludes of one parcel watch. Not the same as `ParcelWatcherOptions` in `parcel-options.ts`, which is
 * the injectable token for parcel's own native options.
 */
export interface ParcelWatcherExcludes {
    /** Compiled patterns, used to filter events after they arrive. */
    ignored: Minimatch[]
    /**
     * Raw patterns, passed to the native parcel `ignore` option so excluded directories are never crawled or
     * watched in the first place, rather than only having their events filtered out afterwards. This is what
     * keeps the number of OS file watches bounded on large workspaces.
     */
    ignorePatterns: string[]
}

/** @deprecated since 1.75.0 - use `ParcelWatcherExcludes`, which does not clash with the injectable token. */
export type ParcelWatcherOptions = ParcelWatcherExcludes;

export const ParcelFileSystemWatcherServerOptions = Symbol('ParcelFileSystemWatcherServerOptions');
export interface ParcelFileSystemWatcherServerOptions extends WatcherLogger {
    parcelOptions: Options;
}

/**
 * This is a flag value passed around upon disposal.
 */
export const WatcherDisposal = Symbol('WatcherDisposal');

/**
 * Because URIs can be watched by different clients, we'll track
 * how many are listening for a given URI.
 *
 * This component wraps the whole start/stop process given some
 * reference count.
 *
 * Once there are no more references the handle
 * will wait for some time before destroying its resources.
 */
export class ParcelWatcher extends AbstractFileSystemWatcher {

    /**
     * When this field is set, it means the watcher instance was successfully started.
     */
    protected watcher: AsyncSubscription | undefined;

    /**
     * When the ref count hits zero, we schedule this watch handle to be disposed.
     */
    protected deferredDisposalTimer: NodeJS.Timeout | undefined;

    /**
     * We count each reference made to this watcher, per client.
     *
     * We do this to know where to send events via the network.
     *
     * An entry should be removed when its value hits zero.
     */
    protected readonly refsPerClient = new Map<number, { value: number }>();

    /** Requests served by this watcher, so that releasing one drops the reference of the right client. */
    private readonly requests = new Map<number, WatchRequest>();

    /**
     * Ensures that events are processed in the order they are emitted,
     * despite being processed async.
     */
    protected parcelEventProcessingQueue: Promise<void> = Promise.resolve();

    /**
     * Promise that resolves when the watcher is fully started, or got disposed.
     *
     * Will reject if an error occurred while starting.
     *
     * @returns `true` if successfully started, `false` if disposed early.
     */
    readonly whenStarted: Promise<boolean>;

    // copied from https://github.com/microsoft/vscode/blob/e3a5acfb517a443235981655413d566533107e92/src/vs/platform/files/node/watcher/parcel/parcelWatcher.ts#L158
    private static readonly PARCEL_WATCHER_BACKEND = isWindows ? 'windows' : isOSX ? 'fs-events' : 'inotify';

    constructor(
        /**
         * Initial reference to this handle.
         * @deprecated since 1.75.0 - pass `undefined` and use {@link addRequest}; references follow requests.
         */
        initialClientId: number | undefined,
        /** Filesystem path to be watched. */
        readonly fsPath: string,
        /** Watcher-specific options */
        readonly watcherOptions: ParcelWatcherExcludes,
        /** Logging and parcel watcher options */
        protected readonly parcelFileSystemWatchServerOptions: ParcelFileSystemWatcherServerOptions,
        /** The client to forward events to. */
        protected readonly fileSystemWatcherClient: FileSystemWatcherServiceClient,
        /** Amount of time in ms to wait once this handle is not referenced anymore. */
        protected readonly deferredDisposalTimeout = 10_000,
    ) {
        super(fsPath, parcelFileSystemWatchServerOptions);
        if (initialClientId !== undefined) {
            this.refsPerClient.set(initialClientId, { value: 1 });
        }
        this.whenStarted = this.start().then(() => true, error => {
            if (error === WatcherDisposal) {
                return false;
            }
            console.error(`Watcher failed to start at "${this.fsPath}":`, error);
            this._dispose();
            this.fireError();
            throw error;
        });
        this.debug('NEW', `initialClientId=${initialClientId}`);
    }

    addRequest(watcherId: number, request: WatchRequest): void {
        this.requests.set(watcherId, request);
        this.addRef(request.clientId);
    }

    removeRequest(watcherId: number): void {
        const request = this.requests.get(watcherId);
        if (request) {
            this.requests.delete(watcherId);
            this.removeRef(request.clientId);
        }
    }

    addRef(clientId: number): void {
        let refs = this.refsPerClient.get(clientId);
        if (typeof refs === 'undefined') {
            this.refsPerClient.set(clientId, refs = { value: 1 });
        } else {
            refs.value += 1;
        }
        const totalRefs = this.getTotalReferences();
        // If it was zero before, 1 means we were revived:
        const revived = totalRefs === 1;
        if (revived) {
            this.onRefsRevive();
        }
        this.debug('REF++', `clientId=${clientId}, clientRefs=${refs.value}, totalRefs=${totalRefs}. revived=${revived}`);
    }

    removeRef(clientId: number): void {
        const refs = this.refsPerClient.get(clientId);
        if (typeof refs === 'undefined') {
            this.info('WARN REF--', `removed one too many reference: clientId=${clientId}`);
            return;
        }
        refs.value -= 1;
        // We must remove the key from `this.clientReferences` because
        // we list active clients by reading the keys of this map.
        if (refs.value === 0) {
            this.refsPerClient.delete(clientId);
        }
        const totalRefs = this.getTotalReferences();
        const dead = totalRefs === 0;
        if (dead) {
            this.onRefsReachZero();
        }
        this.debug('REF--', `clientId=${clientId}, clientRefs=${refs.value}, totalRefs=${totalRefs}, dead=${dead}`);
    }

    /**
     * All clients with at least one active reference.
     */
    getClientIds(): number[] {
        return Array.from(this.refsPerClient.keys());
    }

    /**
     * Add the references for each client together.
     */
    getTotalReferences(): number {
        let total = 0;
        for (const refs of this.refsPerClient.values()) {
            total += refs.value;
        }
        return total;
    }

    /**
     * Returns true if at least one client listens to this handle.
     */
    isInUse(): boolean {
        return this.refsPerClient.size > 0;
    }

    /**
     * @throws with {@link WatcherDisposal} if this instance is disposed.
     */
    protected assertNotDisposed(): void {
        if (this.isDisposed) {
            throw WatcherDisposal;
        }
    }

    /**
     * When starting a watcher, we'll first check and wait for the path to exists
     * before running a parcel watcher.
     */
    protected async start(): Promise<void> {
        while (await fsp.stat(this.fsPath).then(() => false, () => true)) {
            await timeout(500);
            this.assertNotDisposed();
        }
        this.assertNotDisposed();
        // This race is specific to Linux/inotify: parcel-watcher's inotify backend walks
        // the tree and then calls inotify_add_watch on every subdirectory. If a subdirectory
        // disappears between the walk and the add (common when watching dirs that contain
        // auto-rotated log/temp folders), the syscall returns ENOENT and parcel-watcher fails
        // the entire subscribe. Retry a few times: by the next walk the gone-but-not-forgotten
        // dir is no longer present. Windows (ReadDirectoryChangesW) and macOS (FSEvents) watch
        // the whole subtree from a single handle on the root and never register per-subdirectory
        // watches, so they cannot hit this race; the retry is simply a no-op there.
        let watcher: AsyncSubscription | undefined;
        let attempt = 0;
        while (true) {
            try {
                watcher = await this.createWatcher();
                break;
            } catch (error) {
                const message: string = (error && error.message) || '';
                const isTransientEnoent = message.includes('No such file or directory')
                    && await fsp.stat(this.fsPath).then(() => true, () => false);
                if (!isTransientEnoent || attempt >= 4) {
                    throw error;
                }
                attempt++;
                this.assertNotDisposed();
                await timeout(100 * attempt);
                this.assertNotDisposed();
            }
        }
        this.assertNotDisposed();
        this.debug('STARTED', `disposed=${this.isDisposed}`);
        // The watcher could be disposed while it was starting, make sure to check for this:
        if (this.isDisposed) {
            await this.stopWatcher(watcher);
            throw WatcherDisposal;
        }
        this.watcher = watcher;
    }

    /**
     * Given a started parcel watcher instance, gracefully shut it down.
     */
    protected async stopWatcher(watcher: AsyncSubscription): Promise<void> {
        await watcher.unsubscribe()
            .then(() => 'success=true', error => error)
            .then(status => this.debug('STOPPED', status));
    }

    protected async createWatcher(): Promise<AsyncSubscription> {
        let fsPath = await fsp.realpath(this.fsPath);
        if ((await fsp.stat(fsPath)).isFile()) {
            fsPath = path.dirname(fsPath);
        }
        return subscribe(fsPath, (err, events) => {
            if (err) {
                if (err.message && err.message.includes('File system must be re-scanned')) {
                    console.log(`FS Events were dropped on watcher ${fsp}`);
                } else {
                    console.error(`Watcher service error on "${fsPath}":`, err);
                    this._dispose();
                    this.fireError();
                    return;
                }
            }
            if (events) {
                this.handleWatcherEvents(events);
            }
        }, {
            backend: ParcelWatcher.PARCEL_WATCHER_BACKEND,
            ...this.parcelFileSystemWatchServerOptions.parcelOptions,
            // Pass the excludes to parcel's native `ignore` so excluded directories are pruned
            // from the watch tree (no OS watch is placed), not merely filtered out of the event
            // stream. Mirrors VS Code's parcel watcher (`ignore: <request excludes>`).
            ignore: [
                ...(this.parcelFileSystemWatchServerOptions.parcelOptions.ignore ?? []),
                ...this.watcherOptions.ignorePatterns
            ]
        });
    }

    protected handleWatcherEvents(events: Event[]): void {
        // Only process events if someone is listening.
        if (this.isInUse()) {
            // This callback is async, but parcel won't wait for it to finish before firing the next one.
            // We will use a lock/queue to make sure everything is processed in the order it arrives.
            this.parcelEventProcessingQueue = this.parcelEventProcessingQueue.then(async () => {
                const fileChangeCollection = new FileChangeCollection();
                for (const event of events) {
                    const filePath = event.path;
                    if (event.type === 'create') {
                        this.pushFileChange(fileChangeCollection, FileChangeType.ADDED, filePath);
                    } else if (event.type === 'delete') {
                        this.pushFileChange(fileChangeCollection, FileChangeType.DELETED, filePath);
                    } else if (event.type === 'update') {
                        this.pushFileChange(fileChangeCollection, FileChangeType.UPDATED, filePath);
                    }
                }
                const changes = fileChangeCollection.values();
                // If all changes are part of the ignored files, the collection will be empty.
                if (changes.length > 0) {
                    this.fileSystemWatcherClient.onDidFilesChanged({
                        clients: this.getClientIds(),
                        changes,
                    });
                }
            }, console.error);
        }
    }

    protected async resolveEventPath(directory: string, file: string): Promise<string> {
        // parcel already resolves symlinks, the paths should be clean already:
        return path.resolve(directory, file);
    }

    protected pushFileChange(changes: FileChangeCollection, type: FileChangeType, filePath: string): void {
        if (!this.isIgnored(filePath)) {
            const uri = FileUri.create(filePath).toString();
            changes.push({ type, uri });
        }
    }

    protected fireError(): void {
        this.fileSystemWatcherClient.onError({
            clients: this.getClientIds(),
            uri: this.fsPath,
        });
    }

    /**
     * When references hit zero, we'll schedule disposal for a bit later.
     *
     * This allows new references to reuse this watcher instead of creating a new one.
     *
     * e.g. A frontend disconnects for a few milliseconds before reconnecting again.
     */
    protected onRefsReachZero(): void {
        this.deferredDisposalTimer = setTimeout(() => this._dispose(), this.deferredDisposalTimeout);
    }

    /**
     * If we get new references after hitting zero, let's unschedule our disposal and keep watching.
     */
    protected onRefsRevive(): void {
        if (this.deferredDisposalTimer) {
            clearTimeout(this.deferredDisposalTimer);
            this.deferredDisposalTimer = undefined;
        }
    }

    protected isIgnored(filePath: string): boolean {
        return this.watcherOptions.ignored.length > 0
            && this.watcherOptions.ignored.some(m => m.match(filePath));
    }

    /**
     * Internal disposal mechanism.
     */
    protected async _dispose(): Promise<void> {
        if (this.markDisposed()) {
            if (this.watcher) {
                this.stopWatcher(this.watcher);
                this.watcher = undefined;
            }
            this.debug('DISPOSED');
        }
    }

}

/** Serves recursive requests with `@parcel/watcher`, one subscription per path and exclude set. */
export class RecursiveWatcherProvider extends AbstractWatcherProvider {

    constructor(
        protected readonly options: ParcelFileSystemWatcherServerOptions,
        protected readonly client: FileSystemWatcherServiceClient,
        protected readonly deferredDisposalTimeout?: number
    ) {
        super();
    }

    canHandle(options: ResolvedWatchOptions): boolean {
        return options.recursive;
    }

    async watch(watcherId: number, request: WatchRequest): Promise<ParcelWatcher> {
        const watcher = this.getOrCreateWatcher(this.watcherKey(request), () => this.createWatcher(request));
        watcher.addRequest(watcherId, request);
        return watcher;
    }

    /** Excludes are part of the key: parcel prunes them from the crawl, so a different set is a different watch. */
    protected watcherKey(request: WatchRequest): string {
        return [request.path, [...request.ignored].sort().join()].join();
    }

    protected createWatcher(request: WatchRequest): ParcelWatcher {
        const watcherOptions: ParcelWatcherExcludes = {
            ignored: request.ignored.map(pattern => new Minimatch(pattern, { dot: true })),
            ignorePatterns: [...request.ignored]
        };
        return new ParcelWatcher(undefined, request.path, watcherOptions, this.options, this.client, this.deferredDisposalTimeout);
    }
}
