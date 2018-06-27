/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject, postConstruct } from "inversify";
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

    @inject(FileSystemWatcherServer)
    protected readonly server: FileSystemWatcherServer;

    @inject(FileSystemPreferences)
    protected readonly preferences: FileSystemPreferences;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.onFileChangedEmitter);

        this.toDispose.push(this.server);
        this.server.setClient({
            onDidFilesChanged: e => this.onDidFilesChanged(e)
        });

        this.toDispose.push(this.preferences.onPreferenceChanged(e => {
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
