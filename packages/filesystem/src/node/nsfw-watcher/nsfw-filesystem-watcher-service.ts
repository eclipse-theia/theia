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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import nsfw = require('@theia/core/shared/nsfw');
import path = require('path');
import { Disposable, Emitter, Event } from '@theia/core';
import { Deferred, timeout } from '@theia/core/lib/common/promise-util';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { promises as fsp } from 'fs';
import { IMinimatch, Minimatch } from 'minimatch';
import {
    DidFilesChangedParams, FileChangeType, FileSystemWatcherClient, FileSystemWatcherErrorParams, FileSystemWatcherService, WatcherLogger, WatchOptions
} from '../../common/filesystem-watcher-protocol';
import { FileChangeCollection } from '../file-change-collection';

export interface NsfwFileSystemWatcherServiceOptions {
    nsfwOptions?: nsfw.Options
    verbose?: boolean
    logger?: WatcherLogger
}

export class NsfwFileSystemWatcherService implements FileSystemWatcherService {

    protected client?: FileSystemWatcherClient;

    protected watcherId = 0;
    protected watchers = new Map<number, NsfwWatcher>();

    protected nsfwOptions: nsfw.Options;
    protected verbose: boolean;
    protected logger: WatcherLogger;

    constructor(options?: NsfwFileSystemWatcherServiceOptions) {
        this.nsfwOptions = options?.nsfwOptions ?? {};
        this.verbose = options?.verbose ?? false;
        this.logger = options?.logger ?? console;
    }

    setClient(client?: FileSystemWatcherClient): void {
        this.client = client;
    }

    async watchFileChanges(uri: string, options?: WatchOptions): Promise<[number, number]> {
        const watcherId = this.watcherId++;
        const watcher = this.createWatcher(watcherId, FileUri.fsPath(uri), options);
        watcher.whenDisposed.then(() => this.watchers.delete(watcherId));
        watcher.onDidFilesChanged(event => this.client?.onDidFilesChanged(event));
        watcher.onError(event => this.client?.onError(event));
        return [watcherId, watcherId];
    }

    async unwatchFileChanges(watcherId: number): Promise<void> {
        const watcher = this.watchers.get(watcherId);
        if (!watcher) {
            console.warn(`tried to de-allocate a disposed watcher: watcherId=${watcherId}`);
        } else {
            this.watchers.delete(watcherId);
            watcher.dispose();
        }
    }

    dispose(): void {
        this.client = undefined;
        this.watchers.forEach(watcher => watcher.dispose());
        this.watchers.clear();
    }

    protected createWatcher(watcherId: number, fsPath: string, options?: WatchOptions): NsfwWatcher {
        return new NsfwWatcher(watcherId, fsPath, {
            nsfwOptions: this.nsfwOptions,
            ignored: options?.ignored,
            verbose: this.verbose,
            logger: this.logger
        });
    }
}

/**
 * This is a flag value passed around upon disposal.
 */
export const WatcherDisposal = Symbol('WatcherDisposal');

export class NsfwWatcher implements Disposable {

    /**
     * This deferred only rejects with `WatcherDisposal` and never resolves.
     */
    protected deferredDisposalDeferred = new Deferred<never>();
    /**
     * When this field is set, it means the nsfw instance was successfully started.
     */
    protected nsfw?: nsfw.NSFW;
    protected disposed = false;
    protected ignored: IMinimatch[];
    protected verbose: boolean;
    protected logger: WatcherLogger;

