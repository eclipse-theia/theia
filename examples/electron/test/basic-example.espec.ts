/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as path from 'path';
import * as electron from 'electron';

const expect = chai.expect;

const mainWindow: Electron.BrowserWindow = new electron.BrowserWindow({ width: 1024, height: 728 });

const { app } = require('electron');

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
    chai.should();
    chai.use(chaiAsPromised);
});

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
