/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { enableJSDOM } from '../browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { ConnectionStatus } from './connection-status-service';
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
    });

    afterEach(() => {
        if (connectionStatusService !== undefined) {
            connectionStatusService.dispose();
        }
    });

    it('should go from online to offline if the connection is down', async () => {
        expect(connectionStatusService.currentStatus).to.be.equal(ConnectionStatus.ONLINE);
        connectionStatusService.alive = false;
        await pause();

        expect(connectionStatusService.currentStatus).to.be.equal(ConnectionStatus.OFFLINE);
    });

    it('should go from offline to online if the connection is re-established', async () => {
        expect(connectionStatusService.currentStatus).to.be.equal(ConnectionStatus.ONLINE);
        connectionStatusService.alive = false;
        await pause();
        expect(connectionStatusService.currentStatus).to.be.equal(ConnectionStatus.OFFLINE);

        connectionStatusService.alive = true;
        await pause();
        expect(connectionStatusService.currentStatus).to.be.equal(ConnectionStatus.ONLINE);
    });

});

function pause(time: number = 1) {
    return new Promise(resolve => setTimeout(resolve, time));
}
