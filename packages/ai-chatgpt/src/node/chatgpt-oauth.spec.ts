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
import { createHash } from 'crypto';
import {
    buildAuthorizationUrl, createPkcePair, parseAuthorizationInput, CHATGPT_CLIENT_ID, CHATGPT_SCOPE, CHATGPT_REDIRECT_URI, CHATGPT_RESOURCE, CHATGPT_TOKEN_URL
} from './chatgpt-oauth';
import { DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG } from './chatgpt-auth-service';

describe('ChatGPT OAuth helpers', () => {
    it('creates independent PKCE S256 pairs', () => {
        const { verifier, challenge } = createPkcePair();
        expect(challenge).to.equal(createHash('sha256').update(verifier).digest('base64url'));
        expect(createPkcePair().verifier).not.to.equal(verifier);
    });

    it('uses the OSS bootstrap, sharing scopes, host and application metadata with nonce', () => {
        const config = DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG;
        const url = new URL(buildAuthorizationUrl('challenge', 'state', {
            ...config, nonce: 'nonce', hostId: 'urn:uuid:76b748d4-539f-4b65-94e1-7d96f7f00b38'
        }));
        expect(url.origin + url.pathname).to.equal('https://auth.openai.com/api/accounts/authorize');
        expect(CHATGPT_CLIENT_ID).to.equal('dynamic_agent_client');
        expect(CHATGPT_TOKEN_URL).to.equal('https://auth.openai.com/api/accounts/oauth/token');
        expect(CHATGPT_SCOPE).to.equal('openid profile email offline_access resource.invoke chatgpt.tokens.use.direct');
        expect(Object.fromEntries(url.searchParams)).to.deep.equal({
            response_type: 'code', client_id: CHATGPT_CLIENT_ID, redirect_uri: CHATGPT_REDIRECT_URI,
            scope: CHATGPT_SCOPE, ext_agent_host_id: 'urn:uuid:76b748d4-539f-4b65-94e1-7d96f7f00b38',
            resource: CHATGPT_RESOURCE,
            code_challenge: 'challenge', code_challenge_method: 'S256', state: 'state', nonce: 'nonce',
            agent_name_hint: 'Theia'
        });
    });

    it('reuses a concrete registered client when reconnecting', () => {
        const url = new URL(buildAuthorizationUrl('challenge', 'state', {
            ...DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG, hostId: 'urn:uuid:76b748d4-539f-4b65-94e1-7d96f7f00b38', nonce: 'nonce',
            clientId: 'dynamic_agent_client_saved', redirectUri: 'http://127.0.0.1:2468/custom', idTokenHint: 'verified-id-token'
        }));
        expect(url.searchParams.get('client_id')).to.equal('dynamic_agent_client_saved');
        expect(url.searchParams.get('redirect_uri')).to.equal('http://127.0.0.1:2468/custom');
        expect(url.searchParams.get('id_token_hint')).to.equal('verified-id-token');
        expect(url.searchParams.has('agent_name_hint')).to.equal(false);
        expect(url.searchParams.get('resource')).to.equal('https://api.openai.com/v1');
    });

    it('extracts the callback code and concrete client id', () => {
        expect(parseAuthorizationInput(`${CHATGPT_REDIRECT_URI}?code=code&state=state&client_id=dynamic_agent_client_saved`, 'state'))
            .to.deep.equal({ code: 'code', clientId: 'dynamic_agent_client_saved' });
    });

    for (const input of [
        'code', '', `${CHATGPT_REDIRECT_URI}?code=code&state=state`,
        `${CHATGPT_REDIRECT_URI}?code=code&state=wrong&client_id=dynamic_agent_client_saved`,
        `${CHATGPT_REDIRECT_URI}?code=code&client_id=dynamic_agent_client_saved`,
        `${CHATGPT_REDIRECT_URI}?state=state&client_id=dynamic_agent_client_saved`,
        `${CHATGPT_REDIRECT_URI}?code=code&state=state&client_id=dynamic`,
        `${CHATGPT_REDIRECT_URI}?code=code&state=state&client_id=dynamic_agent_client`,
        `${CHATGPT_REDIRECT_URI}?code=code&state=state&client_id=bad%20client`,
        `${CHATGPT_REDIRECT_URI}?code=code&state=state&state=state&client_id=dynamic_agent_client_saved`,
        'https://evil.example/auth/callback?code=code&state=state&client_id=dynamic_agent_client_saved',
        'http://127.0.0.1:2468/auth/callback?code=code&state=state&client_id=dynamic_agent_client_saved'
    ]) {
        it(`rejects invalid authorization input: ${input}`, () => {
            expect(() => parseAuthorizationInput(input, 'state')).to.throw();
        });
    }

    it('uses the saved client id when a reauthorization callback omits it', () => {
        expect(parseAuthorizationInput(`${CHATGPT_REDIRECT_URI}?code=code&state=state`, 'state', CHATGPT_REDIRECT_URI, 'saved-client-id'))
            .to.deep.equal({ code: 'code', clientId: 'saved-client-id' });
    });

    it('accepts an opaque server-issued concrete client id without assuming a prefix', () => {
        expect(parseAuthorizationInput(`${CHATGPT_REDIRECT_URI}?code=code&state=state&client_id=app_issued`, 'state')?.clientId)
            .to.equal('app_issued');
    });

    it('accepts only state-verified access_denied callbacks', () => {
        expect(parseAuthorizationInput(`${CHATGPT_REDIRECT_URI}?error=access_denied&state=state`, 'state')).to.equal(undefined);
        for (const query of [
            'error=access_denied&state=wrong', 'error=access_denied', 'error=access_denied&state=state&state=state',
            'error=access_denied&state=state&error=access_denied', 'error=access_denied&state=state&code=code',
            'error=server_error&state=state'
        ]) {
            expect(() => parseAuthorizationInput(`${CHATGPT_REDIRECT_URI}?${query}`, 'state')).to.throw();
        }
    });

    it('rejects repeated client ids even during reconnect', () => {
        expect(() => parseAuthorizationInput(`${CHATGPT_REDIRECT_URI}?code=code&state=state&client_id=one&client_id=two`,
            'state', CHATGPT_REDIRECT_URI, 'one')).to.throw(/client_id/);
    });

    it('rejects a callback which would reconnect a different client', () => {
        expect(() => parseAuthorizationInput(`${CHATGPT_REDIRECT_URI}?code=code&state=state&client_id=dynamic_agent_client_other`,
            'state', CHATGPT_REDIRECT_URI, 'dynamic_agent_client_saved')).to.throw(/client id/);
    });
});
