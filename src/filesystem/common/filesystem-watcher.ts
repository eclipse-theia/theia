/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Emitter, Event, Disposable, DisposableCollection } from '../../application/common';
import URI from "../../application/common/uri";
import { FileChangeType, DidFilesChangedParams, FileSystemWatcherClient, FileSystemWatcherServer } from "./filesystem-watcher-protocol";

export {
    FileChangeType
}

export interface FileChange {
    uri: URI;
    type: FileChangeType;
}

@injectable()
export class FileSystemWatcherClientListener implements FileSystemWatcherClient {

    protected readonly onFileChangedEmitter = new Emitter<FileChange[]>();

    dispose(): void {
        this.onFileChangedEmitter.dispose();
    }

    get onFilesChanged(): Event<FileChange[]> {
        return this.onFileChangedEmitter.event;
    }

    onDidFilesChanged(event: DidFilesChangedParams): void {
        const changes = event.changes.map(change => <FileChange>{
            uri: new URI(change.uri),
            type: change.type
        });
        this.onFileChangedEmitter.fire(changes);
    }

}

@injectable()
export class FileSystemWatcher implements Disposable {

    protected readonly toDispose = new DisposableCollection();

    constructor(
        @inject(FileSystemWatcherServer) protected readonly server: FileSystemWatcherServer,
        @inject(FileSystemWatcherClientListener) protected readonly listener: FileSystemWatcherClientListener
    ) {
        this.toDispose.push(server);
        this.toDispose.push(listener);
    }

    /**
     * Stop watching.
     */
    dispose(): void {
        this.toDispose.dispose();
    }

    /**
     * Start file watching under the given uri.
     *
     * Resolve when watching is started.
     * Return a disposable to stop file watching under the given uri.
     */
    watchFileChanges(uri: URI): Promise<Disposable> {
        const raw = uri.toString();
        return this.server.watchFileChanges(raw).then(() => {
            const disposable = Disposable.create(() =>
                this.server.unwatchFileChanges(raw)
            );
            this.toDispose.push(disposable);
            return disposable;
        });
    }

    /**
      * Emit when files under watched uris are changed.
      */
    get onFilesChanged(): Event<FileChange[]> {
        return this.listener.onFilesChanged;
    }
}

