/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as chai from 'chai';
import * as path from 'path';
import { app, BrowserWindow } from 'electron';

const expect = chai.expect;

describe.skip('basic-example-spec', () => {

    const mainWindow: Electron.BrowserWindow = new BrowserWindow({ show: false });
    mainWindow.on('ready-to-show', () => mainWindow.show());

    describe('01 #start example app', () => {
        it('should start the electron example app', async () => {
            if (!app.isReady()) {
                await new Promise(resolve => app.on('ready', resolve));
            }

            require('../src-gen/backend/main'); // start the express server

            mainWindow.webContents.openDevTools();
            mainWindow.loadURL(`file://${path.join(__dirname, 'index.html')}`);

            // eslint-disable-next-line no-unused-expressions
            expect(mainWindow.isVisible()).to.be.true;
        });
    });
});
