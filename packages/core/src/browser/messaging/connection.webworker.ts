
/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

require('reflect-metadata');
import { WebSocketMessageReader, WebSocketMessageWriter, IWebSocket } from "vscode-ws-jsonrpc";
import { forward, createConnection } from "vscode-ws-jsonrpc/lib/server";
import { WebSocketFactory } from "./web-socket-factory";
import { WebSocketWorker, WebWorkerMessageReader, WebWorkerMessageWriter } from "./web-socket-worker";

// tslint:disable-next-line:no-any
const worker = new WebSocketWorker(self as any);
worker.onInitialize(({ options }) => {
    const workerReader = new WebWorkerMessageReader(options.url, worker);
    const workerWriter = new WebWorkerMessageWriter(options.url, worker);
    const workerConnection = createConnection(workerReader, workerWriter, () => workerReader.stop());

    const webSocketFactory = new WebSocketFactory();
    const webSocket = webSocketFactory.createWebSocket(options);
    webSocket.onerror = error => console.error(error);
    webSocket.onopen = () => {
        const socket: IWebSocket = {
            send: content => webSocket.send(content),
            onMessage: cb => webSocket.onmessage = event => cb(event.data),
            onError: cb => webSocket.onerror = event => cb(event),
            onClose: cb => webSocket.onclose = event => cb(event.code, event.reason),
            dispose: () => webSocket.close()
        };
        const socketReader = new WebSocketMessageReader(socket);
        const socketWriter = new WebSocketMessageWriter(socket);
        const socketConnection = createConnection(socketReader, socketWriter, () => socket.dispose());
        forward(workerConnection, socketConnection);
    };
});
