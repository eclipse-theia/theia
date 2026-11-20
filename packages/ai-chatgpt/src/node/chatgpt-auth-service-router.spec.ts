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
import { ChatGptAuthServiceImpl, createRemoteAuthService } from './chatgpt-auth-service-impl.js';
import { ChatGptAuthServiceRouter } from './chatgpt-auth-service-router.js';
import { ChatGptAuthServiceConfig, DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG } from './chatgpt-auth-service.js';
import { ChatGptCodexAuthService, ChatGptCodexAuthServiceConfig } from './chatgpt-codex-auth-service.js';
import * as codex from './chatgpt-codex-oauth.js';
import { CHATGPT_SCOPE } from './chatgpt-oauth.js';

class TestCodexService extends ChatGptCodexAuthService {
    protected override async startCallbackServer(): Promise<http.Server | undefined> { return undefined; }
}

class TestOssService extends ChatGptAuthServiceImpl {
    protected override async getRevocationEndpoint(): Promise<string | undefined> { return undefined; }
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

const OSS_SESSION = JSON.stringify({
    version: 1, account: {
        clientId: 'issued-client', subject: 'oss-subject',
        tokens: { accessToken: 'oss-token', refreshToken: 'oss-refresh', expiresAt: Date.now() + 3600_000, scope: CHATGPT_SCOPE, sessionId: 'oss-session' }
    }
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

    it('keeps mode selection on the backend router, not per-mode services or the RPC facade', () => {
        expect(router.setAuthenticationMode).to.be.a('function');
        for (const service of [codexService, ossService, createRemoteAuthService(router)]) {
            expect((service as unknown as Record<string, unknown>).setAuthenticationMode).to.equal(undefined);
        }
    });

    it('defaults to the released Codex authorize, exchange and callback protocol', async () => {
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
        expect(JSON.parse(secrets.get('default')!)).to.deep.equal({ version: 1 });
    });

    it('imports legacy credentials without changing the old slot or sending them to OSS', async () => {
        const stored = legacy();
        secrets.set('default', stored);
        await router.setAuthenticationMode('codex');
        expect(await router.getCredentials()).to.include({ accessToken: jwt(), authenticationMode: 'codex' });
        expect(secrets.get('default')).to.equal(stored);
        expect(JSON.parse(secrets.get('default:codex')!).version).to.equal(1);
        await router.setAuthenticationMode('oss');
        expect(await router.getCredentials()).to.equal(undefined);
        expect(fetchStub.called).to.equal(false);
    });

    it('never imports versioned records even if they contain legacy credential fields', async () => {
        const stored = JSON.stringify({ ...JSON.parse(legacy()), version: 1 });
        secrets.set('default', stored);
        expect(await router.getCredentials()).to.equal(undefined);
        expect(secrets.get('default')).to.equal(stored);
        expect(secrets.has('default:codex')).to.equal(false);
        expect(setPassword.called).to.equal(false);
        expect(fetchStub.called).to.equal(false);
    });

    it('restores only the initial mode and never restores a former mode after switching away and back', async () => {
        secrets.set('default', OSS_SESSION);
        expect(await codexService.getCredentials()).to.equal(undefined);
        await router.setAuthenticationMode('oss');
        const old = (await router.getCredentials())!;
        expect(old).to.include({ authenticationMode: 'oss', accessToken: 'oss-token' });
        await router.setAuthenticationMode('codex');
        expect(JSON.parse(secrets.get('default')!)).to.deep.equal({ version: 1 });
        expect(await router.getCredentials()).to.equal(undefined);
        await router.setAuthenticationMode('oss');
        expect(await router.getCredentials()).to.equal(undefined);
        expect(await router.getCredentials(old.clientId, old.sessionId)).to.equal(undefined);
    });

    it('clears released legacy credentials before first OSS login and leaves a no-import tombstone', async () => {
        secrets.set('default', legacy());
        await router.setAuthenticationMode('oss');
        expect(JSON.parse(secrets.get('default:codex')!)).to.deep.equal({ version: 1 });
        const login = await router.startLogin();
        fetchStub.resolves(grant({
            access_token: 'official-oss-token', scope: CHATGPT_SCOPE, token_type: 'Bearer', id_token: 'verified-by-test'
        }));
        const callback = `http://127.0.0.1:1455/auth/callback?state=${login.loginId}&code=code&client_id=issued-client`;
        expect(await router.completeLogin(callback, login.loginId)).to.equal(true);
        await router.setAuthenticationMode('codex');
        expect(await router.getCredentials()).to.equal(undefined);
        expect(JSON.parse(secrets.get('default')!)).to.deep.equal({ version: 1 });
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
        expect(JSON.parse(secrets.get('default:codex')!).account.tokens.refreshToken).to.equal('rotated-refresh');
    });

    it('disconnects only Codex on a spent refresh token', async () => {
        secrets.set('default', legacy(Date.now() - 1));
        await router.getAuthState();
        secrets.set('default', OSS_SESSION);
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
        expect(JSON.parse(secrets.get('default:codex')!)).to.deep.equal({ version: 1 });
    });

    it('rolls back a tentative login write when the mode changes during persistence', async () => {
        const login = await router.startLogin();
        const writing = new Deferred<void>();
        const finish = new Deferred<void>();
        setPassword.callsFake(async (_service: string, account: string, value: string) => {
            writing.resolve();
            await finish.promise;
            secrets.set(account, value);
        });
        const result = router.completeLogin('code', login.loginId);
        await writing.promise;
        const switched = router.setAuthenticationMode('oss');
        finish.resolve();
        await switched;
        expect(await result).to.equal(false);
        expect(JSON.parse(secrets.get('default:codex')!)).to.deep.equal({ version: 1 });
    });

    it('discards inactive refresh rotation after a mode switch and does not restore it', async () => {
        secrets.set('default', legacy(Date.now() - 1));
        const response = new Deferred<Response>();
        fetchStub.returns(response.promise);
        const credentials = router.getCredentials();
        for (let i = 0; i < 100 && !fetchStub.called; i++) { await flush(); }
        expect(fetchStub.called).to.equal(true);
        await router.setAuthenticationMode('oss');
        response.resolve(grant());
        expect(await credentials).to.equal(undefined);
        expect(JSON.parse(secrets.get('default:codex')!)).to.deep.equal({ version: 1 });
        await router.setAuthenticationMode('codex');
        expect(await router.getCredentials()).to.equal(undefined);
    });

    it('rejects replacing a signed-in Codex account until explicit logout', async () => {
        secrets.set('default', legacy());
        await router.getCredentials();
        await rejects(router.startLogin());
        await router.signOut();
        fetchStub.resolves(grant({ access_token: jwt('replacement-account') }));
        const login = await router.startLogin();
        expect(await router.completeLogin('code', login.loginId)).to.equal(true);
        expect(await router.getCredentials()).to.include({ accountId: 'replacement-account' });
    });

    it('serializes rapid OSS to Codex to OSS transitions before a new login', async () => {
        const identityOnly = JSON.parse(OSS_SESSION);
        identityOnly.account.tokens.scope = 'openid';
        secrets.set('default', JSON.stringify(identityOnly));
        await router.setAuthenticationMode('oss');
        const old = await router.startLogin();
        const writing = new Deferred<void>();
        const finish = new Deferred<void>();
        setPassword.onCall(setPassword.callCount).callsFake(async (_service: string, account: string, value: string) => {
            writing.resolve(); await finish.promise; secrets.set(account, value);
        });
        const toCodex = router.setAuthenticationMode('codex');
        await writing.promise;
        const toOss = router.setAuthenticationMode('oss');
        const starting = router.startLogin();
        expect(await ossService.waitForLogin(old.loginId)).to.equal(false);
        finish.resolve();
        await Promise.all([toCodex, toOss]);
        const current = await starting;
        expect(current.loginId).not.to.equal(old.loginId);
        expect(await router.waitForLogin(old.loginId)).to.equal(false);
        await router.cancelLogin(old.loginId);
        expect(await ossService.completeLogin('ignored', old.loginId)).to.equal(false);
        expect(await router.getCredentials()).to.equal(undefined);
    });

    it('waits for an old-mode load and durable logout before allowing a new-mode login', async () => {
        const reading = new Deferred<string | undefined>();
        const keyStore = container.get<KeyStoreService>(KeyStoreService);
        const getPassword = sinon.stub(keyStore, 'getPassword').callsFake(async (_service: string, account: string) => secrets.get(account));
        getPassword.onFirstCall().returns(reading.promise);
        const old = router.getCredentials();
        for (let i = 0; i < 100 && !getPassword.called; i++) { await flush(); }
        expect(getPassword.called).to.equal(true);
        const switched = router.setAuthenticationMode('oss');
        let started = false;
        const starting = router.startLogin().then(login => { started = true; return login; });
        await flush();
        expect(started).to.equal(false);
        secrets.set('default', legacy());
        reading.resolve(undefined);
        await switched;
        await starting;
        expect(await old).to.equal(undefined);
        expect(JSON.parse(secrets.get('default:codex')!)).to.deep.equal({ version: 1 });
        expect(await router.getCredentials()).to.equal(undefined);
    });

    it('serializes logout before a concurrent replacement login', async () => {
        secrets.set('default', legacy());
        const old = (await router.getCredentials())!;
        const writing = new Deferred<void>();
        const finish = new Deferred<void>();
        setPassword.onCall(setPassword.callCount).callsFake(async (_service: string, account: string, value: string) => {
            writing.resolve(); await finish.promise; secrets.set(account, value);
        });
        const signingOut = router.signOut();
        await writing.promise;
        let started = false;
        const starting = router.startLogin().then(session => { started = true; return session; });
        await flush();
        expect(started).to.equal(false);
        expect(await router.getCredentials(old.clientId, old.sessionId)).to.equal(undefined);
        finish.resolve();
        await signingOut;
        const login = await starting;
        fetchStub.resolves(grant({ access_token: jwt('replacement-account') }));
        expect(await router.completeLogin('code', login.loginId)).to.equal(true);
        expect(await router.getCredentials()).to.include({ accountId: 'replacement-account' });
    });

    it('blocks new-mode login and credentials if the former mode cannot durably sign out', async () => {
        secrets.set('default', legacy());
        await router.getCredentials();
        setPassword.rejects(new Error('local persistence failure'));
        await rejects(router.setAuthenticationMode('oss'));
        await rejects(router.startLogin());
        await rejects(router.getCredentials());
        expect(fetchStub.called).to.equal(false);
    });

    for (const action of ['signout', 'mode-change']) {
        it(`retries a failed ${action} before allowing another login`, async () => {
            secrets.set('default', legacy());
            await router.getCredentials();
            setPassword.rejects(new Error('local persistence failure'));
            await rejects(action === 'signout' ? router.signOut() : router.setAuthenticationMode('oss'));
            await rejects(router.startLogin());
            expect(fetchStub.called).to.equal(false);
            expect(JSON.parse(secrets.get('default:codex')!).account).to.exist;

            setPassword.callsFake(async (_service: string, account: string, value: string) => { secrets.set(account, value); });
            const login = await router.startLogin();
            expect(JSON.parse(secrets.get('default:codex')!)).to.deep.equal({ version: 1 });
            expect(new URL(login.authorizationUrl).searchParams.get('client_id'))
                .to.equal(action === 'signout' ? codex.CHATGPT_CLIENT_ID : 'dynamic_agent_client');
            expect(await router.getCredentials()).to.equal(undefined);
        });
    }

    it('retries a failed previous-mode logout even when changing modes again', async () => {
        const stored = legacy();
        secrets.set('default', stored);
        await router.getCredentials();
        setPassword.rejects(new Error('local persistence failure'));
        await rejects(router.setAuthenticationMode('oss'));
        setPassword.callsFake(async (_service: string, account: string, value: string) => { secrets.set(account, value); });
        await router.setAuthenticationMode('codex');
        expect(JSON.parse(secrets.get('default:codex')!)).to.deep.equal({ version: 1 });
        expect(secrets.get('default')).to.equal(stored);
        expect(await router.getCredentials()).to.equal(undefined);
    });

    for (const prepare of ['mode-selection', 'login']) {
        it(`clears a former OSS session after failed logout and restart before ${prepare}`, async () => {
            secrets.set('default', OSS_SESSION);
            await router.setAuthenticationMode('oss');
            expect(await router.getCredentials()).to.include({ accessToken: 'oss-token' });
            setPassword.rejects(new Error('local persistence failure'));
            await rejects(router.setAuthenticationMode('codex'));
            expect(JSON.parse(secrets.get('default')!).account.tokens.accessToken).to.equal('oss-token');

            container.rebind(ChatGptAuthServiceImpl).to(TestOssService).inSingletonScope();
            container.rebind(ChatGptCodexAuthService).to(TestCodexService).inSingletonScope();
            container.rebind(ChatGptAuthServiceRouter).toSelf().inSingletonScope();
            ossService = container.get(ChatGptAuthServiceImpl) as TestOssService;
            codexService = container.get(ChatGptCodexAuthService) as TestCodexService;
            router = container.get(ChatGptAuthServiceRouter);
            setPassword.callsFake(async (_service: string, account: string, value: string) => { secrets.set(account, value); });
            if (prepare === 'mode-selection') {
                await router.setAuthenticationMode('codex');
                expect(JSON.parse(secrets.get('default')!)).to.deep.equal({ version: 1 });
            }
            const login = await router.startLogin();
            expect(JSON.parse(secrets.get('default')!)).to.deep.equal({ version: 1 });
            expect(await router.completeLogin('new-code', login.loginId)).to.equal(true);
            expect(await router.getCredentials()).to.include({ authenticationMode: 'codex' });
            await router.setAuthenticationMode('oss');
            expect(await router.getCredentials()).to.equal(undefined);
            expect((await router.getAuthState()).isAuthenticated).to.equal(false);
        });
    }

    it('cancels only the old login when its delayed startup outlives a mode switch', async () => {
        const startup = new Deferred<http.Server | undefined>();
        const listener = sinon.stub(codexService as unknown as { startCallbackServer(): Promise<http.Server | undefined> }, 'startCallbackServer');
        listener.returns(startup.promise);
        const old = rejects(router.startLogin());
        for (let i = 0; i < 100 && !listener.called; i++) { await flush(); }
        expect(listener.called).to.equal(true);
        await router.setAuthenticationMode('oss');
        const current = await router.startLogin();
        startup.resolve(undefined);
        await old;
        fetchStub.resolves(grant({ access_token: 'oss-token', scope: CHATGPT_SCOPE, token_type: 'Bearer', id_token: 'verified' }));
        expect(await router.completeLogin(
            `http://127.0.0.1:1455/auth/callback?state=${current.loginId}&code=code&client_id=issued-client`, current.loginId
        )).to.equal(true);
    });
});
