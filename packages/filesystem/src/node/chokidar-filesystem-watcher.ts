/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { watch } from "chokidar";
import { injectable, inject } from "inversify";
import URI from "@theia/core/lib/common/uri";
import { Disposable, DisposableCollection, ILogger } from '@theia/core/lib/common';
import { FileUri } from "@theia/core/lib/node";
import {
    FileChange,
    FileChangeType,
    FileSystemWatcherClient,
    FileSystemWatcherServer,
    WatchOptions
} from '../common/filesystem-watcher-protocol';

@injectable()
export class ChokidarFileSystemWatcherServer implements FileSystemWatcherServer {

    protected client: FileSystemWatcherClient | undefined;

    protected watcherSequence = 1;
    protected readonly watchers = new Map<number, Disposable>();

    protected readonly toDispose = new DisposableCollection();

    protected changes: FileChange[] = [];
    protected readonly fireDidFilesChangedTimeout = 50;
    protected readonly toDisposeOnFileChange = new DisposableCollection();

    constructor(
        @inject(ILogger) protected readonly logger: ILogger
    ) { }

    dispose(): void {
        this.toDispose.dispose();
    }

    watchFileChanges(uri: string, options: WatchOptions = { ignored: [] }): Promise<number> {
        const watcherId = this.watcherSequence++;
        const paths = this.toPaths(uri);
        this.logger.info(`Starting watching:`, paths);
        return new Promise<number>(resolve => {
            if (options.ignored.length > 0) {
                this.logger.debug(log =>
                    log('Files ignored for watching', options.ignored)
                );
            }
            const watcher = watch(paths, {
                ignoreInitial: true,
                ignored: options.ignored
            });
            watcher.once('ready', () => {
                this.logger.info(`Started watching:`, paths);
                resolve(watcherId);
            });
            watcher.on('error', error =>
                this.logger.error(`Watching error:`, error)
            );
            watcher.on('add', path => this.pushAdded(watcherId, path));
            watcher.on('addDir', path => this.pushAdded(watcherId, path));
            watcher.on('change', path => this.pushUpdated(watcherId, path));
            watcher.on('unlink', path => this.pushDeleted(watcherId, path));
            watcher.on('unlinkDir', path => this.pushDeleted(watcherId, path));
            const disposable = Disposable.create(() => {
                this.watchers.delete(watcherId);
                this.logger.info(`Stopping watching:`, paths);
                watcher.close();
                this.logger.info(`Stopped watching.`);
            });
            this.watchers.set(watcherId, disposable);
            this.toDispose.push(disposable);
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

    setClient(client: FileSystemWatcherClient) {
        this.client = client;
    }

    protected toPaths(raw: string): string | string[] {
        return FileUri.fsPath(new URI(raw));
    }

    protected pushAdded(watcherId: number, path: string): void {
        this.logger.debug(log =>
            log(`Added:`, path)
        );
        this.pushFileChange(watcherId, path, FileChangeType.ADDED);
    }

    protected pushUpdated(watcherId: number, path: string): void {
        this.logger.debug(log =>
            log(`Updated:`, path)
        );
        this.pushFileChange(watcherId, path, FileChangeType.UPDATED);
    }

    protected pushDeleted(watcherId: number, path: string): void {
        this.logger.debug(log =>
            log(`Deleted:`, path)
        );
        this.pushFileChange(watcherId, path, FileChangeType.DELETED);
    }

    protected pushFileChange(watcherId: number, path: string, type: FileChangeType): void {
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

}