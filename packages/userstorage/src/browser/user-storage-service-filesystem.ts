/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Disposable, DisposableCollection, ILogger, Emitter, Event } from '@theia/core/lib/common';
import { UserStorageChangeEvent, UserStorageService } from './user-storage-protocol';
import { injectable, inject } from 'inversify';
import { FileSystem } from '@theia/filesystem/lib/common';
import { FileSystemWatcherServer, DidFilesChangedParams } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import * as jsoncparser from 'jsonc-parser';
import URI from '@theia/core/lib/common/uri';
import { UserStorageUri } from './user-storage-uri';

@injectable()
export class UserStorageServiceFilesystem implements UserStorageService {

    protected readonly toDispose = new DisposableCollection();
    protected readonly onUserStorageChangedEmitter = new Emitter<UserStorageChangeEvent>();
    protected rootURI: URI;

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcherServer) protected readonly watcherServer: FileSystemWatcherServer,
        @inject(ILogger) protected readonly logger: ILogger

    ) {
        this.fileSystem.getCurrentUserHome().then(home => {
            this.rootURI = new URI(home.uri);

            watcherServer.setClient({
                onDidFilesChanged: p => this.onDidFilesChanged(p)
            });

            watcherServer.watchFileChanges(this.rootURI.toString()).then(id => {
                this.toDispose.push(Disposable.create(() =>
                    watcherServer.unwatchFileChanges(id))
                );
            });

            this.toDispose.push(watcherServer);
        });
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    onDidFilesChanged(params: DidFilesChangedParams): void {
        const uris: string[] = [];
        for (const change of params.changes) {
            uris.push(UserStorageUri.create(change.uri).toString());
        }
        this.onUserStorageChangedEmitter.fire({ uris });
    }

    readContents(uri: string) {
        const fsUri = UserStorageUri.toFsUri(this.rootURI, new URI(uri));

        return this.fileSystem.resolveContent(fsUri.toString()).then(({ stat, content }) => jsoncparser.stripComments(content));

    }

    saveContents(uri: string, content: string) {
        const fsUri = UserStorageUri.toFsUri(this.rootURI, new URI(uri));

        return this.fileSystem.getFileStat(fsUri.toString()).then(fileStat => {
            this.fileSystem.setContent(fileStat, content);
        });

    }

    get onUserStorageChanged(): Event<UserStorageChangeEvent> {
        return this.onUserStorageChangedEmitter.event;
    }
}
