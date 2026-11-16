// *****************************************************************************
// Copyright (C) 2026 1C-Soft LLC and others.
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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { DebugProtocol } from '@vscode/debugprotocol';
import { DebugChannel } from '../common/debug-service.js';
import { DebugSessionConnection } from './debug-session-connection.js';

disableJSDOM();

/** A debug adapter that answers every request with `success: false`. */
class FailingDebugChannel implements DebugChannel {
    protected messageHandler: (message: string) => void = () => { };

    send(content: string): void {
        const request: DebugProtocol.Request = JSON.parse(content);
        const response: DebugProtocol.Response = {
            type: 'response', seq: 0, request_seq: request.seq, command: request.command,
            success: false, message: 'request failed'
        };
        this.receive(response);
    }

    receive(message: DebugProtocol.ProtocolMessage): void {
        this.messageHandler(JSON.stringify(message));
    }

    onMessage(cb: (message: string) => void): void {
        this.messageHandler = cb;
    }

    onError(): void { }
    onClose(): void { }
    close(): void { }
}

/** A debug adapter that never answers requests. */
class SilentDebugChannel implements DebugChannel {
    send(): void { /* never responds */ }
    receive(): void { }
    onMessage(): void { }
    onError(): void { }
    onClose(): void { }
    close(): void { }
}

describe('DebugSessionConnection', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('doSendRequest', () => {

        async function expectNoUnhandledRejection(fn: () => Promise<void>): Promise<void> {
            const unhandledRejectionListeners = process.listeners('unhandledRejection');
            process.removeAllListeners('unhandledRejection');
            try {
                const unhandledRejections: unknown[] = [];
                const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
                process.on('unhandledRejection', onUnhandledRejection);
                try {
                    await fn();
                    // ensure Node.js has fully processed and emitted any unhandled rejections
                    // (unhandled rejections happen asynchronously at the end of the event loop turn)
                    await new Promise(resolve => setImmediate(resolve));
                    expect(unhandledRejections).to.have.length(0);
                } finally {
                    process.off('unhandledRejection', onUnhandledRejection);
                }
            } finally {
                for (const listener of unhandledRejectionListeners) {
                    process.on('unhandledRejection', listener);
                }
            }
        }

        it('no unhandled rejection when a request fails', async () => {
            const channel = new FailingDebugChannel();
            const connection = new DebugSessionConnection('test', async () => channel, undefined);
            await expectNoUnhandledRejection(async () => {
                const response = await connection.sendRequest('threads', {}, 1000).catch(error => error as DebugProtocol.Response);
                expect(response.success).to.be.false;
            });
        });

        it('no unhandled rejection when a request times out', async () => {
            const channel = new SilentDebugChannel();
            const connection = new DebugSessionConnection('test', async () => channel, undefined);
            await expectNoUnhandledRejection(async () => {
                const response = await connection.sendRequest('threads', {}, 30).catch(error => error as DebugProtocol.Response);
                expect(response.success).to.be.false;
                expect(response.message).to.contain('timed out');
            });
        });
    });
});
