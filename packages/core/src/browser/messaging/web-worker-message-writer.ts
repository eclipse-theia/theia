/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Message } from "vscode-jsonrpc/lib/messages";
import { AbstractMessageWriter, MessageWriter } from "vscode-jsonrpc/lib/messageWriter";

export class WebWorkerMessageWriter extends AbstractMessageWriter implements MessageWriter {

    private errorCount = 0;
    constructor(
        public worker: Worker
    ) {
        super();
        this.worker.onerror = e => this.fireError(e);
    }

    write(msg: Message): void {
        try {
            this.worker.postMessage(msg);
        } catch (error) {
            this.fireError(error, msg, ++this.errorCount);
        }
    }

}
