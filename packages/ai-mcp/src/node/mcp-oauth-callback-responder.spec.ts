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
import { MCPOAuthCallbackService } from './mcp-oauth-callback-service';
import { MCPOAuthCallbackResponder } from './mcp-oauth-callback-responder';

function createResponder(): { responder: MCPOAuthCallbackResponder, callbackService: MCPOAuthCallbackService } {
    const callbackService = new MCPOAuthCallbackService();
    const responder = new MCPOAuthCallbackResponder();
    (responder as unknown as { callbackService: MCPOAuthCallbackService }).callbackService = callbackService;
    return { responder, callbackService };
}

describe('MCPOAuthCallbackResponder', () => {

    it('returns 400 when the state is missing', () => {
        const { responder } = createResponder();

        const response = responder.renderResponse({ code: 'authorization-code' });

        expect(response.status).to.equal(400);
        expect(response.body).to.contain('Missing OAuth state.');
    });

    it('returns 400 when neither code nor error is present', () => {
        const { responder, callbackService } = createResponder();
        const state = callbackService.createState();

        const response = responder.renderResponse({ state });

        expect(response.status).to.equal(400);
        expect(response.body).to.contain('Missing OAuth authorization code.');
    });

    it('returns 400 with the generic unknown-state message for an unknown state', () => {
        const { responder } = createResponder();

        const response = responder.renderResponse({ state: 'bogus-state', code: 'authorization-code' });

        expect(response.status).to.equal(400);
        expect(response.body).to.contain('Unknown or expired OAuth state.');
    });

    it('renders the remembered rejection message for a recently-cancelled state', () => {
        const { responder, callbackService } = createResponder();
        const state = callbackService.createState();
        callbackService.cancel(state, 'OAuth authorization was cancelled. You can close this tab.');

        const response = responder.renderResponse({ state, code: 'authorization-code' });

        expect(response.status).to.equal(400);
        expect(response.body).to.contain('OAuth authorization was cancelled. You can close this tab.');
    });

    it('dispatches a successful callback to the callback service and renders the done page', async () => {
        const { responder, callbackService } = createResponder();
        const state = callbackService.createState();
        const pending = callbackService.waitForCallback(state);

        const response = responder.renderResponse({ state, code: 'authorization-code' });

        expect(response.status).to.equal(200);
        expect(response.body).to.contain('All done. You can close this tab now.');
        const callback = await pending;
        expect(callback.code).to.equal('authorization-code');
    });

    it('reflects a sanitized, length-capped authorization-server error', () => {
        const { responder, callbackService } = createResponder();
        const state = callbackService.createState();
        // Put the HTML up front so it survives the 500-code-point truncation and we can assert escaping.
        const longDescription = `<script>alert('x')</script>${'a'.repeat(600)}`;

        const response = responder.renderResponse({ state, error: 'access_denied', errorDescription: longDescription });

        expect(response.status).to.equal(400);
        expect(response.body).to.not.contain('<script>');
        expect(response.body).to.contain('&lt;script&gt;');
        expect(response.body).to.contain('…');
        expect(response.body).to.not.contain('a'.repeat(501));
    });

    it('serves the locked-down security and cache headers on every response', () => {
        const { responder, callbackService } = createResponder();
        const state = callbackService.createState();
        callbackService.waitForCallback(state).catch(() => undefined);

        const response = responder.renderResponse({ state, code: 'authorization-code' });

        expect(response.headers['Content-Type']).to.equal('text/html; charset=utf-8');
        expect(response.headers['Content-Security-Policy']).to.equal("default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
        expect(response.headers['X-Content-Type-Options']).to.equal('nosniff');
        expect(response.headers['Referrer-Policy']).to.equal('no-referrer');
        expect(response.headers['Cache-Control']).to.equal('no-store');
    });
});
