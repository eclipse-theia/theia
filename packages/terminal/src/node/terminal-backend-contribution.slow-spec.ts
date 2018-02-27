/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { testContainer } from './test/inversify.spec-config';
import { BackendApplication } from '@theia/core/lib/node/backend-application';
import { IShellTerminalServer } from '../common/shell-terminal-protocol';
import * as ws from 'ws';
import * as http from 'http';
import * as https from 'https';
import { terminalsPath } from '../common/terminal-protocol';

describe('Terminal Backend Contribution', function () {

    this.timeout(10000);
    let server: http.Server | https.Server;
    let shellTerminalServer: IShellTerminalServer;

    before(async function () {
        const application = testContainer.get(BackendApplication);
        shellTerminalServer = testContainer.get(IShellTerminalServer);
        server = await application.start();
    });

    it("is data received from the terminal ws server", async function () {
        const terminalId = await shellTerminalServer.create({});
        const p = new Promise((resolve, reject) => {
            const socket = new ws(`ws://localhost:${server.address().port}${terminalsPath}/${terminalId}`);
            socket.on('message', msg => {
                resolve();
                socket.close();
            });
            socket.on('error', error => {
                reject(error);
            });
        });

        await p;
    });
});
