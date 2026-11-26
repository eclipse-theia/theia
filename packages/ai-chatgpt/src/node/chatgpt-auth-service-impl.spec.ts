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
import http from 'http';
import { syncBuiltinESMExports } from 'module';
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { KeyStoreService } from '@theia/core/lib/common/key-store';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { ChatGptAuthState } from '../common/index.js';
import { ChatGptAuthServiceImpl, createRemoteAuthService } from './chatgpt-auth-service-impl.js';
import { CHATGPT_REDIRECT_URI, CHATGPT_SCOPE, CHATGPT_TOKEN_URL, CHATGPT_RESOURCE } from './chatgpt-oauth.js';
import { ChatGptAuthServiceConfig, DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG } from './chatgpt-auth-service.js';
import { VerifiedChatGptIdentity } from './chatgpt-id-token.js';

const FIRST = 'dynamic_agent_client_first';
const SECOND = 'dynamic_agent_client_second';
const HOST_ACCOUNT = 'default:agent-host';
const HOST_ID = 'urn:uuid:76b748d4-539f-4b65-94e1-7d96f7f00b38';
const REVOKE_URL = 'https://auth.openai.com/discovered/revoke';

/** Native signature verification is exercised separately with generated RSA keys. */
class TestAuthService extends ChatGptAuthServiceImpl {
    callbackServerStartup: Promise<http.Server | undefined> | undefined;
    verifyIdentity = sinon.stub().callsFake(async (token: string) => JSON.parse(token));
    revocationEndpoint = sinon.stub().resolves(REVOKE_URL);
    protected override getRevocationEndpoint(): Promise<string | undefined> {
        return this.revocationEndpoint();
    }
    protected override async startCallbackServer(): Promise<http.Server | undefined> {
        return this.callbackServerStartup;
    }
    protected override verifyIdToken(token: string, clientId: string, nonce?: string): Promise<VerifiedChatGptIdentity> {
        return this.verifyIdentity(token, clientId, nonce);
    }
    waitForCurrentLogin(): Promise<boolean> {
        return super.waitForLogin(this.pendingState ?? '');
    }
    completeCurrentLogin(input: string): Promise<boolean> {
        return super.completeLogin(input, this.pendingState ?? '');
    }
    cancelCurrentLogin(): Promise<void> {
        return super.cancelLogin(this.pendingState ?? '');
    }
    get pendingState(): string | undefined { return this.pendingLogin?.state; }
    get pendingNonce(): string | undefined { return this.pendingLogin?.nonce; }
    callback(clientId = FIRST, code = 'code', redirectUri = CHATGPT_REDIRECT_URI): string {
        return `${redirectUri}?code=${code}&state=${this.pendingState}&client_id=${clientId}`;
    }
    callCallback(url: string): CallbackResponse {
        const response = new CallbackResponse();
        this.handleCallbackRequest(this.pendingLogin!, { url } as http.IncomingMessage, response as unknown as http.ServerResponse);
        return response;
    }
}

class CallbackResponse {
    statusCode = 0;
    body: string | undefined;
    setHeader(): void { }
    end(body: string): void { this.body = body; }
}

function tokenResponse(payload: Record<string, unknown>, status = 200): Response {
    return { ok: status < 400, status, json: async () => payload } as Response;
}

function grant(subject = 'first-subject', extra: Record<string, unknown> = {}): Response {
    return tokenResponse({
        access_token: 'opaque-token', refresh_token: 'refresh-token', expires_in: 3600,
        token_type: 'Bearer', scope: CHATGPT_SCOPE,
        id_token: JSON.stringify({ subject, email: 'user@example.com' }), ...extra
    });
}

function storedSession(expiresAt = Date.now() + 3600_000, scope = CHATGPT_SCOPE): string {
    return JSON.stringify({
        version: 1, account: {
            clientId: FIRST, subject: 'first-subject', accountLabel: 'user@example.com',
            idTokenHint: JSON.stringify({ subject: 'first-subject' }),
            tokens: { accessToken: 'stored-token', refreshToken: 'stored-refresh', expiresAt, scope, sessionId: 'first-session' }
        }
    });
}

async function expectRejection(promise: Promise<unknown>, message: RegExp): Promise<void> {
    let error: unknown;
    try { await promise; } catch (caught) { error = caught; }
    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.match(message);
}

async function flush(): Promise<void> {
    await new Promise(resolve => setImmediate(resolve));
}

async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
        await flush();
    }
    expect(condition(), 'expected asynchronous operation to start').to.equal(true);
}

