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

import { injectable, inject, postConstruct } from 'inversify';
import { Disposable, DisposableCollection, Emitter, Event } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { FileSystem, FileShouldOverwrite } from '../common/filesystem';
import { DidFilesChangedParams, FileChangeType, FileSystemWatcherServer, WatchOptions } from '../common/filesystem-watcher-protocol';
import { FileSystemPreferences } from './filesystem-preferences';

export {
    FileChangeType
};

export interface FileChange {
    uri: URI;
    type: FileChangeType;
}
export namespace FileChange {
    export function isUpdated(change: FileChange, uri: URI): boolean {
        return change.type === FileChangeType.UPDATED && uri.toString() === change.uri.toString();
    }
    export function isAdded(change: FileChange, uri: URI): boolean {
        return change.type === FileChangeType.ADDED && uri.toString() === change.uri.toString();
    }
    export function isDeleted(change: FileChange, uri: URI): boolean {
        return change.type === FileChangeType.DELETED && change.uri.isEqualOrParent(uri);
    }
    export function isAffected(change: FileChange, uri: URI): boolean {
        return isDeleted(change, uri) || uri.toString() === change.uri.toString();
    }
    export function isChanged(change: FileChange, uri: URI): boolean {
        return !isDeleted(change, uri) && uri.toString() === change.uri.toString();
    }
}

export type FileChangeEvent = FileChange[];
export namespace FileChangeEvent {
    export function isUpdated(event: FileChangeEvent, uri: URI): boolean {
        return event.some(change => FileChange.isUpdated(change, uri));
    }
    export function isAdded(event: FileChangeEvent, uri: URI): boolean {
        return event.some(change => FileChange.isAdded(change, uri));
    }
    export function isDeleted(event: FileChangeEvent, uri: URI): boolean {
        return event.some(change => FileChange.isDeleted(change, uri));
    }
    export function isAffected(event: FileChangeEvent, uri: URI): boolean {
        return event.some(change => FileChange.isAffected(change, uri));
    }
    export function isChanged(event: FileChangeEvent, uri: URI): boolean {
        return !isDeleted(event, uri) && event.some(change => FileChange.isChanged(change, uri));
    }
}

export interface FileMoveEvent {
    sourceUri: URI
    targetUri: URI
}
export namespace FileMoveEvent {
    export function isRename({ sourceUri, targetUri }: FileMoveEvent): boolean {
        return sourceUri.parent.toString() === targetUri.parent.toString();
    }
}

export interface FileWillMoveEvent {
    sourceUri: URI
    targetUri: URI
}

@injectable()
export class FileSystemWatcher implements Disposable {

    protected readonly toDispose = new DisposableCollection();
    protected readonly toRestartAll = new DisposableCollection();

    protected readonly onFileChangedEmitter = new Emitter<FileChangeEvent>();
    readonly onFilesChanged: Event<FileChangeEvent> = this.onFileChangedEmitter.event;

    protected readonly onDidMoveEmitter = new Emitter<FileMoveEvent>();
    readonly onDidMove: Event<FileMoveEvent> = this.onDidMoveEmitter.event;

    protected readonly onWillMoveEmitter = new Emitter<FileWillMoveEvent>();
    readonly onWillMove: Event<FileWillMoveEvent> = this.onWillMoveEmitter.event;

    @inject(FileSystemWatcherServer)
    protected readonly server: FileSystemWatcherServer;

    @inject(FileSystemPreferences)
    protected readonly preferences: FileSystemPreferences;

    @inject(FileSystem)
    protected readonly filesystem: FileSystem;

    // This is injected so we can avoid including UI stuff and make this class
    // unit-testable.
    @inject(FileShouldOverwrite)
    protected readonly shouldOverwrite: FileShouldOverwrite;

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.onFileChangedEmitter);
        this.toDispose.push(this.onDidMoveEmitter);

        this.toDispose.push(this.server);
        this.server.setClient({
            onDidFilesChanged: e => this.onDidFilesChanged(e)
        });

        this.toDispose.push(this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'files.watcherExclude') {
                this.toRestartAll.dispose();
            }
        }));

        this.filesystem.setClient({
            shouldOverwrite: this.shouldOverwrite.bind(this),
            onDidMove: this.fireDidMove.bind(this),
            onWillMove: this.fireWillMove.bind(this)
        });
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
        return this.createWatchOptions(uri.toString())
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

    protected createWatchOptions(uri: string): Promise<WatchOptions> {
        return this.getIgnored(uri).then(ignored => ({
            // always ignore temporary upload files
            ignored: ignored.concat('**/theia_upload_*')
        }));
    }

    protected async getIgnored(uri: string): Promise<string[]> {
        const patterns = this.preferences.get('files.watcherExclude', undefined, uri);
        return Object.keys(patterns).filter(pattern => patterns[pattern]);
    }

    protected fireDidMove(sourceUri: string, targetUri: string): void {
        this.onDidMoveEmitter.fire({
            sourceUri: new URI(sourceUri),
            targetUri: new URI(targetUri)
        });
    }

    protected fireWillMove(sourceUri: string, targetUri: string): void {
        this.onWillMoveEmitter.fire({
            sourceUri: new URI(sourceUri),
            targetUri: new URI(targetUri)
        });
    }

}
