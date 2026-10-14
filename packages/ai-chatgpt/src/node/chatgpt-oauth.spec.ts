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
    buildAuthorizationUrl,
    createPkcePair,
    decodeChatGptIdentity,
    parseAuthorizationInput,
    CHATGPT_CLIENT_ID,
    CHATGPT_ORIGINATOR,
    CHATGPT_REDIRECT_URI
} from './chatgpt-oauth';

function encodeJwt(payload: Record<string, unknown>): string {
    return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

describe('ChatGPT OAuth helpers', () => {

    describe('createPkcePair', () => {
        it('derives the challenge as the base64url encoded SHA-256 of the verifier', () => {
            const { verifier, challenge } = createPkcePair();
            expect(challenge).to.equal(createHash('sha256').update(verifier).digest('base64url'));
        });

        it('creates a new verifier on each call', () => {
            expect(createPkcePair().verifier).to.not.equal(createPkcePair().verifier);
        });
    });

    describe('buildAuthorizationUrl', () => {
        it('requests an authorization code for the ChatGPT client using PKCE', () => {
            const url = new URL(buildAuthorizationUrl('challenge', 'state'));
            expect(url.origin + url.pathname).to.equal('https://auth.openai.com/oauth/authorize');
            expect(url.searchParams.get('response_type')).to.equal('code');
            expect(url.searchParams.get('client_id')).to.equal(CHATGPT_CLIENT_ID);
            expect(url.searchParams.get('redirect_uri')).to.equal(CHATGPT_REDIRECT_URI);
            expect(url.searchParams.get('scope')).to.equal('openid profile email offline_access');
            expect(url.searchParams.get('code_challenge')).to.equal('challenge');
            expect(url.searchParams.get('code_challenge_method')).to.equal('S256');
            expect(url.searchParams.get('state')).to.equal('state');
        });

        it('identifies Theia as the client instead of an OpenAI first party client', () => {
            const url = new URL(buildAuthorizationUrl('challenge', 'state'));
            expect(CHATGPT_ORIGINATOR).to.equal('theia');
            expect(url.searchParams.get('originator')).to.equal(CHATGPT_ORIGINATOR);
            expect(url.searchParams.has('codex_cli_simplified_flow')).to.be.false;
        });
    });

    describe('parseAuthorizationInput', () => {
        it('accepts a bare authorization code', () => {
            expect(parseAuthorizationInput('  the-code  ', 'state')).to.equal('the-code');
        });

        it('extracts the code from a redirect URL', () => {
            expect(parseAuthorizationInput(`${CHATGPT_REDIRECT_URI}?code=the-code&state=state`, 'state')).to.equal('the-code');
        });

        it('rejects a redirect URL with a mismatching state', () => {
            expect(() => parseAuthorizationInput(`${CHATGPT_REDIRECT_URI}?code=the-code&state=other`, 'state')).to.throw(/state/);
        });

        it('rejects a redirect URL without a state', () => {
            expect(() => parseAuthorizationInput(`${CHATGPT_REDIRECT_URI}?code=the-code`, 'state')).to.throw(/state/);
        });

        it('rejects a URL that is not the sign in callback', () => {
            expect(() => parseAuthorizationInput('https://evil.example.com/auth?code=the-code&state=state', 'state')).to.throw(/callback/);
        });

        it('rejects a redirect URL without a code', () => {
            expect(() => parseAuthorizationInput(`${CHATGPT_REDIRECT_URI}?state=state`, 'state')).to.throw(/authorization code/);
        });

        it('rejects empty input', () => {
            expect(() => parseAuthorizationInput('   ', 'state')).to.throw(/authorization code/);
        });
    });

    describe('decodeChatGptIdentity', () => {
        it('reads the account, plan and email from the token claims', () => {
            const identity = decodeChatGptIdentity(encodeJwt({
                exp: 1700000000,
                'https://api.openai.com/auth': { chatgpt_account_id: 'account-id', chatgpt_plan_type: 'plus' },
                'https://api.openai.com/profile': { email: 'user@example.com' }
            }));
            expect(identity.accountId).to.equal('account-id');
            expect(identity.planType).to.equal('plus');
            expect(identity.email).to.equal('user@example.com');
            expect(identity.expiresAt).to.equal(1700000000000);
        });

        it('returns an empty identity for tokens that are no readable JWT', () => {
            expect(decodeChatGptIdentity('not-a-jwt')).to.deep.equal({});
            expect(decodeChatGptIdentity('header.not-json.signature')).to.deep.equal({});
        });
    });
});