    protected onDidFilesChangedEmitter = new Emitter<DidFilesChangedParams>();
    protected onErrorEmitter = new Emitter<FileSystemWatcherErrorParams>();

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
        readonly watcherId: number,
        readonly fsPath: string,
        options?: WatchOptions & NsfwFileSystemWatcherServiceOptions,
    ) {
        this.ignored = options?.ignored?.map(pattern => new Minimatch(pattern, { dot: true })) ?? [];
        this.verbose = options?.verbose ?? false;
        this.logger = options?.logger ?? console;
        this.whenStarted = this.start(fsPath, options?.nsfwOptions)
            .then(() => true, error => {
                if (error === WatcherDisposal) {
                    return false;
                }
                this.fireError();
                this.dispose();
                throw error;
            });
        this.debug('NEW');
    }

    get onDidFilesChanged(): Event<DidFilesChangedParams> {
        return this.onDidFilesChangedEmitter.event;
    }

    get onError(): Event<FileSystemWatcherErrorParams> {
        return this.onErrorEmitter.event;
    }

    dispose(): void {
        if (!this.disposed) {
            try {
                if (this.nsfw) {
                    this.stopNsfw(this.nsfw);
                    this.nsfw = undefined;
                }
            } finally {
                this.disposed = true;
                this.onErrorEmitter.dispose();
                this.onDidFilesChangedEmitter.dispose();
                this.deferredDisposalDeferred.reject(WatcherDisposal);
                this.debug('DISPOSED');
            }
        }
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
    protected async start(fsPath: string, options?: nsfw.Options): Promise<void> {
        while (await fsp.stat(this.fsPath).then(() => false, () => true)) {
            await timeout(500);
            this.assertNotDisposed();
        }
        this.assertNotDisposed();
        const watcher = await this.createNsfw(fsPath, options);
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

    protected async createNsfw(fsPath: string, options?: nsfw.Options): Promise<nsfw.NSFW> {
        fsPath = await fsp.realpath(fsPath);
        return nsfw(fsPath, events => this.handleNsfwEvents(events), {
            ...options,
            // The errorCallback is called whenever NSFW crashes *while* watching.
            // See https://github.com/atom/github/issues/342
            errorCallback: error => {
                console.error(`NSFW service error on "${fsPath}":`, error);
                this.fireError();
                this.dispose();
            },
        });
    }

    protected handleNsfwEvents(events: nsfw.FileChangeEvent[]): void {
        // Only process events if someone is listening.
        if (this.disposed) {
            return;
        }
        const fileChangeCollection = new FileChangeCollection();
        events.forEach(event => {
            if (event.action === nsfw.actions.RENAMED) {
                const oldPath = path.resolve(event.directory, event.oldFile);
                const newPath = path.resolve(event.newDirectory, event.newFile);
                this.pushFileChange(fileChangeCollection, FileChangeType.DELETED, oldPath);
                this.pushFileChange(fileChangeCollection, FileChangeType.ADDED, newPath);
            } else {
                const filePath = path.resolve(event.directory, event.file);
                if (event.action === nsfw.actions.CREATED) {
                    this.pushFileChange(fileChangeCollection, FileChangeType.ADDED, filePath);
                } else if (event.action === nsfw.actions.DELETED) {
                    this.pushFileChange(fileChangeCollection, FileChangeType.DELETED, filePath);
                } else if (event.action === nsfw.actions.MODIFIED) {
                    this.pushFileChange(fileChangeCollection, FileChangeType.UPDATED, filePath);
                }
            }
        });
        const changes = fileChangeCollection.values();
        // If all changes are part of the ignored files, the collection will be empty.
        if (changes.length > 0) {
            this.onDidFilesChangedEmitter.fire({ eventId: this.watcherId, changes });
        }
    }

    protected pushFileChange(changes: FileChangeCollection, type: FileChangeType, filePath: string): void {
        if (!this.isIgnored(filePath)) {
            const uri = FileUri.create(filePath).toString();
            changes.push({ type, uri });
        }
    }

    protected fireError(): void {
        this.onErrorEmitter.fire({ eventId: this.watcherId, uri: this.fsPath });
    }

    protected isIgnored(filePath: string): boolean {
        return this.ignored.length > 0 && this.ignored.some(m => m.match(filePath));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected info(prefix: string, ...params: any[]): void {
        this.logger.info(`${prefix} NsfwWatcher(${this.watcherId} at "${this.fsPath}"):`, ...params);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected debug(prefix: string, ...params: any[]): void {
        if (this.verbose) {
            this.info(prefix, ...params);
        }
    }
}
