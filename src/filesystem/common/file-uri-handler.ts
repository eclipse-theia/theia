/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { UriHandler, UriHandlerProvider } from "../../application/common";
import URI from "../../application/common/uri";
import { FileSystem, FileStat } from "./filesystem";

export class FileUriHandler implements UriHandler {

    protected stat: FileStat;

    constructor(
        readonly uri: URI,
        protected readonly fileSystem: FileSystem
    ) { }

    resolve(): Promise<string> {
        return this.fileSystem.resolveContent(this.uri.toString()).then(result => {
            this.stat = result.stat;
            return result.content;
        });
    }

    save(content: string): Promise<void> {
        return this.fileSystem.setContent(this.stat, content).then(newStat => {
            this.stat = newStat;
        });
    }

}

@injectable()
export class FileUriHandlerProvider implements UriHandlerProvider {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem
    ) { }

    get(uri: URI): Promise<UriHandler> {
        if (uri.codeUri.scheme === 'file') {
            return Promise.resolve(new FileUriHandler(uri, this.fileSystem))
        }
        return Promise.reject(undefined);
    }

}