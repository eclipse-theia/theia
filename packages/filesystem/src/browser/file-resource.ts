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
import { TextDocumentContentChangeEvent } from 'vscode-languageserver-types';
import {
    Resource, ResourceResolver, Emitter, Event, DisposableCollection, ResourceError
} from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { FileSystem, FileStat, FileSystemError } from '../common/filesystem';
import { FileSystemWatcher, FileChangeEvent } from './filesystem-watcher';

export class FileResource implements Resource {

    protected readonly toDispose = new DisposableCollection();
    protected readonly onDidChangeContentsEmitter = new Emitter<void>();
    readonly onDidChangeContents: Event<void> = this.onDidChangeContentsEmitter.event;

    protected stat: FileStat | undefined;
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
        this.stat = stat;

        this.toDispose.push(this.fileSystemWatcher.onFilesChanged(event => {
            if (FileChangeEvent.isAffected(event, this.uri)) {
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
            this.stat = stat;
            return content;
        } catch (e) {
            if (FileSystemError.FileNotFound.is(e)) {
                this.stat = undefined;
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

    async saveContents(content: string, options?: { encoding?: string }): Promise<void> {
        this.stat = await this.doSaveContents(content, options);
    }
    protected async doSaveContents(content: string, options?: { encoding?: string }): Promise<FileStat> {
        const stat = await this.getFileStat();
        if (stat) {
            return this.fileSystem.setContent(stat, content, options);
        }
        return this.fileSystem.createFile(this.uriString, { content, ...options });
    }

    async saveContentChanges(changes: TextDocumentContentChangeEvent[], options?: { encoding?: string }): Promise<void> {
        if (!this.stat) {
            throw new Error(this.uriString + ' has not been read yet');
        }
        this.stat = await this.fileSystem.updateContent(this.stat, changes, options);
    }

    protected async sync(): Promise<void> {
        if (await this.isInSync(this.stat)) {
            return;
        }
        this.onDidChangeContentsEmitter.fire(undefined);
    }
    protected async isInSync(current: FileStat | undefined): Promise<boolean> {
        const stat = await this.getFileStat();
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
