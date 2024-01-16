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

import nsfw = require('@theia/core/shared/nsfw');
import path = require('path');
import { promises as fsp } from 'fs';
import { IMinimatch, Minimatch } from 'minimatch';
import { FileUri } from '@theia/core/lib/common/file-uri';
import {
    FileChangeType, FileSystemWatcherService, FileSystemWatcherServiceClient, WatchOptions
} from '../../common/filesystem-watcher-protocol';
import { FileChangeCollection } from '../file-change-collection';
import { Deferred, timeout } from '@theia/core/lib/common/promise-util';

export interface NsfwWatcherOptions {
    ignored: IMinimatch[]
}

export const NsfwFileSystemWatcherServerOptions = Symbol('NsfwFileSystemWatcherServerOptions');
export interface NsfwFileSystemWatcherServerOptions {
    verbose: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    info: (message: string, ...args: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error: (message: string, ...args: any[]) => void;
    nsfwOptions: nsfw.Options;
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
export class NsfwWatcher {

    protected static debugIdSequence = 0;

    protected disposed = false;

    /**
     * Used for debugging to keep track of the watchers.
     */
    protected debugId = NsfwWatcher.debugIdSequence++;

    /**
     * When this field is set, it means the nsfw instance was successfully started.
     */
    protected nsfw: nsfw.NSFW | undefined;

    /**
     * When the ref count hits zero, we schedule this watch handle to be disposed.
     */
    protected deferredDisposalTimer: NodeJS.Timeout | undefined;

    /**
     * This deferred only rejects with `WatcherDisposal` and never resolves.
     */
    protected readonly deferredDisposalDeferred = new Deferred<never>();

    /**
     * We count each reference made to this watcher, per client.
     *
     * We do this to know where to send events via the network.
     *
     * An entry should be removed when its value hits zero.
     */
    protected readonly refsPerClient = new Map<number, { value: number }>();

    /**
     * Ensures that events are processed in the order they are emitted,
     * despite being processed async.
     */
    protected nsfwEventProcessingQueue: Promise<void> = Promise.resolve();

    /**
     * Resolves once this handle disposed itself and its resources. Never throws.
     */
    readonly whenDisposed: Promise<void> = this.deferredDisposalDeferred.promise.catch(() => undefined);

    /**
     * Promise that resolves when the watcher is fully started, or got disposed.
     *
     * Will reject if an error occurred while starting.
     *
     * @returns `true` if successfully started, `false` if disposed early.
     */
    readonly whenStarted: Promise<boolean>;

    constructor(
        /** Initial reference to this handle. */
        initialClientId: number,
        /** Filesystem path to be watched. */
        readonly fsPath: string,
        /** Watcher-specific options */
        readonly watcherOptions: NsfwWatcherOptions,
        /** Logging and Nsfw options */
        protected readonly nsfwFileSystemWatchServerOptions: NsfwFileSystemWatcherServerOptions,
        /** The client to forward events to. */
        protected readonly fileSystemWatcherClient: FileSystemWatcherServiceClient,
        /** Amount of time in ms to wait once this handle is not referenced anymore. */
        protected readonly deferredDisposalTimeout = 10_000,
    ) {
        this.refsPerClient.set(initialClientId, { value: 1 });
        this.whenStarted = this.start().then(() => true, error => {
            if (error === WatcherDisposal) {
                return false;
            }
            this._dispose();
            this.fireError();
            throw error;
        });
        this.debug('NEW', `initialClientId=${initialClientId}`);
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
        if (this.disposed) {
            throw WatcherDisposal;
        }
    }

    /**
     * When starting a watcher, we'll first check and wait for the path to exists
     * before running an NSFW watcher.
     */
    protected async start(): Promise<void> {
        while (await fsp.stat(this.fsPath).then(() => false, () => true)) {
            await timeout(500);
            this.assertNotDisposed();
        }
        this.assertNotDisposed();
        const watcher = await this.createNsfw();
        this.assertNotDisposed();
        await watcher.start();
        this.debug('STARTED', `disposed=${this.disposed}`);
        // The watcher could be disposed while it was starting, make sure to check for this:
        if (this.disposed) {
            await this.stopNsfw(watcher);
            throw WatcherDisposal;
        }
        this.nsfw = watcher;
    }

    /**
     * Given a started nsfw instance, gracefully shut it down.
     */
    protected async stopNsfw(watcher: nsfw.NSFW): Promise<void> {
        await watcher.stop()
            .then(() => 'success=true', error => error)
            .then(status => this.debug('STOPPED', status));
    }

    protected async createNsfw(): Promise<nsfw.NSFW> {
        const fsPath = await fsp.realpath(this.fsPath);
        return nsfw(fsPath, events => this.handleNsfwEvents(events), {
            ...this.nsfwFileSystemWatchServerOptions.nsfwOptions,
            // The errorCallback is called whenever NSFW crashes *while* watching.
            // See https://github.com/atom/github/issues/342
            errorCallback: error => {
                console.error(`NSFW service error on "${fsPath}":`, error);
                this._dispose();
                this.fireError();
                // Make sure to call user's error handling code:
                if (this.nsfwFileSystemWatchServerOptions.nsfwOptions.errorCallback) {
                    this.nsfwFileSystemWatchServerOptions.nsfwOptions.errorCallback(error);
                }
            },
        });
    }

    protected handleNsfwEvents(events: nsfw.FileChangeEvent[]): void {
        // Only process events if someone is listening.
        if (this.isInUse()) {
            // This callback is async, but nsfw won't wait for it to finish before firing the next one.
            // We will use a lock/queue to make sure everything is processed in the order it arrives.
            this.nsfwEventProcessingQueue = this.nsfwEventProcessingQueue.then(async () => {
                const fileChangeCollection = new FileChangeCollection();
                await Promise.all(events.map(async event => {
                    if (event.action === nsfw.actions.RENAMED) {
                        const [oldPath, newPath] = await Promise.all([
                            this.resolveEventPath(event.directory, event.oldFile),
                            this.resolveEventPath(event.newDirectory, event.newFile),
                        ]);
                        this.pushFileChange(fileChangeCollection, FileChangeType.DELETED, oldPath);
                        this.pushFileChange(fileChangeCollection, FileChangeType.ADDED, newPath);
                    } else {
                        const filePath = await this.resolveEventPath(event.directory, event.file!);
                        if (event.action === nsfw.actions.CREATED) {
                            this.pushFileChange(fileChangeCollection, FileChangeType.ADDED, filePath);
                        } else if (event.action === nsfw.actions.DELETED) {
                            this.pushFileChange(fileChangeCollection, FileChangeType.DELETED, filePath);
                        } else if (event.action === nsfw.actions.MODIFIED) {
                            this.pushFileChange(fileChangeCollection, FileChangeType.UPDATED, filePath);
                        }
                    }
                }));
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
        // nsfw already resolves symlinks, the paths should be clean already:
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
        if (!this.disposed) {
            this.disposed = true;
            this.deferredDisposalDeferred.reject(WatcherDisposal);
            if (this.nsfw) {
                this.stopNsfw(this.nsfw);
                this.nsfw = undefined;
            }
            this.debug('DISPOSED');
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected info(prefix: string, ...params: any[]): void {
        this.nsfwFileSystemWatchServerOptions.info(`${prefix} NsfwWatcher(${this.debugId} at "${this.fsPath}"):`, ...params);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected debug(prefix: string, ...params: any[]): void {
        if (this.nsfwFileSystemWatchServerOptions.verbose) {
            this.info(prefix, ...params);
        }
    }
}

/**
 * Each time a client makes a watchRequest, we generate a unique watcherId for it.
 *
 * This watcherId will map to this handle type which keeps track of the clientId that made the request.
 */
export interface NsfwWatcherHandle {
    clientId: number;
    watcher: NsfwWatcher;
}

export class NsfwFileSystemWatcherService implements FileSystemWatcherService {

    protected client: FileSystemWatcherServiceClient | undefined;

    protected watcherId = 0;
    protected readonly watchers = new Map<string, NsfwWatcher>();
    protected readonly watcherHandles = new Map<number, NsfwWatcherHandle>();

    protected readonly options: NsfwFileSystemWatcherServerOptions;

    /**
     * `this.client` is undefined until someone sets it.
     */
    protected readonly maybeClient: FileSystemWatcherServiceClient = {
        onDidFilesChanged: event => this.client?.onDidFilesChanged(event),
        onError: event => this.client?.onError(event),
    };

    constructor(options?: Partial<NsfwFileSystemWatcherServerOptions>) {
        this.options = {
            nsfwOptions: {},
            verbose: false,
            info: (message, ...args) => console.info(message, ...args),
            error: (message, ...args) => console.error(message, ...args),
            ...options
        };
    }

    setClient(client: FileSystemWatcherServiceClient | undefined): void {
        this.client = client;
    }

    /**
     * A specific client requests us to watch a given `uri` according to some `options`.
     *
     * We internally re-use all the same `(uri, options)` pairs.
     */
    async watchFileChanges(clientId: number, uri: string, options?: WatchOptions): Promise<number> {
        const resolvedOptions = this.resolveWatchOptions(options);
        const watcherKey = this.getWatcherKey(uri, resolvedOptions);
        let watcher = this.watchers.get(watcherKey);
        if (watcher === undefined) {
            const fsPath = FileUri.fsPath(uri);
            watcher = this.createWatcher(clientId, fsPath, resolvedOptions);
            watcher.whenDisposed.then(() => this.watchers.delete(watcherKey));
            this.watchers.set(watcherKey, watcher);
        } else {
            watcher.addRef(clientId);
        }
        const watcherId = this.watcherId++;
        this.watcherHandles.set(watcherId, { clientId, watcher });
        watcher.whenDisposed.then(() => this.watcherHandles.delete(watcherId));
        return watcherId;
    }

    protected createWatcher(clientId: number, fsPath: string, options: WatchOptions): NsfwWatcher {
        const watcherOptions: NsfwWatcherOptions = {
            ignored: options.ignored
                .map(pattern => new Minimatch(pattern, { dot: true })),
        };
        return new NsfwWatcher(clientId, fsPath, watcherOptions, this.options, this.maybeClient);
    }

    async unwatchFileChanges(watcherId: number): Promise<void> {
        const handle = this.watcherHandles.get(watcherId);
        if (handle === undefined) {
            console.warn(`tried to de-allocate a disposed watcher: watcherId=${watcherId}`);
        } else {
            this.watcherHandles.delete(watcherId);
            handle.watcher.removeRef(handle.clientId);
        }
    }

    /**
     * Given some `URI` and some `WatchOptions`, generate a unique key.
     */
    protected getWatcherKey(uri: string, options: WatchOptions): string {
        return [
            uri,
            options.ignored.slice(0).sort().join()  // use a **sorted copy** of `ignored` as part of the key
        ].join();
    }

    /**
     * Return fully qualified options.
     */
    protected resolveWatchOptions(options?: WatchOptions): WatchOptions {
        return {
            ignored: [],
            ...options,
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected debug(message: string, ...params: any[]): void {
        if (this.options.verbose) {
            this.options.info(message, ...params);
        }
    }

    dispose(): void {
        // Singletons shouldn't be disposed...
    }
}
