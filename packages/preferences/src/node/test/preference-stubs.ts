/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { JsonPreferenceServer } from '../json-preference-server';
import URI from '@theia/core/lib/common/uri';
import { FileSystemNode } from "@theia/filesystem/lib/node/node-filesystem";
import { FileSystemWatcherServer, DidFilesChangedParams, WatchOptions, FileSystemWatcherClient } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { Logger } from '@theia/core/lib/common/logger';

export class JsonPrefHelper {
    readonly logger: Logger;
    readonly fileWatcher: FileSystemWatcherServerstub;
    fileSystem: FileSystemNode;
    constructor() {
        this.logger = new Proxy<Logger>({} as any, {
            get: (target, name) => () => {
                if (name.toString().startsWith('is')) {
                    return Promise.resolve(false);
                }
                if (name.toString().startsWith('if')) {
                    return new Promise(resolve => { });
                }
            }
        });
        this.fileSystem = new FileSystemNode();
        this.fileWatcher = this.createFileSystemWatcher();
    }

    getFS(): FileSystemNode {
        return this.fileSystem;
    }

    getWatcher(): FileSystemWatcherServerstub {
        return this.fileWatcher;
    }

    createJsonPrefServer(preferenceFileUri: URI) {
        return new JsonPreferenceServer(this.fileSystem, this.fileWatcher, this.logger, Promise.resolve(preferenceFileUri));
    }

    private createFileSystemWatcher(): FileSystemWatcherServerstub {

        return new FileSystemWatcherServerstub();
    }
}


export class FileSystemWatcherServerstub implements FileSystemWatcherServer {
    protected client: FileSystemWatcherClient;
    watchFileChanges(uri: string, options?: WatchOptions): Promise<number> {
        return Promise.resolve(2);
    }

    unwatchFileChanges(watcher: number): Promise<void> {
        return Promise.resolve();
    }

    setClient(client: FileSystemWatcherClient): void {
        this.client = client;
    }

    dispose() { }

    fireEvents(event: DidFilesChangedParams) {
        if (this.client) {
            this.client.onDidFilesChanged(event);
        }
    }
}