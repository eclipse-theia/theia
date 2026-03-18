// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as chai from 'chai';
import * as path from 'path';
import * as http from 'http';
import { AddressInfo } from 'net';
import { app, BrowserWindow } from 'electron';

const expect = chai.expect;

const electronExampleDir = path.resolve(__dirname, '..', '..');

describe('basic-example-spec', function (): void {
    this.timeout(60_000);

    let server: http.Server | undefined;
    let mainWindow: BrowserWindow | undefined;

    after(async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.destroy();
        }
        if (server) {
            await new Promise<void>(resolve => server!.close(() => resolve()));
        }
        // Remove all 'exit' listeners to prevent BackendApplication.onStop from
        // calling terminateProcessTree, which crashes Chromium's GPU process on shutdown.
        process.removeAllListeners('exit');
        process.exit(0);
    });

    it('should start the backend server', async () => {
        if (!app.isReady()) {
            await app.whenReady();
        }

        // Set the backend config before loading the server module, matching what main.js does
        const { BackendApplicationConfigProvider } = require('@theia/core/lib/node/backend-application-config-provider');
        BackendApplicationConfigProvider.set({
            singleInstance: false,
            configurationFolder: '.theia'
        });

        // eslint-disable-next-line import/no-dynamic-require
        const serverModule = require(path.join(electronExampleDir, 'src-gen', 'backend', 'server'));
        server = await serverModule(0, 'localhost');
        expect(server).to.not.be.undefined;

        const address = server!.address() as AddressInfo;
        expect(address).to.not.be.null;
        expect(address.port).to.be.a('number').and.to.be.greaterThan(0);
    });

    it('should load the frontend in an Electron window', async () => {
        expect(server).to.not.be.undefined;
        const address = server!.address() as AddressInfo;

        mainWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        const url = `http://localhost:${address.port}`;
        await mainWindow.loadURL(url);

        const title = mainWindow.webContents.getTitle();
        expect(title).to.include('Theia Electron Example');
    });
});
