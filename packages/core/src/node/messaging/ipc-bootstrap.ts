/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';
import { ConsoleLogger } from 'vscode-ws-jsonrpc/lib/logger';
import { createMessageConnection, IPCMessageReader, IPCMessageWriter, Trace } from 'vscode-jsonrpc';
import { checkParentAlive, ipcEntryPoint, IPCEntryPoint } from './ipc-protocol';

checkParentAlive();

const reader = new IPCMessageReader(process);
const writer = new IPCMessageWriter(process);
const logger = new ConsoleLogger();
const connection = createMessageConnection(reader, writer, logger);
connection.trace(Trace.Off, {
    log: (message, data) => console.log(`${message} ${data}`)
});

const entryPoint = require(ipcEntryPoint!).default as IPCEntryPoint;
entryPoint(connection);
