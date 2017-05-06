/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Resource, ResourceResolver } from "../../application/common";
import URI from "../../application/common/uri";
import { FileSystem, FileStat } from "./filesystem";

export class FileResource implements Resource {

    protected stat: FileStat;

    constructor(
        readonly uri: URI,
        protected readonly fileSystem: FileSystem
    ) { }

    readContents(options?: { encodings?: string }): Promise<string> {
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

}

@injectable()
export class FileResourceResolver implements ResourceResolver {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem
    ) { }

    resolve(uri: URI): Promise<FileResource> {
        if (uri.scheme === 'file') {
            return Promise.resolve(new FileResource(uri, this.fileSystem))
        }
        return Promise.reject(undefined);
    }

}