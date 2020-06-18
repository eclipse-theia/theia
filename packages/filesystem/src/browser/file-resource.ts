/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { TextDocumentContentChangeEvent } from 'vscode-languageserver-protocol';
import { Resource, ResourceVersion, ResourceResolver, ResourceError, ResourceSaveOptions } from '@theia/core/lib/common/resource';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { Emitter, Event } from '@theia/core/lib/common/event';
import URI from '@theia/core/lib/common/uri';
import { FileSystem, FileStat, FileSystemError } from '../common/filesystem';
import { FileSystemWatcher, FileChangeEvent } from './filesystem-watcher';

export interface FileResourceVersion extends ResourceVersion {
    readonly stat: FileStat
}
export namespace FileResourceVersion {
    export function is(version: ResourceVersion | undefined): version is FileResourceVersion {
        return !!version && 'stat' in version && FileStat.is(version['stat']);
    }
}

export class FileResource implements Resource {

    protected readonly toDispose = new DisposableCollection();
    protected readonly onDidChangeContentsEmitter = new Emitter<void>();
    readonly onDidChangeContents: Event<void> = this.onDidChangeContentsEmitter.event;

    protected _version: FileResourceVersion | undefined;
    get version(): FileResourceVersion | undefined {
        return this._version;
    }

    protected uriString: string;

    constructor(
        readonly uri: URI,
        protected readonly fileSystem: FileSystem,
        protected readonly fileSystemWatcher: FileSystemWatcher
    ) {
        this.uriString = this.uri.toString();
        this.toDispose.push(this.onDidChangeContentsEmitter);
    }

    async init(): Promise<void> {
        const stat = await this.getFileStat();
        if (stat && stat.isDirectory) {
            throw new Error('The given uri is a directory: ' + this.uriString);
        }

        this.toDispose.push(this.fileSystemWatcher.onFilesChanged(event => {
            if (FileChangeEvent.isAffected(event, this.uri)) {
                this.sync();
            }
        }));
        this.toDispose.push(this.fileSystemWatcher.onDidDelete(event => {
            if (event.uri.isEqualOrParent(this.uri)) {
                this.sync();
            }
        }));
        this.toDispose.push(this.fileSystemWatcher.onDidMove(event => {
            if (event.sourceUri.isEqualOrParent(this.uri) || event.targetUri.isEqualOrParent(this.uri)) {
                this.sync();
            }
        }));
        try {
            this.toDispose.push(await this.fileSystemWatcher.watchFileChanges(this.uri));
        } catch (e) {
            console.error(e);
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async readContents(options?: { encoding?: string }): Promise<string> {
        try {
            const { stat, content } = await this.fileSystem.resolveContent(this.uriString, options);
            this._version = { stat };
            return content;
        } catch (e) {
            if (FileSystemError.FileNotFound.is(e)) {
                this._version = undefined;
                throw ResourceError.NotFound({
                    ...e.toJson(),
                    data: {
                        uri: this.uri
                    }
                });
            }
            throw e;
        }
    }

    async saveContents(content: string, options?: ResourceSaveOptions): Promise<void> {
        try {
            let resolvedOptions = options;
            if (options && options.overwriteEncoding) {
                resolvedOptions = {
                    ...options,
                    encoding: options.overwriteEncoding
                };
                delete resolvedOptions.overwriteEncoding;
            }
            const stat = await this.doSaveContents(content, resolvedOptions);
            this._version = { stat };
        } catch (e) {
            if (FileSystemError.FileIsOutOfSync.is(e)) {
                throw ResourceError.OutOfSync({ ...e.toJson(), data: { uri: this.uri } });
            }
            throw e;
        }
    }
    protected async doSaveContents(content: string, options?: { encoding?: string, version?: ResourceVersion }): Promise<FileStat> {
        const version = options && options.version || this._version;
        const stat = FileResourceVersion.is(version) && version.stat || await this.getFileStat();
        if (stat) {
            try {
                return await this.fileSystem.setContent(stat, content, options);
            } catch (e) {
                if (!FileSystemError.FileNotFound.is(e)) {
                    throw e;
                }
            }
        }
        return this.fileSystem.createFile(this.uriString, { content, ...options });
    }

    async saveContentChanges(changes: TextDocumentContentChangeEvent[], options?: ResourceSaveOptions): Promise<void> {
        const version = options && options.version || this._version;
        const currentStat = FileResourceVersion.is(version) && version.stat;
        if (!currentStat) {
            throw ResourceError.NotFound({ message: 'has not been read yet', data: { uri: this.uri } });
        }
        try {
            const stat = await this.fileSystem.updateContent(currentStat, changes, options);
            this._version = { stat };
        } catch (e) {
            if (FileSystemError.FileNotFound.is(e)) {
                throw ResourceError.NotFound({ ...e.toJson(), data: { uri: this.uri } });
            }
            if (FileSystemError.FileIsOutOfSync.is(e)) {
                throw ResourceError.OutOfSync({ ...e.toJson(), data: { uri: this.uri } });
            }
            throw e;
        }
    }

    async guessEncoding(): Promise<string | undefined> {
        return this.fileSystem.guessEncoding(this.uriString);
    }

    protected async sync(): Promise<void> {
        if (await this.isInSync()) {
            return;
        }
        this.onDidChangeContentsEmitter.fire(undefined);
    }
    protected async isInSync(): Promise<boolean> {
        const stat = await this.getFileStat();
        const current = this.version && this.version.stat;
        if (!current) {
            return !stat;
        }
        return !!stat && current.lastModification >= stat.lastModification;
    }

    protected async getFileStat(): Promise<FileStat | undefined> {
        if (!await this.fileSystem.exists(this.uriString)) {
            return undefined;
        }
        try {
            return this.fileSystem.getFileStat(this.uriString);
        } catch {
            return undefined;
        }
    }

}

@injectable()
export class FileResourceResolver implements ResourceResolver {

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(FileSystemWatcher)
    protected readonly fileSystemWatcher: FileSystemWatcher;

    async resolve(uri: URI): Promise<FileResource> {
        if (uri.scheme !== 'file') {
            throw new Error('The given uri is not file uri: ' + uri);
        }
        const resource = new FileResource(uri, this.fileSystem, this.fileSystemWatcher);
        await resource.init();
        return resource;
    }

}
