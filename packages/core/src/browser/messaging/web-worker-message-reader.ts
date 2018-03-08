/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Message } from "vscode-jsonrpc/lib/messages";
import { AbstractMessageReader, MessageReader, DataCallback } from "vscode-jsonrpc/lib/messageReader";

export class WebWorkerMessageReader extends AbstractMessageReader implements MessageReader {

    constructor(
        public worker: Worker
    ) {
        super();
        this.worker.onerror = e => this.fireError(e);
        this.worker.onmessage = e => this.processMessage(e);
    }

    protected callback: DataCallback | undefined;
    listen(callback: DataCallback): void {
        this.callback = callback;
        while (this.messages.length !== 0) {
            callback(this.messages.pop()!);
        }
    }

    stop(): void {
        this.callback = undefined;
    }

    protected messages: Message[] = [];
    protected processMessage(e: MessageEvent): void {
        const data = e.data;
        if (data === undefined || !('jsonrpc' in data)) {
            return;
        }
        const message = e.data as Message;
        if (this.callback) {
            this.callback(message);
        } else {
            this.messages.push(message);
        }
    }

}