describe('ChatGptAuthServiceImpl token sharing', () => {
    let service: TestAuthService;
    let container: Container;
    let secrets: Map<string, string>;
    let getPassword: sinon.SinonStub;
    let setPassword: sinon.SinonStub;
    let deletePassword: sinon.SinonStub;
    let fetchStub: sinon.SinonStub;

    function instantiate(config = DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG): TestAuthService {
        container.rebind(ChatGptAuthServiceConfig).toConstantValue(config);
        container.rebind(TestAuthService).toSelf().inSingletonScope();
        return container.get(TestAuthService);
    }

    function persisted(): {
        account?: {
            clientId: string; subject: string; idTokenHint?: string;
            tokens?: { accessToken: string; refreshToken?: string; scope: string; sessionId: string };
        }
    } {
        return JSON.parse(secrets.get('default')!);
    }

    beforeEach(() => {
        secrets = new Map([[HOST_ACCOUNT, HOST_ID]]);
        getPassword = sinon.stub().callsFake(async (_service: string, account: string) => secrets.get(account));
        setPassword = sinon.stub().callsFake(async (_service: string, account: string, value: string) => { secrets.set(account, value); });
        deletePassword = sinon.stub().callsFake(async (_service: string, account: string) => secrets.delete(account));
        container = new Container();
        container.bind(ChatGptAuthServiceConfig).toConstantValue(DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG);
        container.bind(KeyStoreService).toConstantValue({
            getPassword, setPassword, deletePassword, findPassword: sinon.stub(), findCredentials: sinon.stub(), keys: sinon.stub()
        } as unknown as KeyStoreService);
        container.bind(ILogger).to(MockLogger).inSingletonScope();
        container.bind(TestAuthService).toSelf().inSingletonScope();
        service = container.get(TestAuthService);
        fetchStub = sinon.stub(globalThis, 'fetch').resolves(grant());
    });

    afterEach(async () => {
        await service.cancelCurrentLogin();
        sinon.restore();
        syncBuiltinESMExports();
    });

    describe('configuration and host identity', () => {
        it('uses configured callback, metadata and key store identifiers', async () => {
            const config = {
                ...DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG, agentName: 'Custom',
                callbackPort: 2468, callbackPath: '/custom/callback', keyStoreService: 'custom', keyStoreAccount: 'custom-account'
            };
            service = instantiate(config);
            const session = await service.startLogin();
            const url = new URL(session.authorizationUrl);
            const redirectUri = 'http://127.0.0.1:2468/custom/callback';
            expect(url.searchParams.get('client_id')).to.equal('dynamic_agent_client');
            expect(url.searchParams.get('redirect_uri')).to.equal(redirectUri);
            expect(url.searchParams.get('agent_name_hint')).to.equal('Custom');
            await expectRejection(service.completeCurrentLogin(service.callback()), /callback/);
            expect(await service.completeCurrentLogin(service.callback(FIRST, 'code', redirectUri))).to.equal(true);
            expect((fetchStub.firstCall.args[1].body as URLSearchParams).get('redirect_uri')).to.equal(redirectUri);
            expect(setPassword.lastCall.args.slice(0, 2)).to.deep.equal(['custom', 'custom-account']);
        });

        for (const override of [
            { callbackHost: 'localhost' }, { callbackHost: '::1' }, { callbackHost: '0.0.0.0' }, { callbackHost: 'remote.example' }, { callbackPort: 0 }, { callbackPort: 65536 },
            { callbackPath: '/callback?bad' }, { agentName: '' }
        ]) {
            it(`rejects unsafe configuration ${JSON.stringify(override)}`, async () => {
                service = instantiate({ ...DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG, ...override });
                await expectRejection(service.startLogin(), /configuration|HTTPS/);
                expect(fetchStub.called).to.equal(false);
            });
        }

        it('persists a host id once and retains it across restart and signout', async () => {
            secrets.delete(HOST_ACCOUNT);
            const first = new URL((await service.startLogin()).authorizationUrl).searchParams.get('ext_agent_host_id');
            expect(first).to.match(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
            await service.completeCurrentLogin(service.callback());
            await service.signOut();
            service = instantiate();
            const second = new URL((await service.startLogin()).authorizationUrl).searchParams.get('ext_agent_host_id');
            expect(second).to.equal(first);
            expect(setPassword.getCalls().filter(call => call.args[1] === HOST_ACCOUNT)).to.have.lengthOf(1);
            expect(secrets.get(HOST_ACCOUNT)).to.equal(first);
        });

        it('reuses an existing host UUID URI without rewriting it', async () => {
            expect(new URL((await service.startLogin()).authorizationUrl).searchParams.get('ext_agent_host_id')).to.equal(HOST_ID);
            expect(setPassword.called).to.equal(false);
        });

        it('coalesces host creation while concurrent login starts replace each other', async () => {
            secrets.delete(HOST_ACCOUNT);
            const hostWrite = new Deferred<void>();
            setPassword.callsFake(async (_service: string, account: string, value: string) => {
                if (account === HOST_ACCOUNT) { await hostWrite.promise; }
                secrets.set(account, value);
            });
            const first = expectRejection(service.startLogin(), /cancelled/);
            await waitFor(() => setPassword.called);
            const second = service.startLogin();
            hostWrite.resolve();
            await first;
            expect((await second).authorizationUrl).to.contain('ext_agent_host_id=');
            expect(setPassword.calledOnce).to.equal(true);
        });

        it('binds the real listener only to the configured loopback host and port', async () => {
            const server = {
                once: sinon.stub(), listen: sinon.stub().callsFake((_port: number, _host: string, listening: () => void) => listening()),
                close: sinon.stub(), closeAllConnections: sinon.stub()
            };
            // The named exports of ES modules cannot be stubbed, but those of built-in modules can be synchronized
            // with changes of the module object, which is their default export.
            sinon.stub(http, 'createServer').returns(server as unknown as http.Server);
            syncBuiltinESMExports();
            container.bind(ChatGptAuthServiceImpl).toSelf();
            const actual = container.get(ChatGptAuthServiceImpl);
            const login = await actual.startLogin();
            try {
                expect(login.callbackListening).to.equal(true);
                expect(server.listen.firstCall.args.slice(0, 2)).to.deep.equal([1455, '127.0.0.1']);
            } finally { await actual.cancelLogin(login.loginId); }
        });
    });

    describe('pending callback startup', () => {
        it('closes a late listener after cancellation without arming a timeout', async () => {
            const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
            const late = { close: sinon.stub(), closeAllConnections: sinon.stub() };
            const startup = new Deferred<http.Server>();
            service.callbackServerStartup = startup.promise;
            const starting = expectRejection(service.startLogin(), /cancelled/);
            await flush();
            const result = service.waitForCurrentLogin();
            await service.cancelCurrentLogin();
            startup.resolve(late as unknown as http.Server);
            await starting;
            expect(await result).to.equal(false);
            expect(late.close.calledOnce).to.equal(true);
            expect(late.closeAllConnections.calledOnce).to.equal(true);
            expect(clock.countTimers()).to.equal(0);
        });

        it('closes a replaced listener without closing or timing out the current attempt', async () => {
            const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
            const stale = { close: sinon.stub(), closeAllConnections: sinon.stub() };
            const current = { close: sinon.stub(), closeAllConnections: sinon.stub() };
            const startup = new Deferred<http.Server>();
            service.callbackServerStartup = startup.promise;
            const first = expectRejection(service.startLogin(), /cancelled/);
            await flush();
            const result = service.waitForCurrentLogin();
            service.callbackServerStartup = Promise.resolve(current as unknown as http.Server);
            await service.startLogin();
            const state = service.pendingState;
            startup.resolve(stale as unknown as http.Server);
            await first;
            expect(await result).to.equal(false);
            expect(stale.close.calledOnce).to.equal(true);
            expect(current.close.called).to.equal(false);
            expect(service.pendingState).to.equal(state);
            expect(clock.countTimers()).to.equal(1);
            await service.cancelCurrentLogin();
            expect(clock.countTimers()).to.equal(0);
        });
    });

    describe('session loading', () => {
        it('rejects unsupported session versions without using or deleting their secrets', async () => {
            const parsed = JSON.parse(storedSession());
            parsed.version = 2;
            const oldSession = JSON.stringify(parsed);
            secrets.set('default', oldSession);
            expect(await service.getCredentials()).to.equal(undefined);
            expect(fetchStub.called).to.equal(false);
            expect(setPassword.called).to.equal(false);
            expect(deletePassword.called).to.equal(false);
            expect(secrets.get('default')).to.equal(oldSession);
        });

        for (const stored of ['not-json', '{}', JSON.stringify({ accessToken: 'legacy', refreshToken: 'legacy-refresh', accountId: 'legacy', expiresAt: Date.now() + 3600_000 })]) {
            it(`rejects incompatible stored data without deleting it: ${stored}`, async () => {
                secrets.set('default', stored);
                expect((await service.getAuthState()).isAuthenticated).to.equal(false);
                expect(await service.getCredentials()).to.equal(undefined);
                expect(fetchStub.called).to.equal(false);
                expect(deletePassword.called).to.equal(false);
                expect(setPassword.called).to.equal(false);
                expect(secrets.get('default')).to.equal(stored);
            });
        }

        it('rejects malformed sessions and unreleased registries', async () => {
            for (const stored of [
                { ...JSON.parse(storedSession()), version: 3 },
                { version: 1, accounts: [], activeClientId: FIRST },
                { version: 1, account: { clientId: FIRST, subject: ' ' } },
                { version: 1, account: { ...JSON.parse(storedSession()).account, tokens: { accessToken: ' ' } } }
            ]) {
                secrets.set('default', JSON.stringify(stored));
                service = instantiate();
                expect(await service.getCredentials()).to.equal(undefined);
            }
        });

        it('coalesces concurrent key store reads', async () => {
            const reading = new Deferred<string>();
            getPassword.onFirstCall().returns(reading.promise);
            const first = service.getCredentials();
            const second = service.getCredentials();
            await flush();
            expect(getPassword.calledOnce).to.equal(true);
            reading.resolve(storedSession());
            expect(await first).to.include({ accessToken: 'stored-token', clientId: FIRST });
            expect(await second).to.deep.equal(await first);
        });

        it('does not republish a load which completes after signout', async () => {
            const reading = new Deferred<string>();
            getPassword.onFirstCall().returns(reading.promise);
            const credentials = service.getCredentials();
            await waitFor(() => getPassword.called);
            const signingOut = service.signOut();
            secrets.set('default', storedSession());
            reading.resolve(secrets.get('default')!);
            expect(await credentials).to.equal(undefined);
            await signingOut;
            expect((await service.getAuthState()).isAuthenticated).to.equal(false);
            expect(persisted().account?.tokens).to.equal(undefined);
        });

        it('cancels a login waiting for the session without publishing old credentials', async () => {
            const reading = new Deferred<string>();
            getPassword.onFirstCall().returns(reading.promise);
            const starting = expectRejection(service.startLogin(), /cancelled/);
            await waitFor(() => getPassword.called);
            const signingOut = service.signOut();
            secrets.set('default', storedSession());
            reading.resolve(secrets.get('default')!);
            await starting;
            await signingOut;
            expect(await service.getCredentials()).to.equal(undefined);
            expect(fetchStub.getCalls().filter(call => call.args[0] === CHATGPT_TOKEN_URL)).to.have.lengthOf(0);
        });
    });

    describe('login and account lifecycle', () => {
        it('exchanges with the callback client id and verifies the nonce, never the opaque access token', async () => {
            const states: ChatGptAuthState[] = [];
            service.addClient({ onAuthStateChanged: state => states.push(state) });
            const session = await service.startLogin();
            const nonce = service.pendingNonce;
            expect(session.callbackListening).to.equal(false);
            expect(await service.completeCurrentLogin(service.callback())).to.equal(true);
            const body = fetchStub.firstCall.args[1].body as URLSearchParams;
            expect(body.get('client_id')).to.equal(FIRST);
            expect(body.get('grant_type')).to.equal('authorization_code');
            expect(body.get('code_verifier')).to.be.a('string').and.not.empty;
            expect(body.get('redirect_uri')).to.equal(CHATGPT_REDIRECT_URI);
            expect(body.get('resource')).to.equal(new URL(session.authorizationUrl).searchParams.get('resource'));
            expect(body.get('resource')).to.equal(CHATGPT_RESOURCE);
            expect(fetchStub.firstCall.args[0]).to.equal('https://auth.openai.com/api/accounts/oauth/token');
            expect([...body.keys()].sort()).to.deep.equal(['client_id', 'code', 'code_verifier', 'grant_type', 'redirect_uri', 'resource']);
            expect(JSON.parse(secrets.get('default')!).version).to.equal(1);
            expect(persisted().account!.tokens?.accessToken).to.equal('opaque-token');
            expect(service.verifyIdentity.firstCall.args.slice(1)).to.deep.equal([FIRST, nonce]);
            expect(states).to.have.lengthOf(1);
            expect(states[0]).to.include({ isAuthenticated: true, accountLabel: 'user@example.com', canUseChatGptPlan: true });
            expect(await service.getCredentials()).to.include({ accessToken: 'opaque-token', clientId: FIRST });
        });

        it('rejects bare codes, wrong states and missing callback client ids before contacting the endpoint', async () => {
            await service.startLogin();
            await expectRejection(service.completeCurrentLogin('bare-code'), /full authorization/);
            await expectRejection(service.completeCurrentLogin(`${CHATGPT_REDIRECT_URI}?code=code&state=wrong&client_id=${FIRST}`), /state/);
            await expectRejection(service.completeCurrentLogin(`${CHATGPT_REDIRECT_URI}?code=code&state=${service.pendingState}`), /client[_ ]id/);
            expect(fetchStub.called).to.equal(false);
        });

        it('rejects missing or unverified ID tokens and mismatched profile subjects', async () => {
            for (const response of [grant('first-subject', { id_token: undefined }), grant('first-subject', { profile: { subject: 'other' } })]) {
                fetchStub.resolves(response);
                await service.startLogin();
                await expectRejection(service.completeCurrentLogin(service.callback()), /ID token|profile/);
            }
            service.verifyIdentity.rejects(new Error('signature mismatch with secret details'));
            fetchStub.resolves(grant());
            await service.startLogin();
            await expectRejection(service.completeCurrentLogin(service.callback()), /^The ChatGPT sign in could not be completed\.$/);
            expect(setPassword.called).to.equal(false);
        });

        it('discards a login cancelled while its ID token is being verified', async () => {
            const identity = new Deferred<VerifiedChatGptIdentity>();
            service.verifyIdentity.returns(identity.promise);
            await service.startLogin();
            const signingIn = service.completeCurrentLogin(service.callback());
            await waitFor(() => service.verifyIdentity.called);
            await service.cancelCurrentLogin();
            identity.resolve({ subject: 'first-subject' });
            expect(await signingIn).to.equal(false);
            expect(setPassword.called).to.equal(false);
        });

        it('supports a login without a refresh token', async () => {
            fetchStub.resolves(grant('first-subject', { refresh_token: undefined }));
            await service.startLogin();
            expect(await service.completeCurrentLogin(service.callback())).to.equal(true);
            expect(await service.getCredentials()).to.include({ accessToken: 'opaque-token', clientId: FIRST });
            expect(persisted().account!.tokens?.refreshToken).to.equal(undefined);
        });

        for (const fields of [{ expires_in: '3600' }, { expires_in: -1 }, { scope: undefined }, { token_type: 'MAC' }, { access_token: ' ' }]) {
            it(`rejects invalid token grant fields ${JSON.stringify(fields)}`, async () => {
                fetchStub.resolves(grant('first-subject', fields));
                await service.startLogin();
                await expectRejection(service.completeCurrentLogin(service.callback()), /usable token set/);
                expect(setPassword.called).to.equal(false);
            });
        }

        for (const expiresAt of [Math.floor(Date.now() / 1000) + 3600, Date.now() + 3600_000, new Date(Date.now() + 3600_000).toISOString()]) {
            it(`accepts absolute access-token expiry ${expiresAt}`, async () => {
                fetchStub.resolves(grant('first-subject', { expires_in: undefined, expires_at: expiresAt }));
                await service.startLogin();
                await service.completeCurrentLogin(service.callback());
                expect(await service.getCredentials()).to.include({ accessToken: 'opaque-token', clientId: FIRST });
                expect(fetchStub.firstCall.args[0]).to.equal('https://auth.openai.com/api/accounts/oauth/token');
                expect(fetchStub.calledOnce).to.equal(true);
            });
        }

        it('uses profile metadata when the verified ID token has no display label', async () => {
            fetchStub.resolves(grant('first-subject', {
                id_token: JSON.stringify({ subject: 'first-subject' }),
                profile: { sub: 'first-subject', email: 'profile@example.com' }
            }));
            await service.startLogin();
            await service.completeCurrentLogin(service.callback());
            expect((await service.getAuthState()).accountLabel).to.equal('profile@example.com');
        });

        it('reconnects a saved client when its callback omits client_id', async () => {
            secrets.set('default', storedSession(undefined, 'openid'));
            await service.startLogin();
            const url = new URL(service.callback());
            url.searchParams.delete('client_id');
            expect(await service.completeCurrentLogin(url.toString())).to.equal(true);
            expect((fetchStub.firstCall.args[1].body as URLSearchParams).get('client_id')).to.equal(FIRST);
        });

        it('distinguishes login from plan-use permission using the returned scope', async () => {
            fetchStub.resolves(grant('first-subject', { scope: 'openid profile email' }));
            await service.startLogin();
            await service.completeCurrentLogin(service.callback());
            expect(await service.getAuthState()).to.include({ isAuthenticated: true, canUseChatGptPlan: false });
            await expectRejection(service.getCredentials(), /token sharing is not enabled/);
            expect(fetchStub.calledOnce).to.equal(true);
        });

        it('rejects replacing an authenticated account until explicit logout', async () => {
            secrets.set('default', storedSession());
            await expectRejection(service.startLogin(), /Sign out/);
            expect(fetchStub.called).to.equal(false);
            expect(persisted().account!.subject).to.equal('first-subject');
        });

        it('forgets registration and hint on logout so a different subject can bootstrap', async () => {
            secrets.set('default', storedSession());
            await service.signOut();
            expect(persisted()).to.deep.equal({ version: 1 });
            const url = new URL((await service.startLogin()).authorizationUrl);
            expect(url.searchParams.get('client_id')).to.equal('dynamic_agent_client');
            expect(url.searchParams.has('id_token_hint')).to.equal(false);
            fetchStub.resolves(grant('second-subject'));
            expect(await service.completeCurrentLogin(service.callback(SECOND))).to.equal(true);
            expect(persisted().account!.subject).to.equal('second-subject');
            expect(persisted().account!.clientId).to.equal(SECOND);
        });

        it('rejects a different subject during same-registration reauthorization', async () => {
            secrets.set('default', storedSession(undefined, 'openid'));
            fetchStub.resolves(grant('other-subject'));
            await service.startLogin();
            await expectRejection(service.completeCurrentLogin(service.callback()), /could not be completed/);
            expect(persisted().account!.subject).to.equal('first-subject');
        });

        it('coalesces duplicate callback exchanges', async () => {
            const response = new Deferred<Response>();
            fetchStub.returns(response.promise);
            await service.startLogin();
            const input = service.callback();
            const first = service.completeCurrentLogin(input);
            const second = service.completeCurrentLogin(input);
            await flush();
            expect(fetchStub.calledOnce).to.equal(true);
            response.resolve(grant());
            expect(await first).to.equal(true);
            expect(await second).to.equal(true);
        });

        it('does not publish a session which could not be persisted', async () => {
            await service.startLogin();
            setPassword.rejects(new Error('secret key store details'));
            await expectRejection(service.completeCurrentLogin(service.callback()), /could not be completed/);
            expect((await service.getAuthState()).isAuthenticated).to.equal(false);
        });

        it('discards a login cancelled during token exchange', async () => {
            const response = new Deferred<Response>();
            fetchStub.returns(response.promise);
            await service.startLogin();
            const signingIn = service.completeCurrentLogin(service.callback());
            await waitFor(() => fetchStub.called);
            await service.cancelCurrentLogin();
            response.resolve(grant());
            expect(await signingIn).to.equal(false);
            expect(setPassword.called).to.equal(false);
        });

        for (const previous of [false, true]) {
            it(`rolls back a cancelled login write with ${previous ? 'a previous session' : 'no previous session'}`, async () => {
                if (previous) { secrets.set('default', storedSession(undefined, 'openid')); }
                const saved = secrets.get('default');
                const write = new Deferred<void>();
                const states: ChatGptAuthState[] = [];
                service.addClient({ onAuthStateChanged: state => states.push(state) });
                await service.startLogin();
                setPassword.onFirstCall().callsFake(async (_service: string, account: string, value: string) => {
                    await write.promise;
                    secrets.set(account, value);
                });
                const signingIn = service.completeCurrentLogin(service.callback());
                const result = service.waitForCurrentLogin();
                await waitFor(() => setPassword.called);
                await service.cancelCurrentLogin();
                write.resolve();
                expect(await signingIn).to.equal(false);
                expect(await result).to.equal(false);
                expect(secrets.get('default')).to.equal(saved);
                expect(states).to.be.empty;
                expect((await service.getAuthState()).isAuthenticated).to.equal(previous);
                expect(deletePassword.callCount).to.equal(previous ? 0 : 1);
            });
        }

        it('rolls back a replaced login write before storing the replacement', async () => {
            const write = new Deferred<void>();
            await service.startLogin();
            setPassword.onFirstCall().callsFake(async (_service: string, account: string, value: string) => {
                await write.promise; secrets.set(account, value);
            });
            const old = service.completeCurrentLogin(service.callback());
            await waitFor(() => setPassword.called);
            await service.startLogin();
            fetchStub.resolves(grant('second-subject'));
            const current = service.completeCurrentLogin(service.callback(SECOND));
            await flush();
            expect(setPassword.calledOnce).to.equal(true);
            write.resolve();
            expect(await old).to.equal(false);
            expect(await current).to.equal(true);
            expect(deletePassword.firstCall.calledBefore(setPassword.lastCall)).to.equal(true);
            expect(persisted().account!.clientId).to.equal(SECOND);
        });

        it('does not let a stale failed login write affect its replacement', async () => {
            const write = new Deferred<void>();
            await service.startLogin();
            setPassword.onFirstCall().returns(write.promise);
            const old = service.completeCurrentLogin(service.callback());
            await waitFor(() => setPassword.called);
            await service.startLogin();
            fetchStub.resolves(grant('second-subject'));
            const current = service.completeCurrentLogin(service.callback(SECOND));
            write.reject(new Error('failed stale write'));
            expect(await old).to.equal(false);
            expect(await current).to.equal(true);
            expect(persisted().account!.clientId).to.equal(SECOND);
        });

        it('disposes frontend client registrations', async () => {
            const changed = sinon.spy();
            service.addClient({ onAuthStateChanged: changed }).dispose();
            await service.startLogin();
            await service.completeCurrentLogin(service.callback());
            expect(changed.called).to.equal(false);
        });
    });

    describe('OAuth bearer permission and hints', () => {
        it('returns the top-level OAuth bearer without requiring resource_tokens', async () => {
            await service.startLogin();
            await service.completeCurrentLogin(service.callback());
            expect(await service.getCredentials()).to.include({ accessToken: 'opaque-token', clientId: FIRST });
            expect((await service.getCredentials())?.accessToken).to.equal(persisted().account!.tokens?.accessToken);
            expect((await service.getAuthState()).canUseChatGptPlan).to.equal(true);
        });

        for (const scope of ['openid profile email', 'chatgpt.tokens.use.direct', 'resource.invoke']) {
            it(`withholds inference when required scopes are missing: ${scope}`, async () => {
                fetchStub.resolves(grant('first-subject', { scope }));
                await service.startLogin();
                await service.completeCurrentLogin(service.callback());
                expect(await service.getAuthState()).to.include({ isAuthenticated: true, canUseChatGptPlan: false });
                await expectRejection(service.getCredentials(), /token sharing is not enabled/);
            });
        }

        it('never returns an expired access token from a successful refresh', async () => {
            secrets.set('default', storedSession(Date.now() + 1000));
            fetchStub.resolves(grant('first-subject', { access_token: 'expired-token', expires_at: 1 }));
            await expectRejection(service.getCredentials(), /access token has expired/);
        });

        it('reuses the issued registration and verified hint for identity-only reauthorization', async () => {
            secrets.set('default', storedSession(undefined, 'openid'));
            const reconnect = new URL((await service.startLogin()).authorizationUrl);
            expect(reconnect.searchParams.get('client_id')).to.equal(FIRST);
            expect(reconnect.searchParams.get('id_token_hint')).to.equal(persisted().account!.idTokenHint);
            await service.completeCurrentLogin(service.callback());
            expect((await service.getAuthState()).canUseChatGptPlan).to.equal(true);
        });
    });

    describe('refresh and generation protection', () => {
        beforeEach(() => {
            secrets.set('default', storedSession(Date.now() + 1000));
            fetchStub.resolves(grant('first-subject', { id_token: undefined, access_token: 'refreshed-token', refresh_token: undefined }));
        });

        it('coalesces refresh and retains an omitted refresh token and session pin', async () => {
            const [first, second] = await Promise.all([service.getCredentials(), service.getCredentials()]);
            expect(first).to.deep.equal(second);
            expect(first).to.include({ accessToken: 'refreshed-token', sessionId: 'first-session' });
            expect(fetchStub.calledOnce).to.equal(true);
            expect(Object.fromEntries(fetchStub.firstCall.args[1].body as URLSearchParams)).to.deep.equal({
                grant_type: 'refresh_token', client_id: FIRST, refresh_token: 'stored-refresh', resource: CHATGPT_RESOURCE
            });
            expect(persisted().account!.tokens?.refreshToken).to.equal('stored-refresh');
        });

        it('refreshes a new session independently of a stale pending refresh', async () => {
            const oldResponse = new Deferred<Response>();
            const newResponse = new Deferred<Response>();
            let requests = 0;
            fetchStub.callsFake(async (url: string) => {
                if (url === REVOKE_URL) { return tokenResponse({}); }
                requests++;
                if (requests === 1) { return oldResponse.promise; }
                if (requests === 2) { return grant('second-subject', { expires_in: 0 }); }
                return newResponse.promise;
            });
            const old = service.getCredentials();
            await waitFor(() => requests === 1);
            await service.signOut();
            await service.startLogin();
            await service.completeCurrentLogin(service.callback(SECOND));
            const current = service.getCredentials();
            await waitFor(() => requests === 3);
            oldResponse.resolve(grant());
            expect(await old).to.equal(undefined);
            const concurrent = service.getCredentials();
            await flush();
            expect(requests).to.equal(3);
            newResponse.resolve(grant('second-subject', { access_token: 'new-token' }));
            expect(await current).to.deep.equal(await concurrent);
            expect((await current)?.accessToken).to.equal('new-token');
        });

        it('updates plan-use permission and verified hint on refresh', async () => {
            const hint = JSON.stringify({ subject: 'first-subject', email: 'new@example.com' });
            fetchStub.resolves(grant('first-subject', { id_token: hint, scope: 'openid' }));
            await expectRejection(service.getCredentials(), /token sharing is not enabled/);
            expect((await service.getAuthState()).canUseChatGptPlan).to.equal(false);
            expect(persisted().account!.idTokenHint).to.equal(hint);
        });

        it('rejects refreshed identity substitution without overwriting tokens', async () => {
            fetchStub.resolves(grant('other-subject'));
            await expectRejection(service.getCredentials(), /does not match/);
            expect(persisted().account!.tokens?.accessToken).to.equal('stored-token');
        });

        for (const code of ['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused']) {
            it(`expires spent refresh tokens for ${code} while retaining registration`, async () => {
                fetchStub.resolves(tokenResponse({ error: code, secret: 'must-not-leak' }, 400));
                await expectRejection(service.getCredentials(), /session has expired/);
                expect(persisted().account?.tokens).to.equal(undefined);
                expect(persisted().account!.clientId).to.equal(FIRST);
            });
        }

        for (const status of [400, 429, 503]) {
            it(`retains tokens after temporary failure ${status} without exposing response bodies`, async () => {
                fetchStub.resolves(tokenResponse({ error: 'invalid_client', access_token: 'must-not-leak' }, status));
                await expectRejection(service.getCredentials(), new RegExp(`failed with status ${status}`));
                expect(persisted().account!.tokens?.refreshToken).to.equal('stored-refresh');
            });
        }

        it('disconnects an expired session without a refresh token and reuses its issued client', async () => {
            const parsed = JSON.parse(storedSession(Date.now() - 1));
            delete parsed.account.tokens.refreshToken;
            secrets.set('default', JSON.stringify(parsed));
            expect(await service.getCredentials()).to.equal(undefined);
            expect(new URL((await service.startLogin()).authorizationUrl).searchParams.get('client_id')).to.equal(FIRST);
            expect(fetchStub.called).to.equal(false);
        });

        for (const response of [grant(), tokenResponse({ error: 'invalid_grant' }, 400), tokenResponse({ error: 'server_error' }, 503)]) {
            it(`discards stale refresh outcome ${response.status} after logout and a new subject login`, async () => {
                const pending = new Deferred<Response>();
                fetchStub.onFirstCall().returns(pending.promise);
                const refreshing = service.getCredentials(FIRST, 'first-session');
                await waitFor(() => fetchStub.called);
                await service.signOut();
                fetchStub.resolves(grant('second-subject', { refresh_token: 'new-refresh' }));
                await service.startLogin();
                await service.completeCurrentLogin(service.callback(SECOND));
                pending.resolve(response);
                expect(await refreshing).to.equal(undefined);
                expect(persisted().account!.tokens?.refreshToken).to.equal('new-refresh');
                expect(await service.getCredentials(FIRST, 'first-session')).to.equal(undefined);
            });
        }

        it('rolls back a refresh write before logout and a concurrent new login can proceed', async () => {
            const write = new Deferred<void>();
            setPassword.onFirstCall().callsFake(async (_service: string, account: string, value: string) => {
                await write.promise; secrets.set(account, value);
            });
            const refreshing = service.getCredentials();
            await waitFor(() => setPassword.called);
            const signingOut = service.signOut();
            const starting = service.startLogin();
            expect((await service.getAuthState()).isAuthenticated).to.equal(false);
            write.resolve();
            await signingOut;
            await starting;
            fetchStub.resolves(grant('second-subject'));
            expect(await service.completeCurrentLogin(service.callback(SECOND))).to.equal(true);
            expect(await refreshing).to.equal(undefined);
            expect(persisted().account!.subject).to.equal('second-subject');
        });
    });

    describe('loopback callback and disconnect', () => {
        for (const manual of [false, true]) {
            it(`settles state-verified access_denied without exchange (${manual ? 'manual' : 'listener'})`, async () => {
                secrets.set('default', storedSession(undefined, 'openid'));
                await service.startLogin();
                const waiting = service.waitForCurrentLogin();
                const denied = `${CHATGPT_REDIRECT_URI}?error=access_denied&state=${service.pendingState}`;
                if (manual) {
                    expect(await service.completeCurrentLogin(denied)).to.equal(false);
                } else {
                    expect(service.callCallback(denied).statusCode).to.equal(200);
                }
                expect(await waiting).to.equal(false);
                expect(fetchStub.called).to.equal(false);
                expect(setPassword.called).to.equal(false);
                expect((await service.getAuthState()).isAuthenticated).to.equal(true);
            });
        }

        it('does not cancel the pending login on an unverified denial state', async () => {
            const login = await service.startLogin();
            const denied = `${CHATGPT_REDIRECT_URI}?error=access_denied&state=wrong`;
            await expectRejection(service.completeCurrentLogin(denied), /state/);
            expect(service.callCallback(denied).statusCode).to.equal(400);
            expect(service.pendingState).to.equal(login.loginId);
            expect(fetchStub.called).to.equal(false);
        });

        it('rejects unknown routes and invalid callback values', async () => {
            await service.startLogin();
            expect(service.callCallback('/elsewhere').statusCode).to.equal(404);
            expect(service.callCallback(`/auth/callback?code=code&state=wrong&client_id=${FIRST}`).statusCode).to.equal(400);
            expect(service.callCallback(`/auth/callback?code=code&state=${service.pendingState}`).statusCode).to.equal(400);
            expect(fetchStub.called).to.equal(false);
            const waiting = service.waitForCurrentLogin();
            expect(service.callCallback(service.callback()).statusCode).to.equal(200);
            expect(await waiting).to.equal(true);
        });

        it('persists logout before slow remote discovery and retains only the host', async () => {
            secrets.set('default', storedSession());
            const discovery = new Deferred<string | undefined>();
            service.revocationEndpoint.returns(discovery.promise);
            await service.signOut();
            expect(persisted()).to.deep.equal({ version: 1 });
            expect(secrets.get(HOST_ACCOUNT)).to.equal(HOST_ID);
            await service.startLogin();
            discovery.resolve(REVOKE_URL);
            await flush();
            expect(Object.fromEntries(fetchStub.firstCall.args[1].body as URLSearchParams)).to.deep.equal({
                token: 'stored-refresh', client_id: FIRST, token_type_hint: 'refresh_token'
            });
        });

        it('blocks new login after durable logout failure until logout is retried', async () => {
            secrets.set('default', storedSession());
            setPassword.rejects(new Error('secret key store failure'));
            await expectRejection(service.signOut(), /Could not persist/);
            await expectRejection(service.startLogin(), /Could not persist/);
            expect((await service.getAuthState()).isAuthenticated).to.equal(false);
            setPassword.callsFake(async (_service: string, account: string, value: string) => { secrets.set(account, value); });
            await service.signOut();
            await service.startLogin();
        });

        it('falls back to revoking the access token when no refresh token exists', async () => {
            const parsed = JSON.parse(storedSession());
            delete parsed.account.tokens.refreshToken;
            secrets.set('default', JSON.stringify(parsed));
            await service.signOut();
            expect(Object.fromEntries(fetchStub.firstCall.args[1].body as URLSearchParams)).to.deep.equal({
                token: 'stored-token', client_id: FIRST, token_type_hint: 'access_token'
            });
        });

        it('disconnects locally without guessing a revocation URL when discovery has none', async () => {
            secrets.set('default', storedSession());
            service.revocationEndpoint.resolves(undefined);
            await service.signOut();
            expect(fetchStub.called).to.equal(false);
            expect(persisted().account?.tokens).to.equal(undefined);
        });

        it('ignores discovery failure and disconnects without exposing its errors', async () => {
            secrets.set('default', storedSession());
            service.revocationEndpoint.rejects(new Error('secret discovery error'));
            await service.signOut();
            expect(fetchStub.called).to.equal(false);
            expect(persisted().account?.tokens).to.equal(undefined);
        });

        it('ignores revocation failures and never exposes their errors', async () => {
            secrets.set('default', storedSession());
            fetchStub.rejects(new Error('secret token in remote error'));
            await service.signOut();
            expect(persisted().account?.tokens).to.equal(undefined);
            expect(await service.getCredentials()).to.equal(undefined);
        });

        it('notifies clients synchronously before revocation or local persistence completes', async () => {
            secrets.set('default', storedSession());
            await service.getAuthState();
            const revoke = new Deferred<Response>();
            fetchStub.returns(revoke.promise);
            const states: ChatGptAuthState[] = [];
            service.addClient({ onAuthStateChanged: state => states.push(state) });
            const events: ChatGptAuthState[] = [];
            service.onAuthStateChanged(state => events.push(state));
            const signingOut = service.signOut();
            expect(states).to.have.lengthOf(1);
            expect(states[0].isAuthenticated).to.equal(false);
            expect(events).to.deep.equal(states);
            await waitFor(() => fetchStub.called);
            expect(persisted()).to.deep.equal({ version: 1 });
            expect(await service.getCredentials()).to.equal(undefined);
            revoke.resolve(tokenResponse({}));
            await signingOut;
            expect(states).to.have.lengthOf(1);
        });

        it('abandons a pending login and rolls back a login write during signout', async () => {
            await service.startLogin();
            const write = new Deferred<void>();
            setPassword.onFirstCall().callsFake(async (_service: string, account: string, value: string) => {
                await write.promise; secrets.set(account, value);
            });
            const waiting = service.waitForCurrentLogin();
            const signingIn = service.completeCurrentLogin(service.callback());
            await waitFor(() => setPassword.called);
            const signingOut = service.signOut();
            write.resolve();
            expect(await signingIn).to.equal(false);
            expect(await waiting).to.equal(false);
            await signingOut;
            expect(await service.getCredentials()).to.equal(undefined);
            expect(persisted()).to.deep.equal({ version: 1 });
        });
    });

    it('clears a tentative login on logout even when its rollback failed', async () => {
        await service.startLogin();
        const write = new Deferred<void>();
        setPassword.onFirstCall().callsFake(async (_service: string, account: string, value: string) => {
            await write.promise;
            secrets.set(account, value);
        });
        deletePassword.rejects(new Error('failed rollback'));
        const signingIn = service.completeCurrentLogin(service.callback());
        await waitFor(() => setPassword.called);
        const signingOut = service.signOut();
        write.resolve();
        expect(await signingIn).to.equal(false);
        await signingOut;
        expect(persisted()).to.deep.equal({ version: 1 });
        service = instantiate();
        expect(await service.getCredentials()).to.equal(undefined);
    });

    describe('attempt-specific login RPC', () => {
        it('isolates a replacement login from stale wait, completion and cancellation after late startup', async () => {
            const remote = createRemoteAuthService(service);
            const startup = new Deferred<http.Server>();
            service.callbackServerStartup = startup.promise;
            const oldStart = expectRejection(remote.startLogin(), /cancelled/);
            await waitFor(() => service.pendingState !== undefined);
            await flush();
            const oldId = service.pendingState!;
            const oldCallback = service.callback();
            service.callbackServerStartup = Promise.resolve(undefined);
            const current = await remote.startLogin();
            const callback = service.callback();
            const lateServer = { close: sinon.stub(), closeAllConnections: sinon.stub() };
            startup.resolve(lateServer as unknown as http.Server);
            await oldStart;
            expect(await remote.waitForLogin(oldId)).to.equal(false);
            expect(await remote.completeLogin(oldCallback, oldId)).to.equal(false);
            await remote.cancelLogin(oldId);
            expect(service.pendingState).to.equal(current.loginId);
            expect(fetchStub.called).to.equal(false);
            await expectRejection(remote.completeLogin(oldCallback, current.loginId), /state/);
            const waiting = remote.waitForLogin(current.loginId);
            expect(await remote.completeLogin(callback, current.loginId)).to.equal(true);
            expect(await waiting).to.equal(true);
            expect(lateServer.close.calledOnce).to.equal(true);
        });

        it('fails closed on missing RPC login ids without affecting the pending attempt', async () => {
            const remote = createRemoteAuthService(service);
            const current = await remote.startLogin();
            const missing = undefined as unknown as string;
            expect(await remote.waitForLogin(missing)).to.equal(false);
            expect(await remote.completeLogin(service.callback(), missing)).to.equal(false);
            await remote.cancelLogin(missing);
            expect(service.pendingState).to.equal(current.loginId);
            expect(fetchStub.called).to.equal(false);
            await remote.cancelLogin(current.loginId);
            expect(await remote.waitForLogin(current.loginId)).to.equal(false);
            expect(await remote.completeLogin(service.callback(), current.loginId)).to.equal(false);
        });
    });

    describe('RPC facade', () => {
        it('exposes only the explicit frontend allowlist, without credentials, registration or mode helpers', async () => {
            secrets.set('default', storedSession());
            const remote = createRemoteAuthService(service);
            expect(Object.keys(remote).sort()).to.deep.equal([
                'cancelLogin', 'completeLogin', 'getAuthState', 'onAuthStateChanged', 'signOut', 'startLogin', 'waitForLogin'
            ]);
            for (const key of ['getCredentials', 'addClient', 'setAuthenticationMode', 'suspend']) {
                expect((remote as unknown as Record<string, unknown>)[key]).to.equal(undefined);
            }
            const state = await remote.getAuthState();
            expect(Object.keys(state).sort()).to.deep.equal(['accountLabel', 'canUseChatGptPlan', 'isAuthenticated', 'planType']);
            expect(JSON.stringify(state)).not.to.contain('stored-token').and.not.to.contain('first-subject').and.not.to.contain(FIRST);
        });
    });
});
