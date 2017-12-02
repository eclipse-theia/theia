/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from "fs";
import * as nsfw from "nsfw";
import * as paths from "path";
import { IMinimatch, Minimatch } from "minimatch";
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { FileUri } from "@theia/core/lib/node/file-uri";
import {
    FileChange,
    FileChangeType,
    FileSystemWatcherClient,
    FileSystemWatcherServer,
    WatchOptions
} from '../../common/filesystem-watcher-protocol';
import { setInterval, clearInterval } from "timers";

// tslint:disable:no-any

export interface WatcherOptions {
    ignored: IMinimatch[]
}

export class NsfwFileSystemWatcherServer implements FileSystemWatcherServer {

    protected client: FileSystemWatcherClient | undefined;

    protected watcherSequence = 1;
    protected readonly watchers = new Map<number, Disposable>();
    protected readonly watcherOptions = new Map<number, WatcherOptions>();

    protected readonly toDispose = new DisposableCollection();

    protected changes: FileChange[] = [];
    protected readonly fireDidFilesChangedTimeout = 50;
    protected readonly toDisposeOnFileChange = new DisposableCollection();

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
        if (fs.existsSync(basePath)) {
            await this.start(watcherId, basePath, options);
        } else {
            const disposable = new DisposableCollection();
            const timer = setInterval(() => {
                if (fs.existsSync(basePath)) {
                    disposable.dispose();
                    this.pushAdded(watcherId, basePath);
                    this.start(watcherId, basePath, options);
                }
            }, 500);
            disposable.push(Disposable.create(() => {
                this.watchers.delete(watcherId);
                clearInterval(timer);
            }));
            this.toDispose.push(disposable);
            return watcherId;
        }
        return watcherId;
    }

    protected async start(watcherId: number, basePath: string, rawOptions?: WatchOptions): Promise<void> {
        const options: WatchOptions = {
            ignored: [],
            ...rawOptions
        };
        if (options.ignored.length > 0) {
            this.debug('Files ignored for watching', options.ignored);
        }
        const watcher = await nsfw(fs.realpathSync(basePath), events => {
            for (const event of events) {
                if (event.action === nsfw.actions.CREATED) {
                    this.pushAdded(watcherId, paths.join(event.directory, event.file!));
                }
                if (event.action === nsfw.actions.DELETED) {
                    this.pushDeleted(watcherId, paths.join(event.directory, event.file!));
                }
                if (event.action === nsfw.actions.MODIFIED) {
                    this.pushUpdated(watcherId, paths.join(event.directory, event.file!));
                }
                if (event.action === nsfw.actions.RENAMED) {
                    this.pushDeleted(watcherId, paths.join(event.directory, event.oldFile!));
                    this.pushAdded(watcherId, paths.join(event.directory, event.newFile!));
                }
            }
        });
        await watcher.start();
        this.options.info('Started watching:', basePath);
        const disposable = Disposable.create(() => {
            this.watcherOptions.delete(watcherId);
            this.watchers.delete(watcherId);
            this.debug('Stopping watching:', basePath);
            watcher.stop();
            this.options.info('Stopped watching.');
        });
        this.watcherOptions.set(watcherId, {
            ignored: options.ignored.map(pattern => new Minimatch(pattern))
        });
        this.watchers.set(watcherId, disposable);
        this.toDispose.push(disposable);
    }

    unwatchFileChanges(watcherId: number): Promise<void> {
        const disposable = this.watchers.get(watcherId);
        if (disposable) {
            this.watchers.delete(watcherId);
            disposable.dispose();
        }
        return Promise.resolve();
    }

    setClient(client: FileSystemWatcherClient) {
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

        this.toDisposeOnFileChange.dispose();
        const timer = setTimeout(() => this.fireDidFilesChanged(), this.fireDidFilesChangedTimeout);
        this.toDisposeOnFileChange.push(Disposable.create(() => clearTimeout(timer)));
    }

    protected fireDidFilesChanged(): void {
        const changes = this.changes;
        this.changes = [];
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
