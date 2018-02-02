/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Resource, ResourceResolver, Emitter, Event, DisposableCollection } from "@theia/core";
import URI from "@theia/core/lib/common/uri";
import { FileSystem, FileStat } from "../common/filesystem";
import { FileSystemWatcher } from "./filesystem-watcher";

export class FileResource implements Resource {

    protected readonly toDispose = new DisposableCollection();
    protected readonly onDidChangeContentsEmitter = new Emitter<void>();
    readonly onDidChangeContents: Event<void> = this.onDidChangeContentsEmitter.event;

    protected state: FileResource.State = FileResource.emptyState;
    protected uriString: string;

    constructor(
        readonly uri: URI,
        protected readonly fileSystem: FileSystem,
        protected readonly fileSystemWatcher: FileSystemWatcher
    ) {
        this.uriString = this.uri.toString();
        this.toDispose.push(this.onDidChangeContentsEmitter);
        this.toDispose.push(this.fileSystemWatcher.onFilesChanged(changes => {
            if (changes.some(e => e.uri.toString() === uri.toString())) {
                this.onDidChangeContentsEmitter.fire(undefined);
            }
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async readContents(options?: { encoding?: string }): Promise<string> {
        this.state = await this.doReadContents(options);
        return this.state.content;
    }
    protected async doReadContents(options?: { encoding?: string }): Promise<FileResource.State> {
        try {
            if (!await this.fileSystem.exists(this.uriString)) {
                return FileResource.emptyState;
            }
            return this.fileSystem.resolveContent(this.uriString, options);
        } catch {
            return FileResource.emptyState;
        }
    }

    async saveContents(content: string, options?: { encoding?: string }): Promise<void> {
        const stat = await this.doSaveContents(content, options);
        this.state = { stat, content };
    }
    protected async doSaveContents(content: string, options?: { encoding?: string }): Promise<FileStat> {
        if (!await this.fileSystem.exists(this.uriString)) {
            return this.fileSystem.createFile(this.uriString, { content });
        }
        const stat = this.state.stat || await this.fileSystem.getFileStat(this.uriString);
        return this.fileSystem.setContent(stat, content, options);
    }

}
export namespace FileResource {
    export interface State {
        stat?: FileStat,
        content: string
    }
    export const emptyState: State = { content: '' };
}

@injectable()
export class FileResourceResolver implements ResourceResolver {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcher) protected readonly fileSystemWatcher: FileSystemWatcher
    ) { }

    async resolve(uri: URI): Promise<FileResource> {
        if (uri.scheme !== 'file') {
            throw new Error('The given uri is not file uri: ' + uri);
        }
        const fileStat = await this.getFileStat(uri);
        if (fileStat && fileStat.isDirectory) {
            throw new Error('The given uri is a directory: ' + uri);
        }
        return new FileResource(uri, this.fileSystem, this.fileSystemWatcher);
    }

    protected async getFileStat(uri: URI): Promise<FileStat | undefined> {
        try {
            if (await this.fileSystem.exists(uri.toString())) {
                return await this.fileSystem.getFileStat(uri.toString());
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

}
