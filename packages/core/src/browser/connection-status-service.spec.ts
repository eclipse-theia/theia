// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { enableJSDOM } from '../browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from './frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import {
    ConnectionStatus,
    ConnectionStatusOptions,
    FrontendConnectionStatusService,
    PingService
} from './connection-status-service';
import { MockConnectionStatusService } from './test/mock-connection-status-service';

import * as sinon from 'sinon';

import { Container } from 'inversify';
import { ILogger, Emitter, Loggable } from '../common';
import { WebSocketConnectionSource } from './messaging/ws-connection-source';

disableJSDOM();

describe('connection-status', function (): void {

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

describe('frontend-connection-status', function (): void {
    const OFFLINE_TIMEOUT = 10;

    let testContainer: Container;

    const mockSocketOpenedEmitter: Emitter<void> = new Emitter();
    const mockSocketClosedEmitter: Emitter<void> = new Emitter();
    const mockIncomingMessageActivityEmitter: Emitter<void> = new Emitter();

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    let timer: sinon.SinonFakeTimers;
    let pingSpy: sinon.SinonSpy;
    beforeEach(() => {
        const mockWebSocketConnectionSource = sinon.createStubInstance(WebSocketConnectionSource);
        const mockPingService: PingService = <PingService>{
            ping(): Promise<void> {
                return Promise.resolve(undefined);
            }
        };
        const mockILogger: ILogger = <ILogger>{
            error(loggable: Loggable): Promise<void> {
                return Promise.resolve(undefined);
            }
        };

        testContainer = new Container();
        testContainer.bind(FrontendConnectionStatusService).toSelf().inSingletonScope();
        testContainer.bind(PingService).toConstantValue(mockPingService);
        testContainer.bind(ILogger).toConstantValue(mockILogger);
        testContainer.bind(ConnectionStatusOptions).toConstantValue({ offlineTimeout: OFFLINE_TIMEOUT });
        testContainer.bind(WebSocketConnectionSource).toConstantValue(mockWebSocketConnectionSource);

        sinon.stub(mockWebSocketConnectionSource, 'onSocketDidOpen').value(mockSocketOpenedEmitter.event);
        sinon.stub(mockWebSocketConnectionSource, 'onSocketDidClose').value(mockSocketClosedEmitter.event);
        sinon.stub(mockWebSocketConnectionSource, 'onIncomingMessageActivity').value(mockIncomingMessageActivityEmitter.event);

        timer = sinon.useFakeTimers();

        pingSpy = sinon.spy(mockPingService, 'ping');
    });

    afterEach(() => {
        pingSpy.restore();
        timer.restore();
        testContainer.unbindAll();
    });

    it('should switch status to offline on websocket close', () => {
        const frontendConnectionStatusService = testContainer.get<FrontendConnectionStatusService>(FrontendConnectionStatusService);
        frontendConnectionStatusService['init']();
        expect(frontendConnectionStatusService.currentStatus).to.be.equal(ConnectionStatus.ONLINE);
        mockSocketClosedEmitter.fire(undefined);
        expect(frontendConnectionStatusService.currentStatus).to.be.equal(ConnectionStatus.OFFLINE);
    });

    it('should switch status to online on websocket established', () => {
        const frontendConnectionStatusService = testContainer.get<FrontendConnectionStatusService>(FrontendConnectionStatusService);
        frontendConnectionStatusService['init']();
        mockSocketClosedEmitter.fire(undefined);
        expect(frontendConnectionStatusService.currentStatus).to.be.equal(ConnectionStatus.OFFLINE);
        mockSocketOpenedEmitter.fire(undefined);
        expect(frontendConnectionStatusService.currentStatus).to.be.equal(ConnectionStatus.ONLINE);
    });

    it('should switch status to online on any websocket activity', () => {
        const frontendConnectionStatusService = testContainer.get<FrontendConnectionStatusService>(FrontendConnectionStatusService);
        frontendConnectionStatusService['init']();
        mockSocketClosedEmitter.fire(undefined);
        expect(frontendConnectionStatusService.currentStatus).to.be.equal(ConnectionStatus.OFFLINE);
        mockIncomingMessageActivityEmitter.fire(undefined);
        expect(frontendConnectionStatusService.currentStatus).to.be.equal(ConnectionStatus.ONLINE);
    });

    it('should perform ping request after socket activity', () => {
        const frontendConnectionStatusService = testContainer.get<FrontendConnectionStatusService>(FrontendConnectionStatusService);
        frontendConnectionStatusService['init']();
        mockIncomingMessageActivityEmitter.fire(undefined);
        expect(frontendConnectionStatusService.currentStatus).to.be.equal(ConnectionStatus.ONLINE);
        sinon.assert.notCalled(pingSpy);
        timer.tick(OFFLINE_TIMEOUT);
        sinon.assert.calledOnce(pingSpy);
    });

    it('should not perform ping request before desired timeout', () => {
        const frontendConnectionStatusService = testContainer.get<FrontendConnectionStatusService>(FrontendConnectionStatusService);
        frontendConnectionStatusService['init']();
        mockIncomingMessageActivityEmitter.fire(undefined);
        expect(frontendConnectionStatusService.currentStatus).to.be.equal(ConnectionStatus.ONLINE);
        sinon.assert.notCalled(pingSpy);
        timer.tick(OFFLINE_TIMEOUT - 1);
        sinon.assert.notCalled(pingSpy);
    });

    it('should switch to offline mode if ping request was rejected', () => {
        const pingService = testContainer.get<PingService>(PingService);
        pingSpy.restore();
        const stub = sinon.stub(pingService, 'ping').onFirstCall().throws('failed to make a ping request');
        const frontendConnectionStatusService = testContainer.get<FrontendConnectionStatusService>(FrontendConnectionStatusService);
        frontendConnectionStatusService['init']();
        mockIncomingMessageActivityEmitter.fire(undefined);
        expect(frontendConnectionStatusService.currentStatus).to.be.equal(ConnectionStatus.ONLINE);
        timer.tick(OFFLINE_TIMEOUT);
        sinon.assert.calledOnce(stub);
        expect(frontendConnectionStatusService.currentStatus).to.be.equal(ConnectionStatus.OFFLINE);
    });
});

function pause(time: number = 1): Promise<unknown> {
    return new Promise(resolve => setTimeout(resolve, time));
}
