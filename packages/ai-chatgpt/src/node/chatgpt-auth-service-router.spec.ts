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
import * as http from 'http';
import { Container } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core';
import { KeyStoreService } from '@theia/core/lib/common/key-store';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { ChatGptAuthServiceImpl } from './chatgpt-auth-service-impl';
import { ChatGptAuthServiceRouter } from './chatgpt-auth-service-router';
import { ChatGptAuthServiceConfig, DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG } from './chatgpt-auth-service';
import { ChatGptCodexAuthService, ChatGptCodexAuthServiceConfig } from './chatgpt-codex-auth-service';
import * as codex from './chatgpt-codex-oauth';
import { CHATGPT_SCOPE } from './chatgpt-oauth';

class TestCodexService extends ChatGptCodexAuthService {
    protected override async startCallbackServer(): Promise<http.Server | undefined> { return undefined; }
}

class TestOssService extends ChatGptAuthServiceImpl {
    protected override async startCallbackServer(): Promise<http.Server | undefined> { return undefined; }
    protected override async verifyIdToken(): Promise<{ subject: string }> { return { subject: 'oss-subject' }; }
}

function jwt(accountId = 'codex-account'): string {
    return `header.${Buffer.from(JSON.stringify({
        'https://api.openai.com/auth': { chatgpt_account_id: accountId, chatgpt_plan_type: 'plus' },
        'https://api.openai.com/profile': { email: 'codex@example.com' }
    })).toString('base64url')}.signature`;
}

function grant(extra: Record<string, unknown> = {}, status = 200): Response {
    return new Response(JSON.stringify({ access_token: jwt(), refresh_token: 'rotated-refresh', expires_in: 3600, ...extra }), { status });
}

async function flush(): Promise<void> { await new Promise(resolve => setImmediate(resolve)); }

async function rejects(promise: Promise<unknown>): Promise<void> {
    let error: unknown;
    try { await promise; } catch (caught) { error = caught; }
    expect(error).to.be.instanceOf(Error);
}

const OSS_REGISTRY = JSON.stringify({
    version: 3, activeClientId: 'issued-client', accounts: [{
        clientId: 'issued-client', subject: 'oss-subject',
        tokens: { accessToken: 'oss-token', refreshToken: 'oss-refresh', expiresAt: Date.now() + 3600_000, scope: CHATGPT_SCOPE, sessionId: 'oss-session' }
    }]
});

function legacy(expiresAt = Date.now() + 3600_000): string {
    return JSON.stringify({
        accessToken: jwt(), refreshToken: 'legacy-refresh', expiresAt, accountId: 'codex-account',
        accountLabel: 'codex@example.com', planType: 'plus'
    });
}

