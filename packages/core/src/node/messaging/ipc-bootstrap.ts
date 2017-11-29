/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';
import { ConsoleLogger } from 'vscode-ws-jsonrpc/lib/logger';
import { createMessageConnection, IPCMessageReader, IPCMessageWriter, Trace } from 'vscode-jsonrpc';
import { THEIA_PARENT_PID, THEIA_ENTRY_POINT, IPCEntryPoint } from './ipc-protocol';

/**
 * Exit the current process if the parent process is not alive.
 * Relevant only for some OS, like Windows
 */
if (process.env[THEIA_PARENT_PID]) {
    const parentPid = Number(process.env[THEIA_PARENT_PID]);

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

const reader = new IPCMessageReader(process);
const writer = new IPCMessageWriter(process);
const logger = new ConsoleLogger();
const connection = createMessageConnection(reader, writer, logger);
connection.trace(Trace.Off, {
    log: (message, data) => console.log(`${message} ${data}`)
});

const entryPoint = require(process.env[THEIA_ENTRY_POINT]!).default as IPCEntryPoint;
entryPoint(connection);
