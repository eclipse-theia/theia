/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { createTerminalTestContainer } from './test/terminal-test-container';
import { BackendApplication } from '@theia/core/lib/node/backend-application';
import { IShellTerminalServer } from '../common/shell-terminal-protocol';
import * as http from 'http';
import * as https from 'https';
import { terminalsPath } from '../common/terminal-protocol';
import { TestWebSocketChannel } from '@theia/core/lib/node/messaging/test/test-web-socket-channel';

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

    afterEach(() => {
        const s = server;
        server = undefined!;
        shellTerminalServer = undefined!;
        s.close();
    });

    it("is data received from the terminal ws server", async () => {
        const terminalId = await shellTerminalServer.create({});
        await new Promise((resolve, reject) => {
            const channel = new TestWebSocketChannel({ server, path: `${terminalsPath}/${terminalId}` });
            channel.onError(reject);
            channel.onClose((code, reason) => reject(`channel is closed with '${code}' code and '${reason}' reason`));
            channel.onOpen(() => {
                resolve();
                channel.dispose();
            });
        });
    });
});
