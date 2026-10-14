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
import * as sinon from 'sinon';
import { Emitter } from '@theia/core';
import { ILogger } from '@theia/core/lib/common/logger';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Container } from '@theia/core/shared/inversify';
import { CHATGPT_FALLBACK_MODELS, ChatGptAuthState, ChatGptCredentials } from '../common';
import { ChatGptBackendAuthService } from './chatgpt-auth-service';
import { ChatGptModelCatalog } from './chatgpt-model-catalog';

function listing(payload: Record<string, unknown>, status: number = 200): Response {
    return {
        ok: status < 400,
        status,
        json: async () => payload,
        text: async () => JSON.stringify(payload)
    } as Response;
}

const MODELS = {
    models: [
        { slug: 'gpt-5.6-sol', family: 'codex_models', visibility: 'list' },
        { slug: 'gpt-5.5', family: 'codex_models', visibility: 'list' },
        { slug: 'gpt-5.5-internal', family: 'codex_models', visibility: 'hidden' },
        { slug: 'gpt-image-2', family: 'image_models', visibility: 'hidden' },
        { family: 'codex_models', visibility: 'list' }
    ]
};

async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
        await new Promise(resolve => setImmediate(resolve));
    }
}

describe('ChatGptModelCatalog', () => {

    let catalog: ChatGptModelCatalog;
    let credentials: ChatGptCredentials | undefined;
    let credentialsError: Error | undefined;
    let authStateEmitter: Emitter<ChatGptAuthState>;
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        credentials = { accessToken: 'the-token', clientId: 'dynamic_agent_client_test' };
        credentialsError = undefined;
        authStateEmitter = new Emitter<ChatGptAuthState>();

        const container = new Container();
        container.bind(ChatGptBackendAuthService).toConstantValue({
            getCredentials: async () => {
                if (credentialsError) {
                    throw credentialsError;
                }
                return credentials;
            },
            getAuthState: async () => ({ isAuthenticated: credentials !== undefined }),
            onAuthStateChanged: authStateEmitter.event
        } as unknown as ChatGptBackendAuthService);
        container.bind(ILogger).to(MockLogger).inSingletonScope();
        container.bind(ChatGptModelCatalog).toSelf().inSingletonScope();
        catalog = container.get(ChatGptModelCatalog);

        fetchStub = sinon.stub(globalThis, 'fetch');
    });

    afterEach(() => {
        sinon.restore();
    });

    it('lists the models the signed in account may request', async () => {
        fetchStub.resolves(listing(MODELS));

        expect(await catalog.getAvailableModels()).to.deep.equal(['gpt-5.6-sol', 'gpt-5.5']);
    });

    it('lists public models with only the OAuth bearer credential', async () => {
        fetchStub.resolves(listing(MODELS));
        await catalog.getAvailableModels();

        const url = new URL(fetchStub.firstCall.args[0]);
        expect(url.toString()).to.equal('https://api.openai.com/v1/models');
        const { headers, redirect } = fetchStub.firstCall.args[1];
        expect(headers).to.deep.equal({ Authorization: 'Bearer the-token' });
        expect(redirect).to.equal('error');
    });

    it('routes Codex discovery and filters the legacy API capability field', async () => {
        credentials = { accessToken: 'codex-token', clientId: 'codex-client', authenticationMode: 'codex', accountId: 'account' };
        fetchStub.resolves(listing({
            models: [
                { slug: 'codex-visible', visibility: 'list', supported_in_api: true },
                { slug: 'not-supported', visibility: 'list', supported_in_api: false },
                { slug: 'no-capability', visibility: 'list' },
                { slug: 'hidden', visibility: 'hidden', supported_in_api: true }
            ]
        }));
        expect(await catalog.getAvailableModels()).to.deep.equal(['codex-visible']);
        const url = new URL(fetchStub.firstCall.args[0]);
        expect(url.origin + url.pathname).to.equal('https://chatgpt.com/backend-api/codex/models');
        expect(url.searchParams.get('client_version')).to.equal('1.0.0');
        expect(fetchStub.firstCall.args[1].headers).to.deep.equal({
            Authorization: 'Bearer codex-token', 'chatgpt-account-id': 'account', originator: 'theia'
        });
    });

    it('discards a Codex listing while switching to the OSS account', async () => {
        credentials = { accessToken: 'codex-token', clientId: 'codex-client', authenticationMode: 'codex', accountId: 'account' };
        let finish: (response: Response) => void = () => { };
        fetchStub.returns(new Promise<Response>(resolve => { finish = resolve; }));
        const result = catalog.getAvailableModels();
        await waitFor(() => fetchStub.called);
        credentials = { accessToken: 'oss-token', clientId: 'oss-client', authenticationMode: 'oss' };
        authStateEmitter.fire({ isAuthenticated: false });
        fetchStub.resolves(listing({ models: [{ slug: 'oss-model', visibility: 'list' }] }));
        finish(listing({ models: [{ slug: 'codex-model', visibility: 'list', supported_in_api: true }] }));
        expect(await result).to.deep.equal(['oss-model']);
        expect(fetchStub.secondCall.args[0]).to.equal('https://api.openai.com/v1/models');
        expect(fetchStub.secondCall.args[1].headers).to.deep.equal({ Authorization: 'Bearer oss-token' });
    });

    it('offers no models while nobody is signed in', async () => {
        credentials = undefined;

        expect(await catalog.getAvailableModels()).to.deep.equal([]);
        expect(fetchStub.called).to.equal(false);
    });

    it('clears a cached listing when the account signs out', async () => {
        fetchStub.resolves(listing(MODELS));
        await catalog.getAvailableModels();
        credentials = undefined;
        authStateEmitter.fire({ isAuthenticated: false });

        expect(await catalog.getAvailableModels()).to.deep.equal([]);
        expect(fetchStub.calledOnce).to.equal(true);
    });

    it('does not offer a stale listing or fallback after signing out during discovery', async () => {
        let respond: (response: Response) => void = () => { };
        fetchStub.returns(new Promise<Response>(resolve => { respond = resolve; }));
        const models = catalog.getAvailableModels();
        await waitFor(() => fetchStub.called);
        credentials = undefined;
        authStateEmitter.fire({ isAuthenticated: false });
        respond(listing(MODELS));

        expect(await models).to.deep.equal([]);
        expect(fetchStub.calledOnce).to.equal(true);
    });

    it('offers the built-in models when the listing is rejected', async () => {
        fetchStub.resolves(listing({ error: 'unsupported client' }, 400));

        expect(await catalog.getAvailableModels()).to.deep.equal(CHATGPT_FALLBACK_MODELS);
    });

    it('offers the built-in models when the response is not a model listing', async () => {
        fetchStub.resolves(listing({ object: 'list' }));

        expect(await catalog.getAvailableModels()).to.deep.equal(CHATGPT_FALLBACK_MODELS);
    });

    it('offers the built-in models when the credentials cannot be refreshed', async () => {
        credentialsError = new Error('The ChatGPT session has expired.');

        expect(await catalog.getAvailableModels()).to.deep.equal(CHATGPT_FALLBACK_MODELS);
        expect(fetchStub.called).to.equal(false);
    });

    it('does not manufacture models from an empty successful listing', async () => {
        fetchStub.resolves(listing({ models: [] }));
        expect(await catalog.getAvailableModels()).to.deep.equal([]);
        fetchStub.resolves(listing(MODELS));
        expect(await catalog.getAvailableModels()).to.deep.equal(['gpt-5.6-sol', 'gpt-5.5']);
    });

    for (const status of [401, 403, 429]) {
        it(`does not offer fallback models after HTTP ${status}`, async () => {
            fetchStub.resolves(listing({ error: 'unavailable' }, status));
            expect(await catalog.getAvailableModels()).to.deep.equal([]);
            fetchStub.resolves(listing(MODELS));
            expect(await catalog.getAvailableModels()).to.deep.equal(['gpt-5.6-sol', 'gpt-5.5']);
        });
    }

    it('offers no models for an identity-only session', async () => {
        Object.assign(catalog, {
            authService: {
                getAuthState: async () => ({ isAuthenticated: true, canUseChatGptPlan: false }),
                getCredentials: async () => credentials
            }
        });
        expect(await catalog.getAvailableModels()).to.deep.equal([]);
        expect(fetchStub.called).to.equal(false);
    });

    it('preserves the displayed catalog order without requiring family metadata and removes duplicate slugs', async () => {
        fetchStub.resolves(listing({
            models: [
                ...MODELS.models, { slug: 'gpt-5.5', family: 'codex_models', visibility: 'list' },
                { slug: 'gpt-other', family: 'text_models', visibility: 'list' }
            ]
        }));
        expect(await catalog.getAvailableModels()).to.deep.equal(['gpt-5.6-sol', 'gpt-5.5', 'gpt-other']);
    });

    it('selects displayed models without requiring undocumented capability fields', async () => {
        fetchStub.resolves(listing({
            models: [{ slug: 'gpt-5.5', visibility: 'list' }, { slug: 'gpt-hidden', visibility: 'hidden' },
            { slug: 'gpt-unspecified' }, { slug: 'gpt-unknown', visibility: 'unknown' }]
        }));
        expect(await catalog.getAvailableModels()).to.deep.equal(['gpt-5.5']);
    });

    it('requests the listing once and serves it to later callers', async () => {
        fetchStub.resolves(listing(MODELS));

        const [first, second] = await Promise.all([catalog.getAvailableModels(), catalog.getAvailableModels()]);
        expect(second).to.deep.equal(first);
        expect(await catalog.getAvailableModels()).to.deep.equal(first);
        expect(fetchStub.calledOnce).to.equal(true);
    });

    it('lists the models again once a different account is signed in', async () => {
        fetchStub.resolves(listing(MODELS));
        await catalog.getAvailableModels();

        fetchStub.resolves(listing({ models: [{ slug: 'gpt-5.5-pro', family: 'codex_models', visibility: 'list' }] }));
        authStateEmitter.fire({ isAuthenticated: true, accountLabel: 'other@example.com' });

        expect(await catalog.getAvailableModels()).to.deep.equal(['gpt-5.5-pro']);
    });

    it('does not serve the models of the account that was replaced while they were listed', async () => {
        let respond: (response: Response) => void = () => { };
        fetchStub.returns(new Promise<Response>(resolve => { respond = resolve; }));

        const listed = catalog.getAvailableModels();
        await waitFor(() => fetchStub.called);
        authStateEmitter.fire({ isAuthenticated: true, accountLabel: 'other@example.com' });
        fetchStub.resolves(listing({ models: [{ slug: 'gpt-5.5-pro', family: 'codex_models', visibility: 'list' }] }));
        respond(listing(MODELS));

        expect(await listed).to.deep.equal(['gpt-5.5-pro']);
    });

    it('keeps the listing of the current account when the one of a former account fails', async () => {
        let fail: (error: Error) => void = () => { };
        fetchStub.returns(new Promise<Response>((resolve, reject) => { fail = reject; }));

        const stale = catalog.getAvailableModels();
        await waitFor(() => fetchStub.called);
        authStateEmitter.fire({ isAuthenticated: true, accountLabel: 'other@example.com' });
        fetchStub.resolves(listing(MODELS));
        expect(await catalog.getAvailableModels()).to.deep.equal(['gpt-5.6-sol', 'gpt-5.5']);

        fail(new Error('the connection was reset'));
        expect(await stale).to.deep.equal(['gpt-5.6-sol', 'gpt-5.5']);

        expect(await catalog.getAvailableModels()).to.deep.equal(['gpt-5.6-sol', 'gpt-5.5']);
        expect(fetchStub.callCount).to.equal(2);
    });

    it('retries a listing that failed instead of serving the built-in models for good', async () => {
        fetchStub.resolves(listing({}, 503));
        expect(await catalog.getAvailableModels()).to.deep.equal(CHATGPT_FALLBACK_MODELS);

        fetchStub.resolves(listing(MODELS));
        expect(await catalog.getAvailableModels()).to.deep.equal(['gpt-5.6-sol', 'gpt-5.5']);
    });
});
