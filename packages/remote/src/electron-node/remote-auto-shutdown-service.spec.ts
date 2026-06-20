// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { expect } from 'chai';
import { RemoteAutoShutdownService } from './remote-auto-shutdown-service';
import { ILogger } from '@theia/core';
import { Arguments } from '@theia/core/shared/yargs';
import * as http from 'http';
import { EventEmitter } from 'events';
import { Socket } from 'socket.io';

class MockSocket extends EventEmitter {
    disconnect(): void {
        this.emit('disconnect');
    }
}

function createMockLogger(): ILogger {
    return {
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
    } as unknown as ILogger;
}

/**
 * Exposes protected state for assertions and replaces `tryShutdown`
 * with a flag so tests don't need real timers or `process.exit` stubs.
 */
class TestableAutoShutdownService extends RemoteAutoShutdownService {
    public shutdownRequested = false;
    protected override readonly logger = createMockLogger();

    constructor() {
        super();
    }

    get isEnabled(): boolean { return this.enabled; }
    get connections(): number { return this.activeConnections; }
    get hasScheduledTimer(): boolean { return this.shutdownTimer !== undefined; }

    protected override tryShutdown(): void {
        this.shutdownRequested = true;
    }

    /** Manually fire the scheduled timer callback (if any). */
    fireTimer(): void {
        if (this.shutdownTimer) {
            clearTimeout(this.shutdownTimer);
            this.shutdownTimer = undefined;
            this.tryShutdown();
        }
    }

    /** Cancel any pending timer without triggering shutdown. */
    cancelTimer(): void {
        this.cancelShutdown();
    }
}

function enableAutoShutdown(service: TestableAutoShutdownService, timeout: number = 60000): void {
    service.setArguments({
        'remote-auto-shutdown': true,
        'remote-auto-shutdown-timeout': timeout,
        _: [],
        '$0': ''
    } as unknown as Arguments);
}

function connectSocket(service: TestableAutoShutdownService): MockSocket {
    const socket = new MockSocket();
    service.onDidWebSocketUpgrade({} as http.IncomingMessage, socket as unknown as Socket);
    return socket;
}

describe('RemoteAutoShutdownService', () => {

    const services: TestableAutoShutdownService[] = [];

    afterEach(() => {
        for (const service of services) {
            service.cancelTimer();
        }
        services.length = 0;
    });

    function createService(): TestableAutoShutdownService {
        const service = new TestableAutoShutdownService();
        services.push(service);
        return service;
    }

    it('should not be enabled by default', () => {
        const service = createService();
        expect(service.isEnabled).to.equal(false);
        expect(service.hasScheduledTimer).to.equal(false);
    });

    it('should schedule initial timer when enabled', () => {
        const service = createService();
        enableAutoShutdown(service);
        expect(service.isEnabled).to.equal(true);
        expect(service.hasScheduledTimer).to.equal(true);
    });

    it('should cancel timer when a connection arrives', () => {
        const service = createService();
        enableAutoShutdown(service);
        expect(service.hasScheduledTimer).to.equal(true);

        connectSocket(service);
        expect(service.connections).to.equal(1);
        expect(service.hasScheduledTimer).to.equal(false);
    });

    it('should schedule timer when last connection disconnects', () => {
        const service = createService();
        enableAutoShutdown(service);

        const socket = connectSocket(service);
        expect(service.hasScheduledTimer).to.equal(false);

        socket.disconnect();
        expect(service.connections).to.equal(0);
        expect(service.hasScheduledTimer).to.equal(true);
    });

    it('should not schedule timer while connections remain', () => {
        const service = createService();
        enableAutoShutdown(service);

        const socket1 = connectSocket(service);
        const socket2 = connectSocket(service);
        expect(service.connections).to.equal(2);

        socket1.disconnect();
        expect(service.connections).to.equal(1);
        expect(service.hasScheduledTimer).to.equal(false);

        socket2.disconnect();
        expect(service.connections).to.equal(0);
        expect(service.hasScheduledTimer).to.equal(true);
    });

    it('should cancel and reschedule timer when new connection arrives during countdown', () => {
        const service = createService();
        enableAutoShutdown(service);

        const socket1 = connectSocket(service);
        socket1.disconnect();
        expect(service.hasScheduledTimer).to.equal(true);

        // New connection cancels the timer
        const socket2 = connectSocket(service);
        expect(service.hasScheduledTimer).to.equal(false);
        expect(service.shutdownRequested).to.equal(false);

        socket2.disconnect();
        expect(service.hasScheduledTimer).to.equal(true);
    });

    it('should request shutdown when timer fires with no connections', () => {
        const service = createService();
        enableAutoShutdown(service);

        const socket = connectSocket(service);
        socket.disconnect();
        expect(service.shutdownRequested).to.equal(false);

        service.fireTimer();
        expect(service.shutdownRequested).to.equal(true);
    });

    it('should not request shutdown when timer fires but a connection exists', () => {
        const service = createService();
        enableAutoShutdown(service);

        // Initial timer is scheduled
        connectSocket(service);
        // Timer was cancelled by the connection, but let's test tryShutdown directly
        service.fireTimer(); // no-op since timer was cancelled
        expect(service.shutdownRequested).to.equal(false);
    });

    it('should request shutdown on initial timer if no connection ever arrives', () => {
        const service = createService();
        enableAutoShutdown(service);

        // Nobody connects, timer fires
        service.fireTimer();
        expect(service.shutdownRequested).to.equal(true);
    });
});
