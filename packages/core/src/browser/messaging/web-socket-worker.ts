/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Message } from "vscode-jsonrpc/lib/messages";
import { AbstractMessageWriter, MessageWriter } from "vscode-jsonrpc/lib/messageWriter";
import { AbstractMessageReader, MessageReader, DataCallback } from "vscode-jsonrpc/lib/messageReader";
import { Event, Emitter } from '../../common/event';
import { WebSocketOptions } from "./web-socket-factory";

export class WebSocketWorker {

    protected readonly onMessageEmitter = new Emitter<WebSocketWorker.MessageEvent>();
    readonly onMessage: Event<WebSocketWorker.MessageEvent> = this.onMessageEmitter.event;

    protected readonly onInitializeEmitter = new Emitter<WebSocketWorker.InitializeEvent>();
    readonly onInitialize: Event<WebSocketWorker.InitializeEvent> = this.onInitializeEmitter.event;

    constructor(
        protected readonly worker: Worker
    ) {
        worker.onerror = e => console.error(e);
        worker.onmessage = e => {
            const data = e.data;
            if (data === undefined || !('kind' in data)) {
                return;
            }
            if (data.kind === 'initialize') {
                this.onInitializeEmitter.fire(data);
            }
            if (data.kind === 'message') {
                this.onMessageEmitter.fire(data);
            }
        };
    }

    sendEvent(event: WebSocketWorker.BaseEvent) {
        this.worker.postMessage(event);
    }

}
export namespace WebSocketWorker {
    export interface MessageEvent {
        kind: 'message'
        url: string
        message: Message
    }
    export interface InitializeEvent {
        kind: 'initialize'
        options: WebSocketOptions
    }
    export type BaseEvent = MessageEvent | InitializeEvent;
}

export class WebWorkerMessageReader extends AbstractMessageReader implements MessageReader {

    constructor(
        public readonly url: string,
        public readonly worker: WebSocketWorker
    ) {
        super();
        this.worker.onMessage(e => this.processMessage(e));
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
    protected processMessage(e: WebSocketWorker.MessageEvent): void {
        if (e.url === this.url) {
            const message = e.message;
            if (this.callback) {
                this.callback(message);
            } else {
                this.messages.push(message);
            }
        }
    }

}

export class WebWorkerMessageWriter extends AbstractMessageWriter implements MessageWriter {

    private errorCount = 0;
    constructor(
        public url: string,
        public worker: WebSocketWorker
    ) {
        super();
    }

    write(message: Message): void {
        try {
            const url = this.url;
            this.worker.sendEvent({ kind: 'message', url, message });
        } catch (error) {
            this.fireError(error, message, ++this.errorCount);
        }
    }

}
