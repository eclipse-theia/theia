/********************************************************************************
 * Copyright (C) 2017-2018 TypeFox and others.
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

import * as fs from 'fs';
import * as nsfw from 'nsfw';
import * as paths from 'path';
import { IMinimatch, Minimatch } from 'minimatch';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { FileUri } from '@theia/core/lib/node/file-uri';
import {
    FileChangeType,
    FileSystemWatcherClient,
    FileSystemWatcherServer,
    WatchOptions
} from '../../common/filesystem-watcher-protocol';
import { FileChangeCollection } from '../file-change-collection';
import { setInterval, clearInterval } from 'timers';

const debounce = require('lodash.debounce');

// tslint:disable:no-any

export interface WatcherOptions {
    ignored: IMinimatch[]
}

export class NsfwFileSystemWatcherServer implements FileSystemWatcherServer {

    protected client: FileSystemWatcherClient | undefined;

    protected watcherSequence = 1;
    protected readonly watchers = new Map<number, Disposable>();
    protected readonly watcherOptions = new Map<number, WatcherOptions>();

    protected readonly toDispose = new DisposableCollection(
        Disposable.create(() => this.setClient(undefined))
    );

    protected changes = new FileChangeCollection();

    protected readonly options: {
        verbose: boolean
        info: (message: string, ...args: any[]) => void
        error: (message: string, ...args: any[]) => void
    };

    constructor(options?: {
        verbose?: boolean,
        info?: (message: string, ...args: any[]) => void
        error?: (message: string, ...args: any[]) => void
    }) {
        this.options = {
            verbose: false,
            info: (message, ...args) => console.info(message, ...args),
            error: (message, ...args) => console.error(message, ...args),
            ...options
        };
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async watchFileChanges(uri: string, options?: WatchOptions): Promise<number> {
        const watcherId = this.watcherSequence++;
        const basePath = FileUri.fsPath(uri);
        this.debug('Starting watching:', basePath);
        const toDisposeWatcher = new DisposableCollection();
        this.watchers.set(watcherId, toDisposeWatcher);
        toDisposeWatcher.push(Disposable.create(() => this.watchers.delete(watcherId)));
        if (fs.existsSync(basePath)) {
            this.start(watcherId, basePath, options, toDisposeWatcher);
        } else {
            const toClearTimer = new DisposableCollection();
            const timer = setInterval(() => {
                if (fs.existsSync(basePath)) {
                    toClearTimer.dispose();
                    this.pushAdded(watcherId, basePath);
                    this.start(watcherId, basePath, options, toDisposeWatcher);
                }
            }, 500);
            toClearTimer.push(Disposable.create(() => clearInterval(timer)));
            toDisposeWatcher.push(toClearTimer);
        }
        this.toDispose.push(toDisposeWatcher);
        return watcherId;
    }

    protected async start(watcherId: number, basePath: string, rawOptions: WatchOptions | undefined, toDisposeWatcher: DisposableCollection): Promise<void> {
        const options: WatchOptions = {
            ignored: [],
            ...rawOptions
        };
        if (options.ignored.length > 0) {
            this.debug('Files ignored for watching', options.ignored);
        }

        let watcher: nsfw.NSFW | undefined = await nsfw(fs.realpathSync(basePath), (events: nsfw.ChangeEvent[]) => {
            for (const event of events) {
                if (event.action === nsfw.actions.CREATED) {
                    this.pushAdded(watcherId, this.resolvePath(event.directory, event.file!));
                }
                if (event.action === nsfw.actions.DELETED) {
                    this.pushDeleted(watcherId, this.resolvePath(event.directory, event.file!));
                }
                if (event.action === nsfw.actions.MODIFIED) {
                    this.pushUpdated(watcherId, this.resolvePath(event.directory, event.file!));
                }
                if (event.action === nsfw.actions.RENAMED) {
                    this.pushDeleted(watcherId, this.resolvePath(event.directory, event.oldFile!));
                    this.pushAdded(watcherId, this.resolvePath(event.directory, event.newFile!));
                }
            }
        }, {
                errorCallback: error => {
                    // see https://github.com/atom/github/issues/342
                    console.warn(`Failed to watch "${basePath}":`, error);
                    this.unwatchFileChanges(watcherId);
                }
            });
        await watcher.start();
        this.options.info('Started watching:', basePath);
        if (toDisposeWatcher.disposed) {
            this.debug('Stopping watching:', basePath);
            await watcher.stop();
            // remove a reference to nsfw otherwise GC cannot collect it
            watcher = undefined;
            this.options.info('Stopped watching:', basePath);
            return;
        }
        toDisposeWatcher.push(Disposable.create(async () => {
            this.watcherOptions.delete(watcherId);
            if (watcher) {
                this.debug('Stopping watching:', basePath);
                await watcher.stop();
                // remove a reference to nsfw otherwise GC cannot collect it
                watcher = undefined;
                this.options.info('Stopped watching:', basePath);
            }
        }));
        this.watcherOptions.set(watcherId, {
            ignored: options.ignored.map(pattern => new Minimatch(pattern))
        });
    }

    unwatchFileChanges(watcherId: number): Promise<void> {
        const disposable = this.watchers.get(watcherId);
        if (disposable) {
            this.watchers.delete(watcherId);
            disposable.dispose();
        }
        return Promise.resolve();
    }

    setClient(client: FileSystemWatcherClient | undefined) {
        if (client && this.toDispose.disposed) {
            return;
        }
        this.client = client;
    }

    protected pushAdded(watcherId: number, path: string): void {
        this.debug('Added:', path);
        this.pushFileChange(watcherId, path, FileChangeType.ADDED);
    }

    protected pushUpdated(watcherId: number, path: string): void {
        this.debug('Updated:', path);
        this.pushFileChange(watcherId, path, FileChangeType.UPDATED);
    }

    protected pushDeleted(watcherId: number, path: string): void {
        this.debug('Deleted:', path);
        this.pushFileChange(watcherId, path, FileChangeType.DELETED);
    }

    protected pushFileChange(watcherId: number, path: string, type: FileChangeType): void {
        if (this.isIgnored(watcherId, path)) {
            return;
        }

        const uri = FileUri.create(path).toString();
        this.changes.push({ uri, type });

        this.fireDidFilesChanged();
    }

    protected resolvePath(directory: string, file: string): string {
        const path = paths.join(directory, file);
        try {
            return fs.realpathSync(path);
        } catch {
            try {
                // file does not exist try to resolve directory
                return paths.join(fs.realpathSync(directory), file);
            } catch {
                // directory does not exist fall back to symlink
                return path;
            }
        }
    }

    /**
     * Fires file changes to clients.
     * It is debounced in the case if the filesystem is spamming to avoid overwhelming clients with events.
     */
    protected readonly fireDidFilesChanged: () => void = debounce(() => this.doFireDidFilesChanged(), 50);
    protected doFireDidFilesChanged(): void {
        const changes = this.changes.values();
        this.changes = new FileChangeCollection();
        const event = { changes };
        if (this.client) {
            this.client.onDidFilesChanged(event);
        }
    }

    protected isIgnored(watcherId: number, path: string): boolean {
        const options = this.watcherOptions.get(watcherId);
        return !!options && options.ignored.length > 0 && options.ignored.some(m => m.match(path));
    }

    protected debug(message: string, ...params: any[]): void {
        if (this.options.verbose) {
            this.options.info(message, ...params);
        }
    }

}
