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
import { ChatGptAuthState } from '../common';
import { ChatGptAuthServiceImpl, createRemoteAuthService } from './chatgpt-auth-service-impl';
import { CHATGPT_REDIRECT_URI } from './chatgpt-oauth';

/** Avoids binding the loopback callback port. The code hand over is exercised through {@link completeLogin} instead. */
class TestAuthService extends ChatGptAuthServiceImpl {
    protected override async startCallbackServer(): Promise<http.Server | undefined> {
        return undefined;
    }
    get pendingState(): string | undefined {
        return this.pendingLogin?.state;
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
    end(body: string): void {
        this.body = body;
    }
}

const REFRESHED_TOKEN = createAccessToken('refreshed-account');

function createAccessToken(accountId: string): string {
    const payload = {
        exp: Math.floor(Date.now() / 1000) + 3600,
        'https://api.openai.com/auth': { chatgpt_account_id: accountId, chatgpt_plan_type: 'plus' },
        'https://api.openai.com/profile': { email: 'user@example.com' }
    };
    return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

function tokenResponse(payload: Record<string, unknown>, status: number = 200): Response {
    return {
        ok: status < 400,
        status,
        json: async () => payload,
        text: async () => JSON.stringify(payload)
    } as Response;
}

function storedCredentials(expiresAt: number): string {
    return JSON.stringify({
        accessToken: 'stored-token',
        refreshToken: 'stored-refresh-token',
        expiresAt,
        accountId: 'account-id',
        accountLabel: 'user@example.com',
        planType: 'plus'
    });
}

async function expectRejection(promise: Promise<unknown>, message: RegExp): Promise<void> {
    let error: unknown;
    try {
        await promise;
    } catch (caught) {
        error = caught;
    }
    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.match(message);
}

/** Lets all pending microtasks run, so queued key store updates and generation changes are applied. */
async function flush(): Promise<void> {
    await new Promise(resolve => setImmediate(resolve));
}

async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
        await new Promise(resolve => setImmediate(resolve));
    }
}

