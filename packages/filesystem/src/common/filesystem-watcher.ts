/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Disposable, DisposableCollection, Emitter, Event } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { DidFilesChangedParams, FileChangeType, FileSystemWatcherServer, WatchOptions } from './filesystem-watcher-protocol';
import { FileSystemPreferences } from "./filesystem-preferences";

export {
    FileChangeType
};

export interface FileChange {
    uri: URI;
    type: FileChangeType;
}

export type WatchCallback = (changes: FileChange[]) => void;

@injectable()
export class FileSystemWatcher implements Disposable {

    protected readonly toDispose = new DisposableCollection();
    protected readonly toRestartAll = new DisposableCollection();
    protected readonly onFileChangedEmitter = new Emitter<FileChange[]>();
    protected readonly callbacks = new Map<number, WatchCallback>();

    constructor(
        @inject(FileSystemWatcherServer) protected readonly server: FileSystemWatcherServer,
        @inject(FileSystemPreferences) protected readonly preferences: FileSystemPreferences
    ) {
        this.toDispose.push(this.onFileChangedEmitter);

        this.toDispose.push(server);
        server.setClient({
            onDidFilesChanged: e => this.onDidFilesChanged(e)
        });

        this.toDispose.push(preferences);
        this.toDispose.push(preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'files.watcherExclude') {
                this.toRestartAll.dispose();
            }
        }));
    }

    /**
     * Stop watching.
     */
    dispose(): void {
        this.toDispose.dispose();
    }

    protected onDidFilesChanged(event: DidFilesChangedParams): void {
        const changes = event.changes.map(change => <FileChange>{
            uri: new URI(change.uri),
            type: change.type
        });
        const callback = this.callbacks.get(event.watcher);
        if (callback) {
            callback(changes);
        } else {
            this.onFileChangedEmitter.fire(changes);
        }
    }

    /**
     * Start file watching under the given uri.
     *
     * An optional callback can be provided if a client wants to watch exclusively.
     *
     * Resolve when watching is started.
     * Return a disposable to stop file watching under the given uri.
     */
    async watchFileChanges(uri: URI, callback?: WatchCallback): Promise<Disposable> {
        const options = await this.createWatchOptions();
        const watcher = await this.server.watchFileChanges(uri.toString(), options);
        if (callback) {
            this.callbacks.set(watcher, callback);
        }
        const toDispose = new DisposableCollection();
        const toStop = Disposable.create(() => {
            this.callbacks.delete(watcher);
            this.server.unwatchFileChanges(watcher);
        });
        const toRestart = toDispose.push(toStop);
        this.toRestartAll.push(Disposable.create(async () => {
            toRestart.dispose();
            toStop.dispose();
            toDispose.push(await this.watchFileChanges(uri, callback));
        }));
        return toDispose;
    }

    /**
     * Emit when files under watched uris are changed.
     */
    get onFilesChanged(): Event<FileChange[]> {
        return this.onFileChangedEmitter.event;
    }

    protected createWatchOptions(): Promise<WatchOptions> {
        return this.getIgnored().then(ignored => ({
            ignored
        }));
    }

    protected getIgnored(): Promise<string[]> {
        const patterns = this.preferences['files.watcherExclude'];
        return Promise.resolve(Object.keys(patterns).filter(pattern => patterns[pattern]));
    }
}
