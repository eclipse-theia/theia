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
import { generateKeyPairSync, sign } from 'crypto';
import * as sinon from 'sinon';
import { ChatGptIdTokenVerifier, CHATGPT_ISSUER } from './chatgpt-id-token';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const clientId = 'dynamic_agent_client_test';

function token(claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}, wrongSignature = false): string {
    const now = Math.floor(Date.now() / 1000);
    const encodedHeader = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'trusted-key', ...header })).toString('base64url');
    const encodedClaims = Buffer.from(JSON.stringify({
        iss: CHATGPT_ISSUER, aud: clientId, sub: 'subject', exp: now + 3600, iat: now,
        nonce: 'nonce', email: 'user@example.com', name: 'User', ...claims
    })).toString('base64url');
    const input = `${encodedHeader}.${encodedClaims}`;
    return `${input}.${sign('RSA-SHA256', Buffer.from(input), wrongSignature ? otherKeys.privateKey : keys.privateKey).toString('base64url')}`;
}

async function rejected(promise: Promise<unknown>): Promise<void> {
    let error: unknown;
    try {
        await promise;
    } catch (caught) {
        error = caught;
    }
    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.match(/could not be verified/);
}

describe('ChatGPT native ID-token verifier', () => {
    let fetchStub: sinon.SinonStub;
    let verifier: ChatGptIdTokenVerifier;

    beforeEach(() => {
        verifier = new ChatGptIdTokenVerifier();
        fetchStub = sinon.stub(globalThis, 'fetch');
        fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ issuer: CHATGPT_ISSUER, jwks_uri: `${CHATGPT_ISSUER}/jwks` }) });
        fetchStub.onSecondCall().resolves({
            ok: true, json: async () => ({
                keys: [{ ...keys.publicKey.export({ format: 'jwk' }), kid: 'trusted-key', use: 'sig', alg: 'RS256' }]
            })
        });
    });

    afterEach(() => sinon.restore());

    it('verifies a generated RSA signature and binds issuer, client audience, nonce and subject', async () => {
        expect(await verifier.verify(token(), clientId, 'nonce')).to.deep.equal({ subject: 'subject', email: 'user@example.com', name: 'User' });
        await verifier.verify(token(), clientId, 'nonce');
        expect(fetchStub.callCount).to.equal(2);
        expect(fetchStub.firstCall.args[0]).to.equal(`${CHATGPT_ISSUER}/.well-known/openid-configuration`);
        expect(fetchStub.secondCall.args[0]).to.equal(`${CHATGPT_ISSUER}/jwks`);
        expect(fetchStub.firstCall.args[1].redirect).to.equal('error');
    });

    for (const claims of [
        { iss: 'https://evil.example' }, { aud: 'dynamic_agent_client_other' }, { exp: 1 },
        { iat: Math.floor(Date.now() / 1000) + 3600 }, { iat: '123' }, { exp: '123' },
        { nonce: 'wrong' }, { nonce: undefined }, { sub: '' }, { sub: undefined },
        { azp: 'another-client' }, { aud: [clientId, 'another-client'] },
        { nbf: Math.floor(Date.now() / 1000) + 3600 }, { nbf: '123' }
    ]) {
        it(`rejects invalid identity claims ${JSON.stringify(claims)}`, async () => {
            await rejected(verifier.verify(token(claims), clientId, 'nonce'));
        });
    }

    it('accepts a single audience encoded as an array without requiring azp', async () => {
        expect((await verifier.verify(token({ aud: [clientId] }), clientId, 'nonce')).subject).to.equal('subject');
    });

    it('accepts multiple audiences only when azp binds this concrete client', async () => {
        expect((await verifier.verify(token({ aud: [clientId, 'another-client'], azp: clientId }), clientId, 'nonce')).subject).to.equal('subject');
    });

    it('rejects signatures made by a different RSA key', async () => {
        await rejected(verifier.verify(token({}, {}, true), clientId, 'nonce'));
    });

    for (const header of [{ alg: 'none' }, { alg: 'HS256' }, { kid: 'unknown' }, { crit: ['jku'] }]) {
        it(`rejects unsupported signing headers ${JSON.stringify(header)}`, async () => {
            await rejected(verifier.verify(token({}, header), clientId, 'nonce'));
        });
    }

    it('reloads trusted signing keys after key rotation', async () => {
        await verifier.verify(token(), clientId, 'nonce');
        fetchStub.onThirdCall().resolves({ ok: true, json: async () => ({ issuer: CHATGPT_ISSUER, jwks_uri: `${CHATGPT_ISSUER}/jwks` }) });
        fetchStub.onCall(3).resolves({
            ok: true, json: async () => ({
                keys: [{ ...keys.publicKey.export({ format: 'jwk' }), kid: 'rotated-key', use: 'sig', alg: 'RS256' }]
            })
        });
        expect((await verifier.verify(token({}, { kid: 'rotated-key' }), clientId, 'nonce')).subject).to.equal('subject');
        expect(fetchStub.callCount).to.equal(4);
    });

    it('does not follow token-supplied key URLs', async () => {
        await verifier.verify(token({}, { jku: 'https://evil.example/keys', x5u: 'https://evil.example/cert' }), clientId, 'nonce');
        expect(fetchStub.callCount).to.equal(2);
        expect(fetchStub.getCalls().every(call => call.args[0].startsWith(CHATGPT_ISSUER))).to.equal(true);
    });

    it('rejects discovery key URLs outside the trusted issuer', async () => {
        fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ issuer: CHATGPT_ISSUER, jwks_uri: 'https://evil.example/keys' }) });
        await rejected(verifier.verify(token(), clientId, 'nonce'));
        expect(fetchStub.calledOnce).to.equal(true);
    });

    it('rejects a discovery document for another issuer', async () => {
        fetchStub.onFirstCall().resolves({ ok: true, json: async () => ({ issuer: 'https://evil.example', jwks_uri: `${CHATGPT_ISSUER}/jwks` }) });
        await rejected(verifier.verify(token(), clientId, 'nonce'));
        expect(fetchStub.calledOnce).to.equal(true);
    });

    it('exposes a cached trusted discovery revocation endpoint without guessing its path', async () => {
        fetchStub.onFirstCall().resolves({
            ok: true, json: async () => ({
                issuer: CHATGPT_ISSUER, jwks_uri: `${CHATGPT_ISSUER}/jwks`, revocation_endpoint: `${CHATGPT_ISSUER}/discovered/revoke`
            })
        });
        expect(await verifier.getRevocationEndpoint()).to.equal(`${CHATGPT_ISSUER}/discovered/revoke`);
        await verifier.verify(token(), clientId, 'nonce');
        expect(await verifier.getRevocationEndpoint()).to.equal(`${CHATGPT_ISSUER}/discovered/revoke`);
        expect(fetchStub.callCount).to.equal(2);
    });

    it('does not invent a revocation endpoint when discovery omits it', async () => {
        expect(await verifier.getRevocationEndpoint()).to.equal(undefined);
        expect(fetchStub.calledOnce).to.equal(true);
    });

    for (const endpoint of ['https://evil.example/revoke', 'http://auth.openai.com/revoke', 'https://user@auth.openai.com/revoke']) {
        it(`rejects untrusted discovery revocation endpoint ${endpoint}`, async () => {
            fetchStub.onFirstCall().resolves({
                ok: true, json: async () => ({
                    issuer: CHATGPT_ISSUER, jwks_uri: `${CHATGPT_ISSUER}/jwks`, revocation_endpoint: endpoint
                })
            });
            await rejected(verifier.verify(token(), clientId, 'nonce'));
            expect(fetchStub.calledOnce).to.equal(true);
        });
    }

    it('retries failed key discovery rather than caching rejection', async () => {
        fetchStub.onFirstCall().rejects(new Error('network'));
        await rejected(verifier.verify(token(), clientId, 'nonce'));
        fetchStub.onSecondCall().resolves({ ok: true, json: async () => ({ issuer: CHATGPT_ISSUER, jwks_uri: `${CHATGPT_ISSUER}/jwks` }) });
        fetchStub.onThirdCall().resolves({ ok: true, json: async () => ({ keys: [{ ...keys.publicKey.export({ format: 'jwk' }), kid: 'trusted-key' }] }) });
        expect((await verifier.verify(token(), clientId, 'nonce')).subject).to.equal('subject');
    });
});
