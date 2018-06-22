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

import * as chai from "chai";
import * as path from 'path';
import * as electron from 'electron';

const expect = chai.expect;

const mainWindow: Electron.BrowserWindow = new electron.BrowserWindow({ width: 1024, height: 728 });

const { app } = require('electron');

describe('basic-example-spec', () => {
    describe('01 #start example app', () => {
        it('should start the electron example app', (done) => {
            if (app.isReady()) {
                require("../src-gen/backend/main"); // start the express server

                mainWindow.webContents.openDevTools();
                mainWindow.loadURL(`file://${path.join(__dirname, 'index.html')}`);
            }
            expect(mainWindow.isVisible()).to.be.true;
            done();
        });
    });
});
