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
import * as http from 'http';
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { KeyStoreService } from '@theia/core/lib/common/key-store';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { ChatGptAuthState } from '../common';
import { ChatGptAuthServiceImpl, createRemoteAuthService } from './chatgpt-auth-service-impl';
import { CHATGPT_REDIRECT_URI, CHATGPT_SCOPE, CHATGPT_TOKEN_URL, CHATGPT_RESOURCE } from './chatgpt-oauth';
import { ChatGptAuthServiceConfig, DEFAULT_CHATGPT_AUTH_SERVICE_CONFIG } from './chatgpt-auth-service';
import { VerifiedChatGptIdentity } from './chatgpt-id-token';

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

function storedRegistry(expiresAt = Date.now() + 3600_000, second = false): string {
    const first = {
        clientId: FIRST, subject: 'first-subject', accountLabel: 'user@example.com',
        idTokenHint: JSON.stringify({ subject: 'first-subject' }),
        tokens: {
            accessToken: 'stored-token', refreshToken: 'stored-refresh', expiresAt, scope: CHATGPT_SCOPE, sessionId: 'first-session'
        }
    };
    return JSON.stringify({
        version: 3, activeClientId: FIRST,
        accounts: second ? [first, {
            clientId: SECOND, subject: 'second-subject', accountLabel: 'second@example.com',
            idTokenHint: JSON.stringify({ subject: 'second-subject' }),
            tokens: {
                accessToken: 'second-token', refreshToken: 'second-refresh', expiresAt: Date.now() + 3600_000,
                scope: CHATGPT_SCOPE, sessionId: 'second-session'
            }
        }] : [first]
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
        activeClientId: string;
        accounts: {
            clientId: string; subject: string; idTokenHint?: string;
            tokens?: {
                accessToken: string; refreshToken?: string; scope: string; sessionId: string;
            };
        }[];
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

        it('normalizes a saved bare UUID without creating a different host identity', async () => {
            secrets.set(HOST_ACCOUNT, HOST_ID.slice('urn:uuid:'.length));
            const first = new URL((await service.startLogin()).authorizationUrl).searchParams.get('ext_agent_host_id');
            expect(first).to.equal(HOST_ID);
            expect(secrets.get(HOST_ACCOUNT)).to.equal(HOST_ID);
            expect(setPassword.getCalls().filter(call => call.args[1] === HOST_ACCOUNT)).to.have.lengthOf(1);
            await service.cancelCurrentLogin();
            service = instantiate();
            const second = new URL((await service.startLogin()).authorizationUrl).searchParams.get('ext_agent_host_id');
            expect(second).to.equal(first);
            expect(setPassword.getCalls().filter(call => call.args[1] === HOST_ACCOUNT)).to.have.lengthOf(1);
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
            sinon.stub(http, 'createServer').returns(server as unknown as http.Server);
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

    describe('registry loading', () => {
        it('rejects version-2 resource-grant records without using or deleting their secrets', async () => {
            const parsed = JSON.parse(storedRegistry());
            parsed.version = 2;
            parsed.accounts[0].tokens.accessToken = 'old-management-token';
            parsed.accounts[0].tokens.inference = { accessToken: 'old-resource-token', expiresAt: Date.now() + 3600_000, scope: 'resource.invoke' };
            const oldRegistry = JSON.stringify(parsed);
            secrets.set('default', oldRegistry);
            expect(await service.getCredentials()).to.equal(undefined);
            expect(await service.getAccounts()).to.deep.equal([]);
            expect(fetchStub.called).to.equal(false);
            expect(setPassword.called).to.equal(false);
            expect(deletePassword.called).to.equal(false);
            expect(secrets.get('default')).to.equal(oldRegistry);
        });

        for (const stored of ['not-json', '{}', JSON.stringify({ accessToken: 'legacy', refreshToken: 'legacy-refresh', accountId: 'legacy', expiresAt: Date.now() + 3600_000 })]) {
            it(`rejects incompatible stored data without deleting it: ${stored}`, async () => {
                secrets.set('default', stored);
                expect((await service.getAuthState()).isAuthenticated).to.equal(false);
                expect(await service.getCredentials()).to.equal(undefined);
                expect(await service.getAccounts()).to.deep.equal([]);
                expect(fetchStub.called).to.equal(false);
                expect(deletePassword.called).to.equal(false);
                expect(setPassword.called).to.equal(false);
                expect(secrets.get('default')).to.equal(stored);
            });
        }

        it('rejects blank tokens, duplicate client registrations and invalid expirations', async () => {
            for (const change of [
                (parsed: { accounts: { subject: string; tokens: { accessToken: string; expiresAt: number | string } }[] }) => parsed.accounts[0].tokens.accessToken = ' ',
                (parsed: { accounts: { subject: string; tokens: { accessToken: string; expiresAt: number | string } }[] }) => parsed.accounts.push(parsed.accounts[0]),
                (parsed: { accounts: { subject: string; tokens: { accessToken: string; expiresAt: number | string } }[] }) => parsed.accounts[0].tokens.expiresAt = '123',
                (parsed: { accounts: { subject: string; tokens: { accessToken: string; expiresAt: number | string } }[] }) => parsed.accounts[0].subject = ' '
            ]) {
                const parsed = JSON.parse(storedRegistry());
                change(parsed);
                secrets.set('default', JSON.stringify(parsed));
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
            reading.resolve(storedRegistry());
            expect(await first).to.include({ accessToken: 'stored-token', clientId: FIRST });
            expect(await second).to.deep.equal(await first);
        });

        it('does not republish a load which completes after signout', async () => {
            const reading = new Deferred<string>();
            getPassword.onFirstCall().returns(reading.promise);
            const credentials = service.getCredentials();
            await waitFor(() => getPassword.called);
            const signingOut = service.signOut();
            secrets.set('default', storedRegistry());
            reading.resolve(secrets.get('default')!);
            expect(await credentials).to.equal(undefined);
            await signingOut;
            expect((await service.getAuthState()).isAuthenticated).to.equal(false);
            expect(persisted().accounts[0].tokens).to.equal(undefined);
        });

        it('cancels a login waiting for the registry without publishing old credentials', async () => {
            const reading = new Deferred<string>();
            getPassword.onFirstCall().returns(reading.promise);
            const starting = expectRejection(service.startLogin(), /cancelled/);
            await waitFor(() => getPassword.called);
            const signingOut = service.signOut();
            secrets.set('default', storedRegistry());
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
            expect(persisted().accounts[0].tokens?.accessToken).to.equal('opaque-token');
            expect(service.verifyIdentity.firstCall.args.slice(1)).to.deep.equal([FIRST, nonce]);
            expect(states).to.have.lengthOf(1);
            expect(states[0]).to.include({ isAuthenticated: true, clientId: FIRST, accountLabel: 'user@example.com', canUseChatGptPlan: true });
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
            expect(persisted().accounts[0].tokens?.refreshToken).to.equal(undefined);
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
            secrets.set('default', storedRegistry());
            await service.startLogin(FIRST);
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
            expect((await service.getAccounts())[0].canUseChatGptPlan).to.equal(false);
            await expectRejection(service.getCredentials(), /token sharing is not enabled/);
            expect(fetchStub.calledOnce).to.equal(true);
        });

        it('preserves previous accounts, selects explicitly, pins credentials and reconnects a disconnected registration', async () => {
            secrets.set('default', storedRegistry());
            fetchStub.resolves(grant('second-subject', { access_token: 'second-token' }));
            await service.startLogin();
            await service.completeCurrentLogin(service.callback(SECOND));
            expect(persisted().accounts).to.have.lengthOf(2);
            expect(await service.getCredentials(FIRST)).to.equal(undefined);
            expect(await service.getCredentials(SECOND)).to.include({ accessToken: 'second-token', clientId: SECOND });
            await service.selectAccount(FIRST);
            expect(await service.getCredentials(SECOND)).to.equal(undefined);
            await service.signOut();
            expect((await service.getAccounts()).map(account => [account.clientId, account.isAuthenticated])).to.deep.equal([[FIRST, false], [SECOND, true]]);
            expect(new URL((await service.startLogin(FIRST)).authorizationUrl).searchParams.get('client_id')).to.equal(FIRST);
            await expectRejection(service.completeCurrentLogin(service.callback(SECOND)), /client id/);
            fetchStub.resolves(grant());
            await service.completeCurrentLogin(service.callback(FIRST));
            expect(persisted().accounts).to.have.lengthOf(2);
            expect(await service.getCredentials(FIRST)).not.to.equal(undefined);
        });

        it('rejects reconnecting a different subject under a saved client id', async () => {
            secrets.set('default', storedRegistry());
            fetchStub.resolves(grant('other-subject'));
            await service.startLogin(FIRST);
            await expectRejection(service.completeCurrentLogin(service.callback()), /could not be completed/);
            expect(persisted().accounts[0].subject).to.equal('first-subject');
            expect(setPassword.called).to.equal(false);
        });

        it('rejects selecting or reconnecting unknown registrations', async () => {
            await expectRejection(service.startLogin(FIRST), /not registered/);
            await expectRejection(service.selectAccount(FIRST), /not registered/);
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
                if (previous) { secrets.set('default', storedRegistry()); }
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
            expect(persisted().accounts.map(account => account.clientId)).to.deep.equal([SECOND]);
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
            expect(persisted().activeClientId).to.equal(SECOND);
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
            expect((await service.getCredentials())?.accessToken).to.equal(persisted().accounts[0].tokens?.accessToken);
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
            secrets.set('default', storedRegistry(Date.now() + 1000));
            fetchStub.resolves(grant('first-subject', { access_token: 'expired-token', expires_at: 1 }));
            await expectRejection(service.getCredentials(), /access token has expired/);
        });

        it('uses a verified hint while connected, updates it on refresh and clears it on signout', async () => {
            await service.startLogin();
            await service.completeCurrentLogin(service.callback());
            const initialHint = persisted().accounts[0].idTokenHint;
            const reconnect = await service.startLogin(FIRST);
            expect(new URL(reconnect.authorizationUrl).searchParams.get('id_token_hint')).to.equal(initialHint);
            expect(new URL(reconnect.authorizationUrl).searchParams.has('agent_name_hint')).to.equal(false);
            fetchStub.resolves(grant('first-subject', { expires_in: 0 }));
            await service.completeCurrentLogin(service.callback());
            const newHint = JSON.stringify({ subject: 'first-subject', email: 'new@example.com' });
            fetchStub.resolves(grant('first-subject', { id_token: newHint }));
            await service.getCredentials();
            expect(persisted().accounts[0].idTokenHint).to.equal(newHint);
            await service.signOut();
            expect(persisted().accounts[0].idTokenHint).to.equal(undefined);
            service = instantiate();
            const disconnected = await service.startLogin(FIRST);
            expect(new URL(disconnected.authorizationUrl).searchParams.has('id_token_hint')).to.equal(false);
        });
    });

    describe('refresh and generation protection', () => {
        beforeEach(() => {
            secrets.set('default', storedRegistry(Date.now() + 1000, true));
            fetchStub.resolves(grant('first-subject', { id_token: undefined, access_token: 'refreshed-token', refresh_token: undefined }));
        });

        it('sends the resource URL without scope and retains an omitted non-rotated refresh token', async () => {
            expect(await service.getCredentials(FIRST)).to.include({ accessToken: 'refreshed-token', clientId: FIRST });
            const body = fetchStub.firstCall.args[1].body as URLSearchParams;
            expect(Object.fromEntries(body)).to.deep.equal({
                grant_type: 'refresh_token', client_id: FIRST, refresh_token: 'stored-refresh', resource: CHATGPT_RESOURCE
            });
            expect(persisted().accounts[0].tokens?.refreshToken).to.equal('stored-refresh');
        });

        it('performs one request for concurrent refreshes', async () => {
            const [first, second] = await Promise.all([service.getCredentials(), service.getCredentials()]);
            expect(first).to.deep.equal(second);
            expect(fetchStub.calledOnce).to.equal(true);
        });

        it('rejects a refreshed ID token for another subject without overwriting the registry', async () => {
            fetchStub.resolves(grant('other-subject'));
            await expectRejection(service.getCredentials(), /does not match/);
            expect(persisted().accounts[0].tokens?.accessToken).to.equal('stored-token');
        });

        it('updates permission from the effective returned scope', async () => {
            fetchStub.resolves(grant('first-subject', { scope: 'openid' }));
            await expectRejection(service.getCredentials(), /token sharing is not enabled/);
            expect((await service.getAuthState()).canUseChatGptPlan).to.equal(false);
        });

        for (const code of ['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused']) {
            it(`disconnects only the active expired session for ${code}`, async () => {
                fetchStub.resolves(tokenResponse({ error: code, secret: 'must-not-leak' }, 400));
                await expectRejection(service.getCredentials(), /session has expired/);
                expect(persisted().accounts[0].tokens).to.equal(undefined);
                expect(persisted().accounts[1].tokens?.accessToken).to.equal('second-token');
                expect(await service.getAccounts()).to.have.lengthOf(2);
                await service.selectAccount(SECOND);
                expect(await service.getCredentials()).to.include({ accessToken: 'second-token', clientId: SECOND });
            });
        }

        it('retains the session on invalid_client rather than treating configuration errors as spent tokens', async () => {
            fetchStub.resolves(tokenResponse({ error: 'invalid_client' }, 400));
            await expectRejection(service.getCredentials(), /failed with status 400/);
            expect(persisted().accounts[0].tokens?.refreshToken).to.equal('stored-refresh');
            expect((await service.getAuthState()).isAuthenticated).to.equal(true);
        });

        for (const status of [400, 429, 503]) {
            it(`retains registrations and tokens on temporary failure ${status} without leaking the body`, async () => {
                fetchStub.resolves(tokenResponse({ error: 'secret-unknown-error', access_token: 'must-not-leak' }, status));
                await expectRejection(service.getCredentials(), new RegExp(`^The OpenAI token request failed with status ${status}\\.$`));
                expect(persisted().accounts[0].tokens?.accessToken).to.equal('stored-token');
                expect((await service.getAuthState()).isAuthenticated).to.equal(true);
            });
        }

        it('disconnects an expired session without a refresh token but retains the registration', async () => {
            const parsed = JSON.parse(storedRegistry(Date.now() - 1000));
            delete parsed.accounts[0].tokens.refreshToken;
            secrets.set('default', JSON.stringify(parsed));
            expect(await service.getCredentials()).to.equal(undefined);
            expect(persisted().accounts[0].tokens).to.equal(undefined);
            expect(fetchStub.called).to.equal(false);
        });

        for (const response of [grant(), tokenResponse({ error: 'invalid_grant' }, 400), tokenResponse({ error: 'server_error' }, 503)]) {
            it(`handles a background session refresh (${response.status}) after selecting a different account`, async () => {
                const pending = new Deferred<Response>();
                fetchStub.returns(pending.promise);
                const refreshing = service.getCredentials(FIRST);
                await waitFor(() => fetchStub.called);
                await service.selectAccount(SECOND);
                pending.resolve(response);
                expect(await refreshing).to.equal(undefined);
                expect(await service.getCredentials(FIRST)).to.equal(undefined);
                expect(await service.getCredentials(SECOND)).to.include({ accessToken: 'second-token', clientId: SECOND });
                expect(persisted().accounts[0].tokens?.accessToken).to.equal(response.status === 200
                    ? 'opaque-token' : response.status === 400 ? undefined : 'stored-token');
            });

            it(`discards a stale refresh (${response.status}) after accepting a new login`, async () => {
                const pending = new Deferred<Response>();
                fetchStub.onFirstCall().returns(pending.promise);
                const refreshing = service.getCredentials();
                await waitFor(() => fetchStub.called);
                fetchStub.resolves(grant('second-subject'));
                await service.startLogin(SECOND);
                await service.completeCurrentLogin(service.callback(SECOND));
                pending.resolve(response);
                expect(await refreshing).to.equal(undefined);
                expect(persisted().activeClientId).to.equal(SECOND);
                expect(persisted().accounts[1].tokens?.accessToken).to.equal('opaque-token');
            });
        }

        for (const signOutFirst of [false, true]) {
            it(`refreshes a new session independently of an old pending refresh (${signOutFirst ? 'with' : 'without'} signout)`, async () => {
                const oldResponse = new Deferred<Response>();
                const newResponse = new Deferred<Response>();
                let tokens = 0;
                fetchStub.callsFake(async (url: string) => {
                    if (url === REVOKE_URL) { return tokenResponse({}); }
                    tokens++;
                    if (tokens === 1) { return oldResponse.promise; }
                    if (tokens === 2) { return grant('second-subject', { expires_in: 0, refresh_token: 'new-refresh' }); }
                    return newResponse.promise;
                });
                const oldRefresh = service.getCredentials();
                await waitFor(() => tokens === 1);
                if (signOutFirst) { await service.signOut(); }
                await service.startLogin(SECOND);
                await service.completeCurrentLogin(service.callback(SECOND));
                const currentRefresh = service.getCredentials(SECOND);
                await waitFor(() => tokens === 3);
                oldResponse.resolve(grant());
                expect(await oldRefresh).to.equal(undefined);
                const concurrent = service.getCredentials(SECOND);
                await flush();
                expect(tokens).to.equal(3);
                newResponse.resolve(grant('second-subject', { access_token: 'new-token' }));
                const expected = { accessToken: 'new-token', clientId: SECOND };
                expect(await currentRefresh).to.include(expected);
                expect(await concurrent).to.include(expected);
            });
        }

        it('persists a refresh write across account selection instead of rolling back rotation', async () => {
            fetchStub.resolves(grant('first-subject', { refresh_token: 'rotated-refresh', access_token: 'refreshed-token' }));
            const write = new Deferred<void>();
            setPassword.onFirstCall().callsFake(async (_service: string, account: string, value: string) => {
                await write.promise; secrets.set(account, value);
            });
            const refreshing = service.getCredentials(FIRST);
            await waitFor(() => setPassword.called);
            const selecting = service.selectAccount(SECOND);
            write.resolve();
            expect(await refreshing).to.equal(undefined);
            await selecting;
            expect(setPassword.callCount).to.equal(2);
            expect(persisted().activeClientId).to.equal(SECOND);
            expect(persisted().accounts[0].tokens?.accessToken).to.equal('refreshed-token');
            expect(persisted().accounts[0].tokens?.refreshToken).to.equal('rotated-refresh');
            expect(persisted().accounts[0].tokens?.sessionId).to.equal('first-session');
            expect(await service.getCredentials(FIRST)).to.equal(undefined);
        });

        it('persists a background rotation and uses R2 when the retained account is selected again', async () => {
            const response = new Deferred<Response>();
            fetchStub.onFirstCall().returns(response.promise);
            const oldRequest = service.getCredentials(FIRST, 'first-session');
            await waitFor(() => fetchStub.called);
            await service.selectAccount(SECOND);
            response.resolve(grant('first-subject', { refresh_token: 'R2', expires_in: 0 }));
            expect(await oldRequest).to.equal(undefined);
            expect(persisted().activeClientId).to.equal(SECOND);
            expect(persisted().accounts[0].tokens?.refreshToken).to.equal('R2');
            expect(persisted().accounts[0].tokens?.sessionId).to.equal('first-session');
            await service.selectAccount(FIRST);
            fetchStub.resolves(grant('first-subject', { refresh_token: 'R3' }));
            expect((await service.getCredentials(FIRST, 'first-session'))?.accessToken).to.equal('opaque-token');
            expect((fetchStub.secondCall.args[1].body as URLSearchParams).get('refresh_token')).to.equal('R2');
        });

        it('coalesces A-to-B-to-A selection with the same account-session refresh but not the stale request', async () => {
            const response = new Deferred<Response>();
            fetchStub.returns(response.promise);
            const oldRequest = service.getCredentials(FIRST, 'first-session');
            await waitFor(() => fetchStub.called);
            await service.selectAccount(SECOND);
            await service.selectAccount(FIRST);
            const currentRequest = service.getCredentials(FIRST, 'first-session');
            await flush();
            expect(fetchStub.calledOnce).to.equal(true);
            response.resolve(grant('first-subject', { refresh_token: 'R2' }));
            expect(await oldRequest).to.equal(undefined);
            expect(await currentRequest).to.include({ accessToken: 'opaque-token', clientId: FIRST, sessionId: 'first-session' });
            expect(persisted().accounts[0].tokens?.refreshToken).to.equal('R2');
        });

        it('refreshes two retained account sessions independently while keeping each rotation', async () => {
            const parsed = JSON.parse(storedRegistry(Date.now() + 1000, true));
            parsed.accounts[1].tokens.expiresAt = Date.now() + 1000;
            secrets.set('default', JSON.stringify(parsed));
            const first = new Deferred<Response>();
            const second = new Deferred<Response>();
            fetchStub.onFirstCall().returns(first.promise);
            fetchStub.onSecondCall().returns(second.promise);
            const oldRequest = service.getCredentials(FIRST);
            await waitFor(() => fetchStub.calledOnce);
            await service.selectAccount(SECOND);
            const currentRequest = service.getCredentials(SECOND);
            await waitFor(() => fetchStub.calledTwice);
            first.resolve(grant('first-subject', { refresh_token: 'A-R2' }));
            second.resolve(grant('second-subject', { refresh_token: 'B-R2', access_token: 'B-new' }));
            expect(await oldRequest).to.equal(undefined);
            expect(await currentRequest).to.include({ accessToken: 'B-new', sessionId: 'second-session' });
            expect(persisted().accounts.map(account => account.tokens?.refreshToken)).to.deep.equal(['A-R2', 'B-R2']);
        });

        it('disconnects only background A after invalid_grant without hiding or disconnecting active B', async () => {
            const response = new Deferred<Response>();
            fetchStub.returns(response.promise);
            const oldRequest = service.getCredentials(FIRST);
            await waitFor(() => fetchStub.called);
            await service.selectAccount(SECOND);
            const states: ChatGptAuthState[] = [];
            service.onAuthStateChanged(state => states.push(state));
            response.resolve(tokenResponse({ error: 'invalid_grant' }, 400));
            expect(await oldRequest).to.equal(undefined);
            expect((await service.getAuthState()).isAuthenticated).to.equal(true);
            expect((await service.getAuthState()).clientId).to.equal(SECOND);
            expect(persisted().accounts[0].tokens).to.equal(undefined);
            expect(persisted().accounts[1].tokens?.sessionId).to.equal('second-session');
            expect(persisted().accounts[0].idTokenHint).to.equal(undefined);
            expect(persisted().accounts[1].idTokenHint).to.equal(JSON.stringify({ subject: 'second-subject' }));
            expect(states).to.be.empty;
        });

        it('does not revive disconnected active B when background A finishes a deferred rotation write', async () => {
            const response = new Deferred<Response>();
            fetchStub.onFirstCall().returns(response.promise);
            const oldRequest = service.getCredentials(FIRST);
            await waitFor(() => fetchStub.called);
            await service.selectAccount(SECOND);
            const write = new Deferred<void>();
            setPassword.resetHistory();
            setPassword.onFirstCall().callsFake(async (_service: string, account: string, value: string) => {
                await write.promise; secrets.set(account, value);
            });
            response.resolve(grant('first-subject', { refresh_token: 'A-R2' }));
            await waitFor(() => setPassword.called);
            const states: ChatGptAuthState[] = [];
            service.onAuthStateChanged(state => states.push(state));
            const signingOut = service.signOut();
            expect((await service.getAuthState()).isAuthenticated).to.equal(false);
            write.resolve();
            await signingOut;
            expect(await oldRequest).to.equal(undefined);
            expect(states.every(state => !state.isAuthenticated)).to.equal(true);
            expect(persisted().accounts[0].tokens?.refreshToken).to.equal('A-R2');
            expect(persisted().accounts[1].tokens).to.equal(undefined);
            await service.selectAccount(FIRST);
            expect((await service.getCredentials())?.sessionId).to.equal('first-session');
        });

        for (const response of [grant('first-subject', { refresh_token: 'obsolete-R2' }), tokenResponse({ error: 'invalid_grant' }, 400)]) {
            it(`does not apply old refresh outcome ${response.status} to a reconnected session with the same client id`, async () => {
                const pending = new Deferred<Response>();
                fetchStub.onFirstCall().returns(pending.promise);
                const oldRequest = service.getCredentials(FIRST, 'first-session');
                await waitFor(() => fetchStub.called);
                fetchStub.resolves(grant('first-subject', { refresh_token: 'new-session-refresh', access_token: 'new-session-token' }));
                await service.startLogin(FIRST);
                await service.completeCurrentLogin(service.callback());
                const newSessionId = persisted().accounts[0].tokens!.sessionId;
                expect(newSessionId).not.to.equal('first-session');
                pending.resolve(response);
                expect(await oldRequest).to.equal(undefined);
                expect(persisted().accounts[0].tokens?.refreshToken).to.equal('new-session-refresh');
                expect(await service.getCredentials(FIRST, 'first-session')).to.equal(undefined);
                expect(await service.getCredentials(FIRST, newSessionId)).to.include({ accessToken: 'new-session-token', sessionId: newSessionId });
            });
        }

        it('does not persist an old rotation after disconnect and reconnect of the same account', async () => {
            const response = new Deferred<Response>();
            fetchStub.onFirstCall().returns(response.promise);
            const oldRequest = service.getCredentials(FIRST, 'first-session');
            await waitFor(() => fetchStub.called);
            await service.signOut();
            fetchStub.resolves(grant('first-subject', { refresh_token: 'new-session-refresh' }));
            await service.startLogin(FIRST);
            await service.completeCurrentLogin(service.callback());
            response.resolve(grant('first-subject', { refresh_token: 'obsolete-R2' }));
            expect(await oldRequest).to.equal(undefined);
            expect(persisted().accounts[0].tokens?.refreshToken).to.equal('new-session-refresh');
            expect(await service.getCredentials(FIRST, 'first-session')).to.equal(undefined);
        });

        it('does not publish a refresh write which outlived signout', async () => {
            const write = new Deferred<void>();
            setPassword.onFirstCall().callsFake(async (_service: string, account: string, value: string) => {
                await write.promise; secrets.set(account, value);
            });
            const refreshing = service.getCredentials();
            await waitFor(() => setPassword.called);
            const signingOut = service.signOut();
            expect((await service.getAuthState()).isAuthenticated).to.equal(false);
            write.resolve();
            await signingOut;
            expect(await refreshing).to.equal(undefined);
            expect(persisted().accounts[0].tokens).to.equal(undefined);
            expect(persisted().accounts[1].tokens).not.to.equal(undefined);
        });

        it('keeps a new login accepted after a stale refresh write and signout', async () => {
            const write = new Deferred<void>();
            setPassword.onFirstCall().callsFake(async (_service: string, account: string, value: string) => {
                await write.promise; secrets.set(account, value);
            });
            const refreshing = service.getCredentials();
            await waitFor(() => setPassword.called);
            const signingOut = service.signOut();
            fetchStub.resolves(grant('second-subject'));
            const starting = service.startLogin(SECOND);
            await flush();
            write.resolve();
            await starting;
            const signingIn = service.completeCurrentLogin(service.callback(SECOND));
            await Promise.all([refreshing, signingOut]);
            expect(await signingIn).to.equal(true);
            expect(persisted().activeClientId).to.equal(SECOND);
            expect(persisted().accounts[0].tokens).to.equal(undefined);
        });
    });

    describe('loopback callback and disconnect', () => {
        for (const manual of [false, true]) {
            it(`settles state-verified access_denied without exchange (${manual ? 'manual' : 'listener'})`, async () => {
                secrets.set('default', storedRegistry());
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

        it('revokes the refresh token before local persistence and retains registration and host', async () => {
            secrets.set('default', storedRegistry());
            await service.getAuthState();
            await service.signOut();
            const body = fetchStub.firstCall.args[1].body as URLSearchParams;
            expect(fetchStub.firstCall.args[0]).to.equal(REVOKE_URL);
            expect(Object.fromEntries(body)).to.deep.equal({ token: 'stored-refresh', client_id: FIRST, token_type_hint: 'refresh_token' });
            expect(fetchStub.firstCall.calledBefore(setPassword.firstCall)).to.equal(true);
            expect(persisted().accounts[0].tokens).to.equal(undefined);
            expect(persisted().accounts[0].idTokenHint).to.equal(undefined);
            expect(persisted().accounts[0].subject).to.equal('first-subject');
            expect(secrets.get(HOST_ACCOUNT)).to.equal(HOST_ID);
        });

        it('retains disconnect deletion when account selection overlaps slow revocation', async () => {
            secrets.set('default', storedRegistry(Date.now() + 3600_000, true));
            await service.getAuthState();
            const revoke = new Deferred<Response>();
            fetchStub.returns(revoke.promise);
            const signingOut = service.signOut();
            await waitFor(() => fetchStub.called);
            const selecting = service.selectAccount(SECOND);
            revoke.resolve(tokenResponse({}));
            await Promise.all([signingOut, selecting]);
            expect(persisted().activeClientId).to.equal(SECOND);
            expect(persisted().accounts[0].tokens).to.equal(undefined);
            expect(await service.getCredentials()).to.include({ accessToken: 'second-token', clientId: SECOND });
            service = instantiate();
            expect((await service.getAccounts())[0].isAuthenticated).to.equal(false);
        });

        it('falls back to revoking the access token when no refresh token exists', async () => {
            const parsed = JSON.parse(storedRegistry());
            delete parsed.accounts[0].tokens.refreshToken;
            secrets.set('default', JSON.stringify(parsed));
            await service.signOut();
            expect(Object.fromEntries(fetchStub.firstCall.args[1].body as URLSearchParams)).to.deep.equal({
                token: 'stored-token', client_id: FIRST, token_type_hint: 'access_token'
            });
        });

        it('disconnects locally without guessing a revocation URL when discovery has none', async () => {
            secrets.set('default', storedRegistry());
            service.revocationEndpoint.resolves(undefined);
            await service.signOut();
            expect(fetchStub.called).to.equal(false);
            expect(persisted().accounts[0].tokens).to.equal(undefined);
        });

        it('ignores discovery failure and disconnects without exposing its errors', async () => {
            secrets.set('default', storedRegistry());
            service.revocationEndpoint.rejects(new Error('secret discovery error'));
            await service.signOut();
            expect(fetchStub.called).to.equal(false);
            expect(persisted().accounts[0].tokens).to.equal(undefined);
        });

        it('ignores revocation failures and never exposes their errors', async () => {
            secrets.set('default', storedRegistry());
            fetchStub.rejects(new Error('secret token in remote error'));
            await service.signOut();
            expect(persisted().accounts[0].tokens).to.equal(undefined);
            expect(await service.getCredentials()).to.equal(undefined);
        });

        it('notifies clients synchronously before revocation or local persistence completes', async () => {
            secrets.set('default', storedRegistry());
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
            expect(setPassword.called).to.equal(false);
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
            expect(secrets.get('default')).to.equal(undefined);
        });
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
        it('exposes only explicitly declared frontend methods and no tokens or subjects', async () => {
            secrets.set('default', storedRegistry());
            const remote = createRemoteAuthService(service);
            expect(Object.keys(remote).sort()).to.deep.equal([
                'cancelLogin', 'completeLogin', 'getAccounts', 'getAuthState', 'onAuthStateChanged',
                'selectAccount', 'signOut', 'startLogin', 'waitForLogin'
            ]);
            expect((remote as unknown as Record<string, unknown>).getCredentials).to.equal(undefined);
            expect((remote as unknown as Record<string, unknown>).addClient).to.equal(undefined);
            const accounts = await remote.getAccounts();
            expect(Object.keys(accounts[0]).sort()).to.deep.equal(['accountLabel', 'canUseChatGptPlan', 'clientId', 'isAuthenticated']);
            expect(JSON.stringify(accounts)).not.to.contain('stored-token').and.not.to.contain('first-subject');
            const login = await remote.startLogin(FIRST);
            expect(new URL(login.authorizationUrl).searchParams.get('client_id')).to.equal(FIRST);
            await remote.cancelLogin(login.loginId);
            await remote.selectAccount(FIRST);
            expect((await remote.getAuthState()).clientId).to.equal(FIRST);
        });
    });
});
