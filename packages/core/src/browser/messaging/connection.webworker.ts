
/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

require('reflect-metadata');
import { toSocket, WebSocketMessageReader, WebSocketMessageWriter } from "vscode-ws-jsonrpc";
import { forward, createConnection } from "vscode-ws-jsonrpc/lib/server";
import { WebWorkerMessageReader } from "./web-worker-message-reader";
import { WebWorkerMessageWriter } from "./web-worker-message-writer";
import { WebSocketFactory } from "./web-socket-factory";

// tslint:disable-next-line:no-any
const worker: Worker = self as any;
worker.onmessage = e => {
    const workerReader = new WebWorkerMessageReader(worker);
    const workerWriter = new WebWorkerMessageWriter(worker);
    const workerConnection = createConnection(workerReader, workerWriter, () => workerReader.stop());

    const webSocketFactory = new WebSocketFactory();
    const webSocket = webSocketFactory.createWebSocket(e.data);
    webSocket.onerror = error => console.error('' + error);
    webSocket.onopen = () => {
        const socket = toSocket(webSocket);
        const socketReader = new WebSocketMessageReader(socket);
        const socketWriter = new WebSocketMessageWriter(socket);
        const socketConnection = createConnection(socketReader, socketWriter, () => socket.dispose());
        forward(workerConnection, socketConnection);
    };
};
