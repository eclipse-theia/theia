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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { DisposableCollection, Emitter, Event } from '@theia/core';
import { DidFilesChangedParams, FileSystemWatcher, FileSystemWatcherErrorParams, FileSystemWatcherService, FileSystemWatcherServer, WatchOptions } from '../common';

@injectable()
export class NsfwFileSystemWatcherService implements FileSystemWatcherService {

    onError: Event<FileSystemWatcherErrorParams>;

    protected watchers = new Map<number, NsfwFileSystemWatcher>();

    @inject(FileSystemWatcherServer)
    protected watcherServer: FileSystemWatcherServer;

    @postConstruct()
    protected postConstruct(): void {
        this.watcherServer.onDidFilesChanged(event => this.handleDidFilesChangedEvent(event));
        this.watcherServer.onError(event => this.handleErrorEvent(event));
        this.onError = Event.map(this.watcherServer.onError, ({ uri }) => ({ uri }));
    }

    watchFileChanges(uri: string, options?: WatchOptions): FileSystemWatcher {
        const watcherId = this.watcherServer.watchFileChanges(uri, options);
        const watcher = new NsfwFileSystemWatcher(() => watcherId.then(id => this.unwatchFileChanges(id)));
        watcherId.then(id => this.watchers.set(id, watcher));
        return watcher;
    }

    protected unwatchFileChanges(id: number): void {
        this.watcherServer.unwatchFileChanges(id);
    }

    protected handleDidFilesChangedEvent(event: DidFilesChangedParams & { watcherId: number }): void {
        const { watcherId, changes } = event;
        this.watchers.get(watcherId)?.onDidFilesChangedEmitter.fire({ changes });
    }

    protected handleErrorEvent(event: FileSystemWatcherErrorParams & { watcherId: number }): void {
        const { watcherId, uri } = event;
        this.watchers.get(watcherId)?.onErrorEmitter.fire({ uri });
    }
}

export class NsfwFileSystemWatcher implements FileSystemWatcher {

    protected disposables = new DisposableCollection();

    onDidFilesChangedEmitter = this.disposables.pushThru(new Emitter<DidFilesChangedParams>());
    onErrorEmitter = this.disposables.pushThru(new Emitter<FileSystemWatcherErrorParams>());

    constructor(
        protected disposeCallback: () => void
    ) { }

    get onDidFilesChanged(): Event<DidFilesChangedParams> {
        return this.onDidFilesChangedEmitter.event;
    }

    get onError(): Event<FileSystemWatcherErrorParams> {
        return this.onErrorEmitter.event;
    }

    dispose(): void {
        this.disposables.dispose();
        this.disposeCallback();
    }
}
