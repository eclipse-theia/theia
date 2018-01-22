/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Resource, ResourceResolver, MaybePromise, Emitter, Event, DisposableCollection } from "@theia/core";
import URI from "@theia/core/lib/common/uri";
import { FileSystem, FileStat } from "../common/filesystem";
import { FileSystemWatcher } from "./filesystem-watcher";

export class FileResource implements Resource {

    protected readonly toDispose = new DisposableCollection();
    protected readonly onDidChangeContentsEmitter = new Emitter<void>();

    constructor(
        readonly uri: URI,
        protected stat: FileStat,
        protected readonly fileSystem: FileSystem,
        protected readonly fileSystemWatcher: FileSystemWatcher
    ) {
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

    readContents(options?: { encoding?: string }): Promise<string> {
        return this.fileSystem.resolveContent(this.uri.toString(), options).then(result => {
            this.stat = result.stat;
            return result.content;
        });
    }

    saveContents(content: string, options?: { encoding?: string }): Promise<void> {
        return this.fileSystem.setContent(this.stat, content, options).then(newStat => {
            this.stat = newStat;
        });
    }

    get onDidChangeContents(): Event<void> {
        return this.onDidChangeContentsEmitter.event;
    }

}

@injectable()
export class FileResourceResolver implements ResourceResolver {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcher) protected readonly fileSystemWatcher: FileSystemWatcher
    ) { }

    resolve(uri: URI): MaybePromise<FileResource> {
        if (uri.scheme !== 'file') {
            throw new Error('The given uri is not file uri: ' + uri);
        }
        return this.fileSystem.getFileStat(uri.toString()).then(fileStat => {
            if (!fileStat.isDirectory) {
                return new FileResource(uri, fileStat, this.fileSystem, this.fileSystemWatcher);
            }
            throw new Error('The given uri is a directory: ' + uri);
        });
    }

}
