/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Worker } from 'cluster';
import { WorkerMessageWriter } from './worker-writer';
import { WorkerMessageReader } from './worker-reader';
import { createMessageConnection, MessageConnection, Logger } from "vscode-jsonrpc";

export function createWorkerConnection(worker: Worker, logger: Logger): MessageConnection {
    const messageReader = new WorkerMessageReader(worker);
    const messageWriter = new WorkerMessageWriter(worker);
    const connection = createMessageConnection(messageReader, messageWriter, logger);
    connection.onClose(() => connection.dispose());
    return connection;
}
