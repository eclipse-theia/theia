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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { MessageService } from '@theia/core';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { MCPOAuthFrontendDelegateClientImpl } from './mcp-oauth-frontend-delegate-client';

disableJSDOM();

describe('MCPOAuthFrontendDelegateClientImpl', () => {
    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    function createClient(openCalls: Array<{ url: string, external: boolean | undefined }> = [], options: {
        /** Captures the popup-blocked fallback toast; the returned value simulates the user's action choice. */
        onInfo?: (message: string, ...actions: string[]) => Promise<string | undefined>
    } = {}): MCPOAuthFrontendDelegateClientImpl {
        const client = new MCPOAuthFrontendDelegateClientImpl();
        const windowService = {
            openNewWindow(url: string, options2?: { external?: boolean }): undefined {
                openCalls.push({ url, external: options2?.external });
                return undefined;
            }
        } as unknown as WindowService;
        (client as unknown as { windowService: WindowService }).windowService = windowService;
        const messageService = {
            info: (message: string, ...actions: string[]) => options.onInfo?.(message, ...actions) ?? Promise.resolve(undefined)
        } as unknown as MessageService;
        (client as unknown as { messageService: MessageService }).messageService = messageService;
        return client;
    }

    async function flushToastHandlers(): Promise<void> {
        // openExternal resolves before the toast promise's .then runs; flush the microtask chain.
        await Promise.resolve();
        await Promise.resolve();
    }

    describe('getCallbackUrl', () => {
        it('creates callback URLs at the origin root', async () => {
            window.history.pushState(undefined, '', '/');

            expect(await createClient().getCallbackUrl()).to.equal('http://localhost/mcp/oauth/callback');
        });

        it('preserves the browser pathname base for reverse-proxy deployments', async () => {
            window.history.pushState(undefined, '', '/theia/');

            expect(await createClient().getCallbackUrl()).to.equal('http://localhost/theia/mcp/oauth/callback');
        });

        it('preserves an extension-less browser pathname base', async () => {
            window.history.pushState(undefined, '', '/theia');

            expect(await createClient().getCallbackUrl()).to.equal('http://localhost/theia/mcp/oauth/callback');
        });
    });

    describe('openExternal', () => {
        it('launches the URL via WindowService.openNewWindow with external: true', async () => {
            // `external: true` routes to `shell.openExternal` in Electron and to a popup in browser. The
            // delegate-client doesn't differentiate between deployments here: the backend's OAuth provider
            // already gated the call via its `interactive` flag (autostart's non-interactive provider
            // rejects authorization before reaching this method).
            const openCalls: Array<{ url: string, external: boolean | undefined }> = [];
            const client = createClient(openCalls);

            await client.openExternal('https://auth.example.com/authorize?state=abc&code_challenge=xyz');

            expect(openCalls).to.deep.equal([{ url: 'https://auth.example.com/authorize?state=abc&code_challenge=xyz', external: true }]);
        });

        it('re-opens the sign-in URL when the user clicks the popup-blocked fallback toast action', async () => {
            // The RPC-initiated window.open carries no user activation and may be popup-blocked (undetectable
            // with 'noopener'); the toast action click carries fresh activation.
            const openCalls: Array<{ url: string, external: boolean | undefined }> = [];
            let infoMessage: string | undefined;
            const client = createClient(openCalls, {
                onInfo: async message => {
                    infoMessage = message;
                    return 'Open';
                }
            });

            await client.openExternal('https://auth.example.com/authorize?state=abc');
            await flushToastHandlers();

            expect(infoMessage).to.contain('browser may have blocked');
            expect(openCalls).to.deep.equal([
                { url: 'https://auth.example.com/authorize?state=abc', external: true },
                { url: 'https://auth.example.com/authorize?state=abc', external: true }
            ]);
        });

        it('does not re-open the sign-in URL when the fallback toast is dismissed', async () => {
            const openCalls: Array<{ url: string, external: boolean | undefined }> = [];
            const client = createClient(openCalls, {
                onInfo: async () => undefined
            });

            await client.openExternal('https://auth.example.com/authorize');
            await flushToastHandlers();

            expect(openCalls).to.have.length(1);
        });

        it('does not require any prepare / arm step before the call', async () => {
            // The simplified design has no `prepareAuthorizationSync` / `armInteractiveAuthorization` step
            // on the delegate-client. The interactive gating lives in the backend OAuth provider's
            // `interactive` flag, not as runtime state on the delegate.
            const client = createClient();

            // Two consecutive calls work without any setup between them.
            await client.openExternal('https://auth.example.com/first');
            await client.openExternal('https://auth.example.com/second');
        });
    });
});
