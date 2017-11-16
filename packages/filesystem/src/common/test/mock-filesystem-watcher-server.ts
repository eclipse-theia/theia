/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { FileSystemWatcherServer, FileSystemWatcherClient, WatchOptions } from '../filesystem-watcher-protocol';

@injectable()
export class MockFilesystemWatcherServer implements FileSystemWatcherServer {

    dispose() { }

    watchFileChanges(uri: string, options?: WatchOptions): Promise<number> {
        return Promise.resolve(0);
    }

    unwatchFileChanges(watcher: number): Promise<void> {
        return Promise.resolve();
    }

    setClient(client: FileSystemWatcherClient) { }

}
