/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { enableJSDOM } from '../browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { ConnectionState } from './connection-status-service';
import { MockConnectionStatusService } from './test/mock-connection-status-service';

disableJSDOM();

describe('connection-status', function () {

    let connectionStatusService: MockConnectionStatusService;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        connectionStatusService = new MockConnectionStatusService();
        connectionStatusService.start();
    });

    afterEach(() => {
        if (connectionStatusService !== undefined) {
            connectionStatusService.stop();
        }
    });

    it('should go from online to offline if the connection is down', async () => {
        expect(connectionStatusService.currentState.state).to.be.equal(ConnectionState.INITIAL);
        connectionStatusService.alive = false;
        await pause();

        expect(connectionStatusService.currentState.state).to.be.equal(ConnectionState.OFFLINE);
    });

    it('should go from offline to online if the connection is re-established', async () => {
        connectionStatusService.alive = false;
        await pause();
        expect(connectionStatusService.currentState.state).to.be.equal(ConnectionState.OFFLINE);

        connectionStatusService.alive = true;
        await pause();
        expect(connectionStatusService.currentState.state).to.be.equal(ConnectionState.ONLINE);
    });

});

function pause(time: number = 100) {
    return new Promise(resolve => setTimeout(resolve, time));
}
