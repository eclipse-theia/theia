/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Worker } from 'cluster';
import { DataCallback } from 'vscode-jsonrpc';
import { MessageReader, AbstractMessageReader } from 'vscode-jsonrpc/lib/messageReader';

export class WorkerMessageReader extends AbstractMessageReader implements MessageReader {

    constructor(
        protected readonly worker: Worker
    ) {
        super();
    }

    listen(callback: DataCallback): void {
        this.worker.on('exit', (code, signal) => {
            if (code !== 0) {
                const error: Error = {
                    name: '' + code,
                    message: `Worker exited with '${code}' error code and '${signal}' signal`
                };
                this.fireError(error);
            }
            this.fireClose();
        });
        this.worker.on('error', e =>
            this.fireError(e)
        );
        this.worker.on('message', callback);
    }

}
