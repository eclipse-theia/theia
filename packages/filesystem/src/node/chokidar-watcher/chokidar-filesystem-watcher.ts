/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { watch } from "chokidar";
import URI from "@theia/core/lib/common/uri";
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { FileUri } from "@theia/core/lib/node/file-uri";
import {
    FileChange,
    FileChangeType,
    FileSystemWatcherClient,
    FileSystemWatcherServer,
    WatchOptions
} from '../../common/filesystem-watcher-protocol';

// tslint:disable:no-console
// tslint:disable:no-any

export interface WatchError {
    readonly code: string;
    readonly filename: string;
}
export namespace WatchError {
    export function is(error: any): error is WatchError {
        return ('code' in error) && ('filename' in error) && error.code !== undefined && error.filename !== undefined;
    }
}

export class ChokidarFileSystemWatcherServer implements FileSystemWatcherServer {

    protected client: FileSystemWatcherClient | undefined;

    protected watcherSequence = 1;
    protected readonly watchers = new Map<number, Disposable>();

    protected readonly toDispose = new DisposableCollection();

    protected changes: FileChange[] = [];
    protected readonly fireDidFilesChangedTimeout = 50;
    protected readonly toDisposeOnFileChange = new DisposableCollection();

    /* Did we print the message about exhausted inotify watches yet?  */
    protected printedENOSPCError = false;

    constructor(protected readonly options: {
        verbose: boolean
    } = { verbose: false }) { }

    dispose(): void {
        this.toDispose.dispose();
    }

    watchFileChanges(uri: string, rawOptions?: WatchOptions): Promise<number> {
        const options: WatchOptions = {
            ignored: [],
            ...rawOptions
        };
        const watcherId = this.watcherSequence++;
        const paths = this.toPaths(uri);
        this.debug('Starting watching:', paths);
        return new Promise<number>(resolve => {
            if (options.ignored.length > 0) {
                this.debug('Files ignored for watching', options.ignored);
            }
            const watcher = watch(paths, {
                ignoreInitial: true,
                ignored: options.ignored
            });
            watcher.once('ready', () => {
                console.info('Started watching:', paths);
                resolve(watcherId);
            });

            watcher.on('error', error => {
                if (WatchError.is(error)) {
                    this.handleWatchError(error);
                } else {
                    console.error('Unknown file watch error:', error);
                }
            });

            watcher.on('add', path => this.pushAdded(watcherId, path));
            watcher.on('addDir', path => this.pushAdded(watcherId, path));
            watcher.on('change', path => this.pushUpdated(watcherId, path));
            watcher.on('unlink', path => this.pushDeleted(watcherId, path));
            watcher.on('unlinkDir', path => this.pushDeleted(watcherId, path));
            const disposable = Disposable.create(() => {
                this.watchers.delete(watcherId);
                this.debug('Stopping watching:', paths);
                watcher.close();
                console.info('Stopped watching.');
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

    /**
     * Given a watch error object, print a user-friendly error message that
     * explains what failed, and what can be done about it.
     *
     * @param error The error thrown by chokidar.
     */
    protected handleWatchError(error: WatchError): void {
        let msg: string;

        switch (error.code) {
            case 'ENOSPC':
                /* On Linux, exhausted inotify watch limit.  */
                if (this.printedENOSPCError) {
                    return;
                }

                this.printedENOSPCError = true;

                msg = "Theia has reached the inotify file limit.  See: \
https://github.com/theia-ide/theia/blob/master/doc/Developing.md#linux.  This \
message will appear only once.";
                break;

            case 'EPERM':
            case 'EACCES':
                msg = 'Insufficient permissions.';
                break;

            default:
                /* We don't specifically know about this error, just return the
                   code.  */
                msg = error.code;
                break;
        }

        console.error(`Error watching ${error.filename}: ${msg}`);
    }

    protected debug(...params: any[]): void {
        if (this.options.verbose) {
            console.log(...params);
        }
    }

}
