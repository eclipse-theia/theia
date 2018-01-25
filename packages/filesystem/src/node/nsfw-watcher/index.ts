/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as yargs from 'yargs';
import { JsonRpcProxyFactory } from '@theia/core';
import { FileSystemWatcherClient } from '../../common/filesystem-watcher-protocol';
import { NsfwFileSystemWatcherServer } from './nsfw-filesystem-watcher';
import { IPCEntryPoint } from '@theia/core/lib/node/messaging/ipc-protocol';

// tslint:disable:no-any

const options: {
    verbose: boolean
} = yargs.option('verbose', {
    default: false,
    alias: 'v',
    type: 'boolean'
}).argv as any;

export default <IPCEntryPoint>(connection => {
    const server = new NsfwFileSystemWatcherServer(options);
    const factory = new JsonRpcProxyFactory<FileSystemWatcherClient>(server);
    server.setClient(factory.createProxy());
    factory.listen(connection);
});