describe('ChatGptAuthServiceImpl', () => {

    let authService: TestAuthService;
    let getPasswordStub: sinon.SinonStub;
    let setPasswordStub: sinon.SinonStub;
    let deletePasswordStub: sinon.SinonStub;
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        getPasswordStub = sinon.stub().resolves(undefined);
        setPasswordStub = sinon.stub().resolves();
        deletePasswordStub = sinon.stub().resolves(true);
        const keyStoreService = {
            setPassword: setPasswordStub as KeyStoreService['setPassword'],
            getPassword: getPasswordStub as KeyStoreService['getPassword'],
            deletePassword: deletePasswordStub as KeyStoreService['deletePassword'],
            findPassword: sinon.stub().resolves(undefined) as KeyStoreService['findPassword'],
            findCredentials: sinon.stub().resolves([]) as KeyStoreService['findCredentials'],
            keys: sinon.stub().resolves([]) as KeyStoreService['keys']
        };

        const container = new Container();
        container.bind(KeyStoreService).toConstantValue(keyStoreService);
        container.bind(ILogger).to(MockLogger).inSingletonScope();
        container.bind(TestAuthService).toSelf().inSingletonScope();
        authService = container.get(TestAuthService);

        fetchStub = sinon.stub(globalThis, 'fetch');
    });

    afterEach(async () => {
        // Abandoned login attempts keep a timer alive.
        await authService.cancelLogin();
        sinon.restore();
    });

    describe('getAuthState', () => {
        it('reports no session when nothing is stored', async () => {
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: false });
        });

        it('reports the account and plan of the stored session', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 3600_000));
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: true, accountLabel: 'user@example.com', planType: 'plus' });
        });

        it('reads the session from the ChatGPT key store entry', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 3600_000));
            await authService.getAuthState();
            expect(getPasswordStub.firstCall.args).to.deep.equal(['theia-chatgpt', 'default']);
        });

        it('reports no session when the stored credentials are malformed', async () => {
            getPasswordStub.resolves('not-json');
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: false });
        });

        it('reports no session for an empty stored object', async () => {
            getPasswordStub.resolves('{}');
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: false });
        });

        it('reports no session when the stored credentials have no ChatGPT account', async () => {
            getPasswordStub.resolves(JSON.stringify({ accessToken: 'token', refreshToken: 'refresh', expiresAt: Date.now() + 3600_000 }));
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: false });
            expect(await authService.getCredentials()).to.equal(undefined);
        });

        it('reports no session for blank stored values, which cannot authenticate a request', async () => {
            getPasswordStub.resolves(JSON.stringify({ accessToken: 'token', refreshToken: 'refresh', expiresAt: Date.now() + 3600_000, accountId: '   ' }));
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: false });
        });

        it('reports no session for a blank stored access token', async () => {
            getPasswordStub.resolves(JSON.stringify({ accessToken: '  ', refreshToken: 'refresh', expiresAt: Date.now() + 3600_000, accountId: 'account-id' }));
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: false });
        });
    });

    describe('completeLogin', () => {
        it('rejects when no sign in is in progress', async () => {
            await expectRejection(authService.completeLogin('the-code'), /no chatgpt sign in/i);
        });

        it('exchanges the code, stores the credentials and notifies the clients', async () => {
            const states: ChatGptAuthState[] = [];
            authService.addClient({ onAuthStateChanged: state => states.push(state) });
            fetchStub.resolves(tokenResponse({ access_token: createAccessToken('account-id'), refresh_token: 'refresh-token', expires_in: 3600 }));

            const session = await authService.startLogin();
            expect(session.callbackListening).to.equal(false);
            expect(await authService.completeLogin('the-code')).to.equal(true);

            const body = fetchStub.firstCall.args[1].body as URLSearchParams;
            expect(body.get('grant_type')).to.equal('authorization_code');
            expect(body.get('code')).to.equal('the-code');
            expect(body.get('code_verifier')).to.have.length.greaterThan(0);
            expect(body.get('redirect_uri')).to.equal(CHATGPT_REDIRECT_URI);
            expect(setPasswordStub.calledOnce).to.equal(true);
            expect(setPasswordStub.firstCall.args.slice(0, 2)).to.deep.equal(['theia-chatgpt', 'default']);
            expect(states).to.deep.equal([{ isAuthenticated: true, accountLabel: 'user@example.com', planType: 'plus' }]);
        });

        it('rejects a redirect URL that belongs to another sign in attempt', async () => {
            await authService.startLogin();
            await expectRejection(authService.completeLogin(`${CHATGPT_REDIRECT_URI}?code=the-code&state=other`), /state/);
            expect(fetchStub.called).to.equal(false);
        });

        it('accepts the redirect URL of the pending sign in attempt', async () => {
            fetchStub.resolves(tokenResponse({ access_token: createAccessToken('account-id'), refresh_token: 'refresh-token', expires_in: 3600 }));
            await authService.startLogin();
            expect(await authService.completeLogin(`${CHATGPT_REDIRECT_URI}?code=the-code&state=${authService.pendingState}`)).to.equal(true);
        });

        it('rejects a token response without a ChatGPT account', async () => {
            fetchStub.resolves(tokenResponse({ access_token: 'not-a-jwt', refresh_token: 'refresh-token', expires_in: 3600 }));
            await authService.startLogin();
            await expectRejection(authService.completeLogin('the-code'), /account could not be determined/i);
            expect(setPasswordStub.called).to.equal(false);
        });

        it('does not publish a session that could not be persisted', async () => {
            setPasswordStub.rejects(new Error('key store unavailable'));
            fetchStub.resolves(tokenResponse({ access_token: createAccessToken('account-id'), refresh_token: 'refresh-token', expires_in: 3600 }));

            await authService.startLogin();
            await expectRejection(authService.completeLogin('the-code'), /key store unavailable/);
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: false });
        });

        it('does not sign in a login attempt that was cancelled while the tokens were requested', async () => {
            let respond: (response: Response) => void = () => { };
            fetchStub.returns(new Promise<Response>(resolve => { respond = resolve; }));

            await authService.startLogin();
            const signingIn = authService.completeLogin('the-code');
            await waitFor(() => fetchStub.called);
            await authService.cancelLogin();
            respond(tokenResponse({ access_token: createAccessToken('account-id'), refresh_token: 'refresh-token', expires_in: 3600 }));

            expect(await signingIn).to.equal(false);
            expect(setPasswordStub.called).to.equal(false);
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: false });
        });

        it('stops notifying a client whose registration was disposed', async () => {
            const states: ChatGptAuthState[] = [];
            authService.addClient({ onAuthStateChanged: state => states.push(state) }).dispose();
            fetchStub.resolves(tokenResponse({ access_token: createAccessToken('account-id'), refresh_token: 'refresh-token', expires_in: 3600 }));

            await authService.startLogin();
            await authService.completeLogin('the-code');
            expect(states).to.be.empty;
        });
    });

    describe('getCredentials', () => {
        it('returns undefined when there is no session', async () => {
            expect(await authService.getCredentials()).to.equal(undefined);
        });

        it('uses the stored access token while it is valid', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 3600_000));
            expect(await authService.getCredentials()).to.deep.equal({ accessToken: 'stored-token', accountId: 'account-id' });
            expect(fetchStub.called).to.equal(false);
        });

        it('serves callers that arrive while the key store is still being read', async () => {
            getPasswordStub.callsFake(async () => {
                await new Promise(resolve => setImmediate(resolve));
                return storedCredentials(Date.now() + 3600_000);
            });

            const [first, second] = await Promise.all([authService.getCredentials(), authService.getCredentials()]);
            expect(first).to.deep.equal({ accessToken: 'stored-token', accountId: 'account-id' });
            expect(second).to.deep.equal(first);
            expect(getPasswordStub.calledOnce).to.equal(true);
        });

        it('refreshes an expiring access token and retains the refresh token when none is rotated in', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 1000));
            fetchStub.resolves(tokenResponse({ access_token: REFRESHED_TOKEN, expires_in: 3600 }));

            expect(await authService.getCredentials()).to.deep.equal({ accessToken: REFRESHED_TOKEN, accountId: 'refreshed-account' });

            const body = fetchStub.firstCall.args[1].body as URLSearchParams;
            expect(body.get('grant_type')).to.equal('refresh_token');
            expect(body.get('refresh_token')).to.equal('stored-refresh-token');
            expect(JSON.parse(setPasswordStub.firstCall.args[2]).refreshToken).to.equal('stored-refresh-token');
        });

        it('performs a single token request for concurrent refreshes', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 1000));
            fetchStub.resolves(tokenResponse({ access_token: REFRESHED_TOKEN, refresh_token: 'rotated', expires_in: 3600 }));

            const [first, second] = await Promise.all([authService.getCredentials(), authService.getCredentials()]);
            expect(first).to.deep.equal(second);
            expect(fetchStub.calledOnce).to.equal(true);
        });

        it('signs out when the refresh token is rejected', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 1000));
            fetchStub.resolves(tokenResponse({ error: 'invalid_grant' }, 400));

            await expectRejection(authService.getCredentials(), /session has expired/i);
            expect(deletePasswordStub.calledOnce).to.equal(true);
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: false });
        });

        it('signs out when the refresh token is reported as spent under an OpenAI specific code', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 1000));
            fetchStub.resolves(tokenResponse({ error: 'refresh_token_expired' }, 400));

            await expectRejection(authService.getCredentials(), /session has expired/i);
            expect(deletePasswordStub.calledOnce).to.equal(true);
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: false });
        });

        it('keeps the session when the refresh fails temporarily', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 1000));
            fetchStub.resolves(tokenResponse({ error: 'server_error' }, 503));

            await expectRejection(authService.getCredentials(), /503/);
            expect(deletePasswordStub.called).to.equal(false);
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: true, accountLabel: 'user@example.com', planType: 'plus' });
        });

        it('keeps the session when the refresh is rate limited, which does not reject the grant', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 1000));
            fetchStub.resolves(tokenResponse({ error: 'rate_limit_exceeded' }, 429));

            await expectRejection(authService.getCredentials(), /429/);
            expect(deletePasswordStub.called).to.equal(false);
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: true, accountLabel: 'user@example.com', planType: 'plus' });
        });

        it('keeps the session when the token endpoint answers without an OAuth error', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 1000));
            fetchStub.resolves({ ok: false, status: 400, text: async () => '<html>Bad Request</html>' } as Response);

            await expectRejection(authService.getCredentials(), /400/);
            expect(deletePasswordStub.called).to.equal(false);
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: true, accountLabel: 'user@example.com', planType: 'plus' });
        });

        it('keeps the account of the session when a refreshed token does not restate it', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 1000));
            fetchStub.resolves(tokenResponse({ access_token: 'not-a-jwt', refresh_token: 'rotated', expires_in: 3600 }));

            expect(await authService.getCredentials()).to.deep.equal({ accessToken: 'not-a-jwt', accountId: 'account-id' });
            expect(JSON.parse(setPasswordStub.firstCall.args[2])).to.include({ accountId: 'account-id', accountLabel: 'user@example.com', planType: 'plus' });
        });

        it('discards a refresh that completes after the user signed out', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 1000));
            let respond: (response: Response) => void = () => { };
            fetchStub.returns(new Promise<Response>(resolve => { respond = resolve; }));

            const refreshing = authService.getCredentials();
            await waitFor(() => fetchStub.called);
            await authService.signOut();
            respond(tokenResponse({ access_token: REFRESHED_TOKEN, refresh_token: 'rotated', expires_in: 3600 }));

            expect(await refreshing).to.equal(undefined);
            expect(setPasswordStub.called).to.equal(false);
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: false });
        });

        it('does not sign out the session of a new sign in when a stale refresh is rejected', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 1000));
            const newToken = createAccessToken('new-account');
            let respond: (response: Response) => void = () => { };
            fetchStub.returns(new Promise<Response>(resolve => { respond = resolve; }));

            const refreshing = authService.getCredentials();
            await waitFor(() => fetchStub.called);
            await authService.signOut();

            fetchStub.resolves(tokenResponse({ access_token: newToken, refresh_token: 'new-refresh', expires_in: 3600 }));
            await authService.startLogin();
            expect(await authService.completeLogin('the-code')).to.equal(true);

            respond(tokenResponse({ error: 'invalid_grant' }, 400));

            expect(await refreshing).to.equal(undefined);
            // Only the explicit sign out removed credentials, the rejected refresh left the new session alone.
            expect(deletePasswordStub.calledOnce).to.equal(true);
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: true, accountLabel: 'user@example.com', planType: 'plus' });
            expect(await authService.getCredentials()).to.deep.equal({ accessToken: newToken, accountId: 'new-account' });
        });

        it('does not publish a session whose write outlived the sign out', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 1000));
            fetchStub.resolves(tokenResponse({ access_token: REFRESHED_TOKEN, refresh_token: 'rotated', expires_in: 3600 }));
            let completeWrite: () => void = () => { };
            setPasswordStub.returns(new Promise<void>(resolve => { completeWrite = resolve; }));

            const refreshing = authService.getCredentials();
            await waitFor(() => setPasswordStub.called);
            const signingOut = authService.signOut();
            await flush();
            completeWrite();
            await signingOut;

            expect(await refreshing).to.equal(undefined);
            // The sign out is queued behind the stale write, so it removes what that write left behind.
            expect(deletePasswordStub.calledOnce).to.equal(true);
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: false });
        });

        it('keeps the session of a sign in that happened while a stale write was still pending', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 1000));
            fetchStub.resolves(tokenResponse({ access_token: REFRESHED_TOKEN, refresh_token: 'rotated', expires_in: 3600 }));
            let completeStaleWrite: () => void = () => { };
            setPasswordStub.onFirstCall().returns(new Promise<void>(resolve => { completeStaleWrite = resolve; }));
            setPasswordStub.onSecondCall().resolves();

            const refreshing = authService.getCredentials();
            await waitFor(() => setPasswordStub.called);
            const signingOut = authService.signOut();
            await flush();

            fetchStub.resolves(tokenResponse({ access_token: createAccessToken('new-account'), refresh_token: 'new-refresh', expires_in: 3600 }));
            await authService.startLogin();
            const signingIn = authService.completeLogin('the-code');
            await flush();

            completeStaleWrite();
            await Promise.all([refreshing, signingOut, signingIn]);

            expect(await signingIn).to.equal(true);
            expect(JSON.parse(setPasswordStub.lastCall.args[2]).accountId).to.equal('new-account');
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: true, accountLabel: 'user@example.com', planType: 'plus' });
        });
    });

    describe('loopback callback', () => {
        beforeEach(async () => {
            await authService.startLogin();
        });

        it('rejects a request to an unknown route', () => {
            expect(authService.callCallback(`/elsewhere?code=the-code&state=${authService.pendingState}`).statusCode).to.equal(404);
            expect(fetchStub.called).to.equal(false);
        });

        it('rejects a callback of another sign in attempt', () => {
            expect(authService.callCallback('/auth/callback?code=the-code&state=other').statusCode).to.equal(400);
            expect(fetchStub.called).to.equal(false);
        });

        it('rejects a callback without an authorization code', () => {
            expect(authService.callCallback(`/auth/callback?state=${authService.pendingState}`).statusCode).to.equal(400);
            expect(fetchStub.called).to.equal(false);
        });

        it('exchanges the code delivered by the browser', async () => {
            fetchStub.resolves(tokenResponse({ access_token: createAccessToken('account-id'), refresh_token: 'refresh-token', expires_in: 3600 }));

            expect(authService.callCallback(`/auth/callback?code=the-code&state=${authService.pendingState}`).statusCode).to.equal(200);

            expect(await authService.waitForLogin()).to.equal(true);
            expect((fetchStub.firstCall.args[1].body as URLSearchParams).get('code')).to.equal('the-code');
        });
    });

    describe('signOut', () => {
        it('deletes the stored credentials and notifies the clients', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 3600_000));
            const states: ChatGptAuthState[] = [];
            authService.addClient({ onAuthStateChanged: state => states.push(state) });

            await authService.getAuthState();
            await authService.signOut();

            expect(deletePasswordStub.calledOnce).to.equal(true);
            expect(deletePasswordStub.firstCall.args).to.deep.equal(['theia-chatgpt', 'default']);
            expect(states).to.deep.equal([{ isAuthenticated: false }]);
            expect(await authService.getAuthState()).to.deep.equal({ isAuthenticated: false });
        });

        it('abandons a pending sign in', async () => {
            await authService.startLogin();
            const pending = authService.waitForLogin();
            await authService.signOut();
            expect(await pending).to.equal(false);
        });
    });

    describe('createRemoteAuthService', () => {
        // The RPC proxy invokes `target[method](...args)`, so whatever the target carries is callable by a frontend.
        function invoke(target: object, method: string, ...args: unknown[]): unknown {
            const callable = (target as Record<string, unknown>)[method];
            return typeof callable === 'function' ? (callable as (...parameters: unknown[]) => unknown).apply(target, args) : undefined;
        }

        it('does not expose the access token to the frontend', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 3600_000));
            const remote = createRemoteAuthService(authService);

            expect(invoke(remote, 'getCredentials')).to.equal(undefined);
            expect(await authService.getCredentials()).to.deep.equal({ accessToken: 'stored-token', accountId: 'account-id' });
        });

        it('serves only the methods of the service interface', () => {
            const remote = createRemoteAuthService(authService);
            const served = Object.keys(remote).filter(key => typeof (remote as unknown as Record<string, unknown>)[key] === 'function');
            // `onAuthStateChanged` is an event the frontend proxy resolves locally, it is never dispatched over RPC.
            expect(served.sort()).to.deep.equal(
                ['cancelLogin', 'completeLogin', 'getAuthState', 'onAuthStateChanged', 'signOut', 'startLogin', 'waitForLogin']
            );
            expect(invoke(remote, 'addClient', { onAuthStateChanged: () => { } })).to.equal(undefined);
        });

        it('delegates the served methods to the backend service', async () => {
            getPasswordStub.resolves(storedCredentials(Date.now() + 3600_000));
            const remote = createRemoteAuthService(authService);

            expect(await remote.getAuthState()).to.deep.equal({ isAuthenticated: true, accountLabel: 'user@example.com', planType: 'plus' });
            expect((await remote.startLogin()).authorizationUrl).to.match(/^https:\/\/auth\.openai\.com\/oauth\/authorize\?/);
            await remote.signOut();
            expect(deletePasswordStub.calledOnce).to.equal(true);
            expect(await remote.getAuthState()).to.deep.equal({ isAuthenticated: false });
        });
    });
});
