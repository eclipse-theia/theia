/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as ws from 'ws';
import * as http from 'http';
import * as https from 'https';
import { WebSocketChannel } from '../../../common/messaging/web-socket-channel';
import { Disposable } from '../../../common/disposable';

export class TestWebSocketChannel extends WebSocketChannel {

    constructor({ server, path }: {
        server: http.Server | https.Server,
        path: string
    }) {
        super(0, content => socket.send(content));
        const socket = new ws(`ws://localhost:${server.address().port}${WebSocketChannel.wsPath}`);
        socket.on('error', error =>
            this.fireError(error)
        );
        socket.on('close', (code, reason) =>
            this.fireClose(code, reason)
        );
        socket.on('message', data =>
            this.handleMessage(JSON.parse(data.toString()))
        );
        socket.on('open', () =>
            this.open(path)
        );
        this.toDispose.push(Disposable.create(() => socket.close()));
    }

}
