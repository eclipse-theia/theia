/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';
import * as yargs from 'yargs';
import { ConsoleLogger } from 'vscode-ws-jsonrpc/lib/logger';
import { createMessageConnection, IPCMessageReader, IPCMessageWriter, Trace } from 'vscode-jsonrpc';
import { JsonRpcProxyFactory } from '@theia/core';
import { FileSystemWatcherClient } from '../../common/filesystem-watcher-protocol';
import { ChokidarFileSystemWatcherServer } from './chokidar-filesystem-watcher';

// tslint:disable:no-console
// tslint:disable:no-any

const options: {
    verbose: boolean
} = yargs.option('vebose', {
    default: false,
    alias: 'v',
    type: 'boolean'
}).argv as any;

const reader = new IPCMessageReader(process);
const writer = new IPCMessageWriter(process);
const logger = new ConsoleLogger();
const connection = createMessageConnection(reader, writer, logger);
connection.trace(Trace.Off, {
    log: (message, data) => console.log(`${message} ${data}`)
});

const server = new ChokidarFileSystemWatcherServer(options);
const factory = new JsonRpcProxyFactory<FileSystemWatcherClient>(server);
server.setClient(factory.createProxy());
factory.listen(connection);

// FIXME extract the utility function to fork Theia process
if (process.env['THEIA_PARENT_PID']) {
    const parentPid = Number(process.env['THEIA_PARENT_PID']);

    if (typeof parentPid === 'number' && !isNaN(parentPid)) {
        setInterval(function () {
            try {
                // throws an exception if the main process doesn't exist anymore.
                process.kill(parentPid, 0);
            } catch (e) {
                process.exit();
            }
        }, 5000);
    }
}
