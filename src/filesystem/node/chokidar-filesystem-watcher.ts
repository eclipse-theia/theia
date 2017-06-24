/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ChokidarWatcher as Watcher, watch } from "chokidar";
import { injectable, inject } from "inversify";
import URI from "../../application/common/uri";
import { Disposable, DisposableCollection, ILogger } from '../../application/common';
import { FileUri } from "../../application/node";
import {
    FileChange,
    FileChangeType,
    FileSystemWatcherClient,
    FileSystemWatcherServer
} from '../common/filesystem-watcher-protocol';

@injectable()
export class ChokidarFileSystemWatcherServer implements FileSystemWatcherServer {

    protected _watcher: Promise<Watcher> | undefined;
    protected client: FileSystemWatcherClient | undefined;

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

    watchFileChanges(uri: string): Promise<void> {
        const paths = this.toPaths(uri);
        this.logger.info('Starting watching:', paths)
        return this.doWatchFileChanges(paths).then(() =>
            this.logger.info('Started watching:', paths)
        );
    }

    protected doWatchFileChanges(paths: string | string[]): Promise<any> {
        if (this._watcher) {
            return this._watcher.then(watcher =>
                watcher.add(paths)
            );
        }
        this._watcher = new Promise<Watcher>(resolve => {
            const watcher = this.createWatcher(paths);
            watcher.once('ready', () =>
                resolve(watcher)
            );
        });
        this.toDispose.push(Disposable.create(() => {
            this._watcher = undefined;
        }));
        return this._watcher;
    }

    unwatchFileChanges(uri: string): Promise<void> {
        if (this._watcher) {
            return this._watcher.then(watcher => {
                const paths = this.toPaths(uri);
                this.logger.info('Stopping watching:', paths);
                watcher.unwatch(paths);
                this.logger.info('Stopped watching:', paths);
            });
        }
        return Promise.resolve();
    }

    setClient(client: FileSystemWatcherClient) {
        this.client = client;
    }

    protected createWatcher(paths: string | string[]): Watcher {
        const watcher = watch(paths, {
            ignoreInitial: true
        });
        watcher.on('error', error =>
            this.logger.error('Watching error:', error)
        );
        watcher.on('add', path => this.pushAdded(path));
        watcher.on('addDir', path => this.pushAdded(path));
        watcher.on('change', path => this.pushUpdated(path));
        watcher.on('unlink', path => this.pushDeleted(path));
        watcher.on('unlinkDir', path => this.pushDeleted(path));
        this.toDispose.push(Disposable.create(() => {
            watcher.close();
            this.logger.info('Stopped watching.');
        }));
        return watcher;
    }

    protected toPaths(raw: string): string | string[] {
        return FileUri.fsPath(new URI(raw));
    }

    protected pushAdded(path: string): void {
        this.pushFileChange(path, FileChangeType.ADDED);
    }

    protected pushUpdated(path: string): void {
        this.pushFileChange(path, FileChangeType.UPDATED);
    }

    protected pushDeleted(path: string): void {
        this.pushFileChange(path, FileChangeType.DELETED);
    }

    protected pushFileChange(path: string, type: FileChangeType): void {
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
        this.logger.debug(log =>
            log('Files changed:', event)
        )
    }

}