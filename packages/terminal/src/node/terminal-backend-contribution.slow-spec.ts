/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { createTerminalTestContainer } from './test/terminal-test-container';
import { BackendApplication } from '@theia/core/lib/node/backend-application';
import { WebSocketChannel } from '@theia/core/lib/common/messaging/web-socket-channel';
import { IShellTerminalServer } from '../common/shell-terminal-protocol';
import * as ws from 'ws';
import * as http from 'http';
import * as https from 'https';
import { terminalsPath } from '../common/terminal-protocol';

describe('Terminal Backend Contribution', function () {

    this.timeout(10000);
    let server: http.Server | https.Server;
    let shellTerminalServer: IShellTerminalServer;

    beforeEach(async () => {
        const container = createTerminalTestContainer();
        const application = container.get(BackendApplication);
        shellTerminalServer = container.get(IShellTerminalServer);
        server = await application.start();
    });

    it("is data received from the terminal ws server", async () => {
        const terminalId = await shellTerminalServer.create({});
        await new Promise((resolve, reject) => {
            const socket = new ws(`ws://localhost:${server.address().port}/services`);
            socket.on('error', reject);
            socket.on('close', (code, reason) => reject(`socket is closed with '${code}' code and '${reason}' reason`));

            const channel = new WebSocketChannel(0, content => socket.send(content));
            channel.onOpen(() => {
                resolve();
                socket.close();
            });
            socket.on('message', data =>
                channel.handleMessage(JSON.parse(data.toString()))
            );
            socket.on('open', () =>
                channel.open(`${terminalsPath}/${terminalId}`)
            );
        });
    });
});
