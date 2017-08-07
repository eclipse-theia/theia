/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Worker } from 'cluster';
import { AbstractStreamMessageWriter } from 'vscode-ws-jsonrpc/lib';

export class WorkerMessageWriter extends AbstractStreamMessageWriter {

    constructor(
        protected readonly worker: Worker
    ) {
        super();
    }

    protected send(content: string): void {
        try {
            this.worker.send(content);
        } catch (e) {
            this.fireError(e);
        }
    }

}
