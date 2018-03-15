/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Worker } from 'cluster';
import { Message } from 'vscode-jsonrpc';
import { AbstractMessageWriter, MessageWriter } from 'vscode-jsonrpc/lib/messageWriter';

export class WorkerMessageWriter extends AbstractMessageWriter implements MessageWriter {

    protected errorCount = 0;

    constructor(
        protected readonly worker: Worker
    ) {
        super();
    }

    write(msg: Message): void {
        try {
            this.worker.send(msg);
        } catch (e) {
            this.errorCount++;
            this.fireError(e, msg, this.errorCount);
        }
    }

}