describe('ChatGPT authentication modes', () => {
    let container: Container;
    let router: ChatGptAuthServiceRouter;
    let secrets: Map<string, string>;
    let fetchStub: sinon.SinonStub;
    let setPassword: sinon.SinonStub;
    let codexService: TestCodexService;
    let ossService: TestOssService;

    beforeEach(() => {
        secrets = new Map();
        container = new Container();
        container.bind(ChatGptAuthServiceConfig).toConstantValue(DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG);
        container.bind(ChatGptCodexAuthServiceConfig).toConstantValue({
            ...DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG, clientId: codex.CHATGPT_CLIENT_ID, callbackHost: 'localhost', keyStoreAccount: 'default:codex'
        });
        setPassword = sinon.stub().callsFake(async (_service: string, account: string, value: string) => { secrets.set(account, value); });
        container.bind(KeyStoreService).toConstantValue({
            getPassword: async (_service: string, account: string) => secrets.get(account),
            setPassword, deletePassword: async (_service: string, account: string) => secrets.delete(account)
        } as unknown as KeyStoreService);
        container.bind(ILogger).to(MockLogger);
        container.bind(ChatGptCodexAuthService).to(TestCodexService).inSingletonScope();
        container.bind(ChatGptAuthServiceImpl).to(TestOssService).inSingletonScope();
        container.bind(ChatGptAuthServiceRouter).toSelf().inSingletonScope();
        codexService = container.get(ChatGptCodexAuthService) as TestCodexService;
        ossService = container.get(ChatGptAuthServiceImpl) as TestOssService;
        router = container.get(ChatGptAuthServiceRouter);
        fetchStub = sinon.stub(globalThis, 'fetch').resolves(grant());
    });

    afterEach(() => {
        codexService.suspend();
        ossService.suspend();
        sinon.restore();
    });

    it('defaults to HEAD Codex authorize, exchange and callback protocol', async () => {
        const login = await router.startLogin();
        const url = new URL(login.authorizationUrl);
        expect(url.origin + url.pathname).to.equal(codex.CHATGPT_AUTHORIZE_URL);
        expect(url.searchParams.get('client_id')).to.equal(codex.CHATGPT_CLIENT_ID);
        expect(url.searchParams.get('redirect_uri')).to.equal('http://localhost:1455/auth/callback');
        expect(url.searchParams.get('scope')).to.equal(codex.CHATGPT_SCOPE);
        expect(url.searchParams.has('resource')).to.equal(false);
        expect(url.searchParams.has('ext_agent_host_id')).to.equal(false);
        expect(await router.completeLogin('bare-code', login.loginId)).to.equal(true);
        expect(fetchStub.firstCall.args[0]).to.equal(codex.CHATGPT_TOKEN_URL);
        const body = fetchStub.firstCall.args[1].body as URLSearchParams;
        expect(body.get('code')).to.equal('bare-code');
        expect(body.get('client_id')).to.equal(codex.CHATGPT_CLIENT_ID);
        expect(body.has('resource')).to.equal(false);
        expect(body.get('redirect_uri')).to.equal('http://localhost:1455/auth/callback');
        expect(await router.getAuthState()).to.include({ isAuthenticated: true, planType: 'plus', accountLabel: 'codex@example.com' });
        expect(await router.getCredentials()).to.include({ authenticationMode: 'codex', accountId: 'codex-account' });
        expect(secrets.has('default')).to.equal(false);
    });

    it('imports legacy credentials without changing the old slot or sending them to OSS', async () => {
        const stored = legacy();
        secrets.set('default', stored);
        expect(await router.getCredentials()).to.include({ accessToken: jwt(), authenticationMode: 'codex' });
        expect(secrets.get('default')).to.equal(stored);
        expect(secrets.has('default:codex')).to.equal(true);
        await router.setAuthenticationMode('oss');
        expect(await router.getCredentials()).to.equal(undefined);
        expect(fetchStub.called).to.equal(false);
    });

    it('never imports an OSS registry into Codex and restores both sessions when switching back', async () => {
        secrets.set('default', OSS_REGISTRY);
        const login = await router.startLogin();
        expect(await router.getCredentials()).to.equal(undefined);
        await router.completeLogin('code', login.loginId);
        const oldCredentials = (await router.getCredentials())!;
        await router.setAuthenticationMode('oss');
        expect(await router.getCredentials()).to.include({ authenticationMode: 'oss', accessToken: 'oss-token' });
        expect(await router.getCredentials(oldCredentials.clientId, oldCredentials.sessionId)).to.equal(undefined);
        await router.setAuthenticationMode('codex');
        expect(await router.getCredentials()).to.include({ authenticationMode: 'codex', accessToken: jwt() });
        expect(await router.getCredentials(oldCredentials.clientId, oldCredentials.sessionId)).to.equal(undefined);
        expect(secrets.get('default')).to.equal(OSS_REGISTRY);
    });

    it('preserves saved legacy credentials before a first-start OSS login replaces the old slot', async () => {
        secrets.set('default', legacy());
        await router.setAuthenticationMode('oss');
        expect(secrets.has('default:codex')).to.equal(true);
        const login = await router.startLogin();
        fetchStub.resolves(grant({
            access_token: 'official-oss-token', scope: CHATGPT_SCOPE, token_type: 'Bearer', id_token: 'verified-by-test'
        }));
        const callback = `http://127.0.0.1:1455/auth/callback?state=${login.loginId}&code=code&client_id=issued-client`;
        expect(await router.completeLogin(callback, login.loginId)).to.equal(true);
        expect(await router.getCredentials()).to.include({ accessToken: 'official-oss-token', authenticationMode: 'oss' });
        await router.setAuthenticationMode('codex');
        expect(await router.getCredentials()).to.include({ accessToken: jwt(), accountId: 'codex-account' });
    });

    it('retains the official OSS bootstrap and loopback protocol when selected', async () => {
        await router.setAuthenticationMode('oss');
        const login = await router.startLogin();
        const url = new URL(login.authorizationUrl);
        expect(url.pathname).to.equal('/api/accounts/authorize');
        expect(url.searchParams.get('client_id')).to.equal('dynamic_agent_client');
        expect(url.searchParams.get('redirect_uri')).to.equal('http://127.0.0.1:1455/auth/callback');
        expect(url.searchParams.get('resource')).to.equal('https://api.openai.com/v1');
        expect(url.searchParams.get('ext_agent_host_id')).to.match(/^urn:uuid:/);
    });

    it('does not resurrect imported legacy credentials after signout and restart', async () => {
        secrets.set('default', legacy());
        await router.getCredentials();
        await router.signOut();
        container.rebind(ChatGptCodexAuthService).to(TestCodexService).inSingletonScope();
        codexService = container.get(ChatGptCodexAuthService) as TestCodexService;
        expect(await codexService.getCredentials()).to.equal(undefined);
        expect(fetchStub.called).to.equal(false);
    });

    it('refreshes legacy credentials only at the Codex token endpoint and keeps the account', async () => {
        secrets.set('default', legacy(Date.now() - 1));
        fetchStub.resolves(grant({ access_token: 'opaque-refreshed-token' }));
        expect(await router.getCredentials()).to.include({ accessToken: 'opaque-refreshed-token', accountId: 'codex-account' });
        expect(fetchStub.firstCall.args[0]).to.equal(codex.CHATGPT_TOKEN_URL);
        const body = fetchStub.firstCall.args[1].body as URLSearchParams;
        expect(body.get('refresh_token')).to.equal('legacy-refresh');
        expect(body.has('resource')).to.equal(false);
        expect(JSON.parse(secrets.get('default:codex')!).accounts[0].tokens.refreshToken).to.equal('rotated-refresh');
    });

    it('disconnects only Codex on a spent refresh token', async () => {
        secrets.set('default', legacy(Date.now() - 1));
        await router.getAuthState();
        secrets.set('default', OSS_REGISTRY);
        fetchStub.resolves(grant({ error: 'invalid_grant' }, 400));
        await rejects(router.getCredentials());
        expect((await router.getAuthState()).isAuthenticated).to.equal(false);
        await router.setAuthenticationMode('oss');
        expect(await router.getCredentials()).to.include({ accessToken: 'oss-token' });
    });

    it('preserves Codex credentials on temporary refresh failures', async () => {
        secrets.set('default', legacy(Date.now() - 1));
        fetchStub.resolves(grant({ error: 'invalid_client' }, 429));
        await rejects(router.getCredentials());
        expect((await router.getAuthState()).isAuthenticated).to.equal(true);
    });

    it('cancels an in-flight login exchange without publishing or persisting it on a mode switch', async () => {
        const response = new Deferred<Response>();
        fetchStub.returns(response.promise);
        const login = await router.startLogin();
        const result = router.completeLogin('code', login.loginId);
        await flush();
        await router.setAuthenticationMode('oss');
        response.resolve(grant());
        expect(await result).to.equal(false);
        expect(await router.waitForLogin(login.loginId)).to.equal(false);
        await router.setAuthenticationMode('codex');
        expect(await router.getCredentials()).to.equal(undefined);
        expect(secrets.has('default:codex')).to.equal(false);
    });

    it('rolls back a tentative login write when the mode changes during persistence', async () => {
        const writing = new Deferred<void>();
        const finish = new Deferred<void>();
        setPassword.callsFake(async (_service: string, account: string, value: string) => {
            writing.resolve();
            await finish.promise;
            secrets.set(account, value);
        });
        const login = await router.startLogin();
        const result = router.completeLogin('code', login.loginId);
        await writing.promise;
        const switched = router.setAuthenticationMode('oss');
        finish.resolve();
        await switched;
        expect(await result).to.equal(false);
        expect(secrets.has('default:codex')).to.equal(false);
    });

    it('persists inactive Codex refresh rotation without delivering credentials to a switched request', async () => {
        secrets.set('default', legacy(Date.now() - 1));
        await router.getAuthState();
        secrets.set('default', OSS_REGISTRY);
        const response = new Deferred<Response>();
        fetchStub.returns(response.promise);
        const credentials = router.getCredentials();
        await flush();
        await router.setAuthenticationMode('oss');
        response.resolve(grant());
        expect(await credentials).to.equal(undefined);
        expect(await router.getCredentials()).to.include({ accessToken: 'oss-token' });
        expect(JSON.parse(secrets.get('default:codex')!).accounts[0].tokens.refreshToken).to.equal('rotated-refresh');
        await router.setAuthenticationMode('codex');
        expect(await router.getCredentials()).to.include({ accessToken: jwt() });
    });

    it('allows replacing the single legacy account under the fixed OAuth client', async () => {
        secrets.set('default', legacy());
        await router.getCredentials();
        fetchStub.resolves(grant({ access_token: jwt('replacement-account') }));
        const login = await router.startLogin();
        expect(await router.completeLogin('code', login.loginId)).to.equal(true);
        expect(await router.getCredentials()).to.include({ accountId: 'replacement-account' });
    });
});
