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
import { ChatGptAuthServiceImpl } from './chatgpt-auth-service-impl';
import { ChatGptModelCatalog } from './chatgpt-model-catalog';
import { CHATGPT_ORIGINATOR } from './chatgpt-oauth';

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
        { slug: 'gpt-5.6-sol', supported_in_api: true, visibility: 'list' },
        { slug: 'gpt-5.5', supported_in_api: true, visibility: 'list' },
        { slug: 'gpt-5.5-internal', supported_in_api: true, visibility: 'hidden' },
        { slug: 'gpt-image-2', supported_in_api: false, visibility: 'list' },
        { supported_in_api: true, visibility: 'list' }
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
        credentials = { accessToken: 'the-token', accountId: 'account-id' };
        credentialsError = undefined;
        authStateEmitter = new Emitter<ChatGptAuthState>();

        const container = new Container();
        container.bind(ChatGptAuthServiceImpl).toConstantValue({
            getCredentials: async () => {
                if (credentialsError) {
                    throw credentialsError;
                }
                return credentials;
            },
            onAuthStateChanged: authStateEmitter.event
        } as unknown as ChatGptAuthServiceImpl);
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

    it('identifies the client and the account of the listing request', async () => {
        fetchStub.resolves(listing(MODELS));
        await catalog.getAvailableModels();

        const url = new URL(fetchStub.firstCall.args[0]);
        expect(url.origin + url.pathname).to.equal('https://chatgpt.com/backend-api/codex/models');
        expect(url.searchParams.get('client_version')).to.have.length.greaterThan(0);

        const { headers } = fetchStub.firstCall.args[1];
        expect(headers.Authorization).to.equal('Bearer the-token');
        expect(headers['chatgpt-account-id']).to.equal('account-id');
        expect(headers.originator).to.equal(CHATGPT_ORIGINATOR);
    });

    it('offers the built-in models while nobody is signed in', async () => {
        credentials = undefined;

        expect(await catalog.getAvailableModels()).to.deep.equal(CHATGPT_FALLBACK_MODELS);
        expect(fetchStub.called).to.equal(false);
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

        fetchStub.resolves(listing({ models: [{ slug: 'gpt-5.5-pro', supported_in_api: true, visibility: 'list' }] }));
        authStateEmitter.fire({ isAuthenticated: true, accountLabel: 'other@example.com' });

        expect(await catalog.getAvailableModels()).to.deep.equal(['gpt-5.5-pro']);
    });

    it('does not serve the models of the account that was replaced while they were listed', async () => {
        let respond: (response: Response) => void = () => { };
        fetchStub.returns(new Promise<Response>(resolve => { respond = resolve; }));

        const listed = catalog.getAvailableModels();
        await waitFor(() => fetchStub.called);
        authStateEmitter.fire({ isAuthenticated: true, accountLabel: 'other@example.com' });
        fetchStub.resolves(listing({ models: [{ slug: 'gpt-5.5-pro', supported_in_api: true, visibility: 'list' }] }));
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
