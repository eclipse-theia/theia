// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import {
    MCP_OAUTH_ACTIVE_CALLBACK_LIMIT,
    MCP_OAUTH_AUTHORIZATION_CANCELLED,
    MCP_OAUTH_REJECTED_CALLBACK_LIMIT,
    MCPOAuthCallbackService
} from './mcp-oauth-callback-service';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';

/**
 * Exposes the protected `reserveCallback` so the timeout test can install a short-lived timer without
 * waiting `MCP_OAUTH_CALLBACK_TIMEOUT` (the default used by production callers via `createState`). The
 * public `waitForCallback` no longer accepts a timeout parameter — timeout ownership lives with the
 * reservation, not the wait.
 */
class TestableMCPOAuthCallbackService extends MCPOAuthCallbackService {
    reserveForTest(state: string, timeout: number): void {
        this.reserveCallback(state, timeout);
    }
}

describe('MCPOAuthCallbackService', () => {
    let service: TestableMCPOAuthCallbackService;

    beforeEach(() => {
        service = new TestableMCPOAuthCallbackService();
        (service as unknown as { logger: MockLogger }).logger = new MockLogger();
    });

    it('resolves a waiting callback', async () => {
        const promise = service.waitForCallback('state');

        expect(service.acceptCallback({ state: 'state', code: 'code' })).to.be.true;

        expect(await promise).to.deep.equal({ state: 'state', code: 'code' });
    });

    it('queues callbacks that arrive between createState and waitForCallback', async () => {
        const state = service.createState();

        // Callback arrives before waitForCallback subscribes. The reserved deferred from createState
        // accepts the callback so waitForCallback can observe the result instead of failing as
        // 'unknown state' in the callback route.
        expect(service.acceptCallback({ state, code: 'code' })).to.be.true;

        expect(await service.waitForCallback(state)).to.deep.equal({ state, code: 'code' });
    });

    it('propagates a cancellation that occurred between createState and waitForCallback', async () => {
        const state = service.createState();

        service.cancel(state);

        try {
            await service.waitForCallback(state);
            throw new Error('Expected cancellation');
        } catch (error) {
            expect((error as Error).message).to.equal(MCP_OAUTH_AUTHORIZATION_CANCELLED);
        }
    });

    it('ignores unknown callback states', () => {
        expect(service.acceptCallback({ state: 'missing', code: 'code' })).to.be.false;
    });

    it('remembers cancelled callback states for late browser callbacks', async () => {
        const promise = service.waitForCallback('state');

        service.cancel('state');

        try {
            await promise;
            throw new Error('Expected cancellation');
        } catch (error) {
            expect((error as Error).message).to.equal(MCP_OAUTH_AUTHORIZATION_CANCELLED);
        }
        expect(service.consumeRejectedCallbackMessage('state')).to.equal('OAuth authorization was cancelled. You can close this tab.');
        expect(service.consumeRejectedCallbackMessage('state')).to.be.undefined;
    });

    it('evicts old active callback states when the limit is reached', async () => {
        const promises: Promise<unknown>[] = [];
        for (let index = 0; index <= MCP_OAUTH_ACTIVE_CALLBACK_LIMIT; index++) {
            promises.push(service.waitForCallback(`state-${index}`).catch(error => error));
        }

        const firstResult = await promises[0];
        expect((firstResult as Error).message).to.equal(MCP_OAUTH_AUTHORIZATION_CANCELLED);
        expect(service.acceptCallback({ state: 'state-0', code: 'code' })).to.be.false;
        expect(service.consumeRejectedCallbackMessage('state-0'))
            .to.equal('OAuth authorization was cancelled because too many authorization attempts are in progress.');
        expect(service.acceptCallback({ state: `state-${MCP_OAUTH_ACTIVE_CALLBACK_LIMIT}`, code: 'code' })).to.be.true;
    });

    it('rejects when a wait times out', async () => {
        service.reserveForTest('state', 1);
        try {
            await service.waitForCallback('state');
            throw new Error('Expected timeout');
        } catch (error) {
            expect((error as Error).message).to.equal('Timed out waiting for MCP OAuth authorization callback.');
        }
    });

    it('evicts old rejected callback states when the limit is reached', async () => {
        for (let index = 0; index <= MCP_OAUTH_REJECTED_CALLBACK_LIMIT; index++) {
            const promise = service.waitForCallback(`state-${index}`);
            service.cancel(`state-${index}`);
            await promise.catch(() => undefined);
        }

        expect(service.consumeRejectedCallbackMessage('state-0')).to.be.undefined;
        expect(service.consumeRejectedCallbackMessage(`state-${MCP_OAUTH_REJECTED_CALLBACK_LIMIT}`))
            .to.equal('OAuth authorization was cancelled. You can close this tab.');
    });
});
