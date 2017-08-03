/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

const Application = require("spectron").Application;
const path = require('path');
const chai = require('chai');
const should = chai.should();
const chaiAsPromised = require('chai-as-promised');
var electronPath = path.join(__dirname, '..', 'node_modules', '.bin', 'electron');

// Path to your application
var appPath = path.join(__dirname, '../src-gen/frontend/electron-main.js');

import { assert } from "chai"
const expect = chai.expect;
const timeout = 10000;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
    chai.should();
    chai.use(chaiAsPromised);
});

const app = new Application({
    path: electronPath,
    args: [appPath],
    startTimeout: timeout,
    waitTimeout: timeout,
    requireName: 'electronRequire'
});

describe('Test specs with spectron', function () {
    this.timeout(60000);

    beforeEach(function () {
        require("../src-gen/backend/main"); // start the express server
        return app.start();
    });

    afterEach(function () {
        if (app && app.isRunning()) {
            return app.stop();
        }
    })

    it('Test - 1 : opens a window', function () {
        return app.client
            .getWindowCount().should.eventually.equal(2);
    });

    it('Test - 2 : From example to check if browserWindow api works with Spectron', function () {
        return app.client
            .getWindowCount().should.eventually.equal(2)
        // .browserWindow.isMinimized().should.eventually.be.false
        // .browserWindow.isDevToolsOpened().should.eventually.be.false
        // .browserWindow.isVisible().should.eventually.be.true
        // .browserWindow.isFocused().should.eventually.be.true
        // .browserWindow.getBounds().should.eventually.have.property('width').and.be.above(0)
        // .browserWindow.getBounds().should.eventually.have.property('height').and.be.above(0)
    })

    // it('Test - 3 :Files panel is showing', () => {
    //     if (app.client.element('#file-navigator').getAttribute('class').split(' ').indexOf('p-mod-hidden') !== -1) {
    //         return false;
    //     } else {
    //         return true;
    //     }
    // });
});
