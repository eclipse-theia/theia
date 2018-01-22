/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Disposable, DisposableCollection, Emitter, Event } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { DidFilesChangedParams, FileChangeType, FileSystemWatcherServer, WatchOptions } from '../common/filesystem-watcher-protocol';
import { FileSystemPreferences } from "./filesystem-preferences";

export {
    FileChangeType
};

export interface FileChange {
    uri: URI;
    type: FileChangeType;
}

@injectable()
export class FileSystemWatcher implements Disposable {

    protected readonly toDispose = new DisposableCollection();
    protected readonly toRestartAll = new DisposableCollection();
    protected readonly onFileChangedEmitter = new Emitter<FileChange[]>();

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
        this.onFileChangedEmitter.fire(changes);
    }

    /**
     * Start file watching under the given uri.
     *
     * Resolve when watching is started.
     * Return a disposable to stop file watching under the given uri.
     */
    watchFileChanges(uri: URI): Promise<Disposable> {
        return this.createWatchOptions()
            .then(options =>
                this.server.watchFileChanges(uri.toString(), options)
            )
            .then(watcher => {
                const toDispose = new DisposableCollection();
                const toStop = Disposable.create(() =>
                    this.server.unwatchFileChanges(watcher)
                );
                const toRestart = toDispose.push(toStop);
                this.toRestartAll.push(Disposable.create(() => {
                    toRestart.dispose();
                    toStop.dispose();
                    this.watchFileChanges(uri).then(disposable =>
                        toDispose.push(disposable)
                    );
                }));
                return toDispose;
            });
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
