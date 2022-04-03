// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
import { promises as fs } from 'fs';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { wait } from '@theia/core/lib/common/promise-util';
import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { DidFilesChangedParams, FileChangeType, FileSystemWatcherErrorParams, FileSystemWatcherOptions, FileSystemWatcherServer, WatchOptions } from '../common';
import { FileChangeCollection } from './file-change-collection';
import { FileUri } from '@theia/core/lib/node';

@injectable()
export class NsfwFileSystemWatcherServer implements FileSystemWatcherServer {

    protected onDidFilesChangedEmitter = new Emitter<DidFilesChangedParams & { watcherId: number; }>();
    protected onErrorEmitter = new Emitter<FileSystemWatcherErrorParams & { watcherId: number; }>();

    protected idSequence = 0;
    protected watchers = new Map<number, NsfwWatcher>();

    protected verbose: boolean;
    protected eventDebounceMs: number;

    constructor(
        @inject(FileSystemWatcherOptions) @optional() options?: FileSystemWatcherOptions
    ) {
        this.verbose = options?.verbose ?? false;
        this.eventDebounceMs = options?.eventDebounceMs ?? 200;
    }

    get onDidFilesChanged(): Event<DidFilesChangedParams & { watcherId: number; }> {
        return this.onDidFilesChangedEmitter.event;
    }

    get onError(): Event<FileSystemWatcherErrorParams & { watcherId: number; }> {
        return this.onErrorEmitter.event;
    }

    async watchFileChanges(uri: string, options?: WatchOptions): Promise<number> {
        const id = this.getUniqueWatcherId();
        const watcher = this.createWatcher(id, FileUri.fsPath(uri), options);
        watcher.onDidFilesChanged(event => this.onDidFilesChangedEmitter.fire({ ...event, watcherId: id }));
        watcher.onError(event => this.onErrorEmitter.fire({ ...event, watcherId: id }));
        this.watchers.set(id, watcher);
        return id;
    }

    async unwatchFileChanges(watcherId: number): Promise<void> {
        const watcher = this.watchers.get(watcherId);
        if (!watcher) {
            throw new Error(`no watcher for id=${watcherId}`);
        }
        watcher.stop();
    }

    protected getUniqueWatcherId(): number {
        return this.idSequence++;
    }

    protected createWatcher(id: number, uri: string, options?: WatchOptions): NsfwWatcher {
        return new NsfwWatcher(id, uri, options?.ignored);
    }
}

export class NsfwWatcher {

    protected stopRequested = false;
    protected watcherPromise: Promise<nsfw.NSFW | undefined>;
    protected eventProcessingQueue = Promise.resolve();

    protected disposables = new DisposableCollection();
    protected onDidFilesChangedEmitter = this.disposables.pushThru(new Emitter<DidFilesChangedParams>());
    protected onErrorEmitter = this.disposables.pushThru(new Emitter<FileSystemWatcherErrorParams>());

    constructor(
        readonly id: number,
        readonly filePath: string,
        readonly ignored: string[] = [],
    ) {
        this.ignored = ignored;
        this.watcherPromise = this.start().catch(error => {
            console.error(`[watcherId=${id}] start error:`, error);
            return undefined;
        });
    }

    get onDidFilesChanged(): Event<DidFilesChangedParams> {
        return this.onDidFilesChangedEmitter.event;
    }

    get onError(): Event<FileSystemWatcherErrorParams> {
        return this.onErrorEmitter.event;
    }

    async stop(): Promise<void> {
        this.stopRequested = true;
        this.disposables.dispose();
        await this.watcherPromise.then(watcher => watcher?.stop());
    }

    protected async start(): Promise<nsfw.NSFW | undefined> {
        while (!this.stopRequested && !await this.fileExists(this.filePath)) {
            await wait(500);
        }
        if (this.stopRequested) {
            return;
        }
        const watcher = await nsfw(this.filePath, events => this.processEvents(events), {
            errorCallback: error => this.onErrorEmitter.fire(error)
        });
        if (this.stopRequested) {
            return;
        }
        await watcher.start();
        return watcher;
    }

    protected processEvents(events: nsfw.FileChangeEvent[]): void {
        this.eventProcessingQueue = this.eventProcessingQueue.then(async () => {
            const fileChangeCollection = new FileChangeCollection();
            await Promise.all(events.map(async event => {
                if (event.action === nsfw.actions.RENAMED) {
                    const [oldPath, newPath] = await Promise.all([
                        this.resolveEventPath(event.directory, event.oldFile!),
                        this.resolveEventPath(event.newDirectory || event.directory, event.newFile!),
                    ]);
                    this.pushFileChange(fileChangeCollection, FileChangeType.DELETED, oldPath);
                    this.pushFileChange(fileChangeCollection, FileChangeType.ADDED, newPath);
                } else {
                    const resolved = await this.resolveEventPath(event.directory, event.file!);
                    if (event.action === nsfw.actions.CREATED) {
                        this.pushFileChange(fileChangeCollection, FileChangeType.ADDED, resolved);
                    } else if (event.action === nsfw.actions.DELETED) {
                        this.pushFileChange(fileChangeCollection, FileChangeType.DELETED, resolved);
                    } else if (event.action === nsfw.actions.MODIFIED) {
                        this.pushFileChange(fileChangeCollection, FileChangeType.UPDATED, resolved);
                    }
                }
            }));
            const changes = fileChangeCollection.values();
            // If all changes are part of the ignored files, the collection will be empty.
            if (changes.length > 0) {
                this.onDidFilesChangedEmitter.fire({ changes });
            }
        });
    }

    protected async resolveEventPath(directory: string, file: string): Promise<string> {
        const resolvedPath = path.join(directory, file);
        try {
            return await fs.realpath(resolvedPath);
        } catch {
            try {
                // file does not exist try to resolve directory
                return path.join(await fs.realpath(directory), file);
            } catch {
                // directory does not exist fall back to symlink
                return resolvedPath;
            }
        }
    }

    protected pushFileChange(changes: FileChangeCollection, type: FileChangeType, filePath: string): void {
        if (!this.isIgnored(filePath)) {
            const uri = FileUri.create(filePath).toString();
            changes.push({ type, uri });
        }
    }

    protected isIgnored(filePath: string): boolean {
        return this.ignored.length > 0
            && this.ignored.some(m => m.match(filePath));
    }

    protected fileExists(filePath: string): Promise<boolean> {
        return fs.stat(filePath).then(() => true, () => false);
    }
}
