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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { stub } from 'sinon';
import { Command, CommandHandler, CommandRegistry, Emitter, Event, MessageService, PreferenceService } from '@theia/core';
import { ConfirmDialog, QuickInputService } from '@theia/core/lib/browser';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import {
    CHATGPT_AUTHENTICATION_MODE_PREF, CHATGPT_ENABLED_PREF, ChatGptAuthService, ChatGptAuthState, ChatGptLoginSession, ChatGptPreferencesSchema
} from '../common/index.js';
import { ChatGptCommandContribution, ChatGptCommands } from './chatgpt-command-contribution.js';

disableJSDOM();

class FakeAuthService implements ChatGptAuthService {
    authState: ChatGptAuthState = { isAuthenticated: false };
    session: ChatGptLoginSession = { loginId: 'login', authorizationUrl: 'https://auth.openai.com/oauth/authorize?code_challenge=x', callbackListening: true };
    readonly login = new Deferred<boolean>();
    readonly completed: string[] = [];
    readonly completedLoginIds: string[] = [];
    readonly cancelledLoginIds: string[] = [];
    readonly waitedLoginIds: string[] = [];
    startLoginError: Error | undefined;
    cancelledLogins = 0;
    signOuts = 0;
    loginStarts = 0;

    protected readonly emitter = new Emitter<ChatGptAuthState>();
    readonly onAuthStateChanged: Event<ChatGptAuthState> = this.emitter.event;

    async startLogin(): Promise<ChatGptLoginSession> {
        this.loginStarts++;
        if (this.startLoginError) {
            throw this.startLoginError;
        }
        return this.session;
    }
    waitForLogin(loginId: string): Promise<boolean> {
        this.waitedLoginIds.push(loginId);
        return this.login.promise;
    }
    async completeLogin(codeOrRedirectUrl: string, loginId: string): Promise<boolean> {
        this.completed.push(codeOrRedirectUrl);
        this.completedLoginIds.push(loginId);
        return true;
    }
    async cancelLogin(loginId: string): Promise<void> {
        this.cancelledLogins++;
        this.cancelledLoginIds.push(loginId);
    }
    async getAuthState(): Promise<ChatGptAuthState> {
        return this.authState;
    }
    async signOut(): Promise<void> {
        this.signOuts++;
        this.fireAuthStateChanged({ isAuthenticated: false });
    }
    fireAuthStateChanged(state: ChatGptAuthState): void {
        this.authState = state;
        this.emitter.fire(state);
    }
}

describe('ChatGptCommandContribution', () => {

    let authService: FakeAuthService;
    let contribution: ChatGptCommandContribution;
    let openedUrls: string[];
    let infoMessages: string[];
    let errorMessages: string[];
    let quickInput: string | undefined;
    let quickInputRequests: number;
    let authenticationMode: 'codex' | 'oss';
    let notifications: { actions: string[]; result: Deferred<string | undefined>; closed: boolean; whenClosed: Deferred<void> }[];

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(async () => {
        authService = new FakeAuthService();
        openedUrls = [];
        infoMessages = [];
        errorMessages = [];
        quickInput = undefined;
        quickInputRequests = 0;
        authenticationMode = 'codex';
        notifications = [];

        const messageService = {
            info: (message: string) => {
                infoMessages.push(message);
                return Promise.resolve(undefined);
            },
            showProgress: (message: { actions: string[] }) => {
                const notification = { actions: message.actions, result: new Deferred<string | undefined>(), closed: false, whenClosed: new Deferred<void>() };
                notifications.push(notification);
                return Promise.resolve({
                    cancel: () => {
                        notification.closed = true;
                        notification.whenClosed.resolve();
                        notification.result.resolve(undefined);
                    },
                    result: notification.result.promise
                });
            },
            error: (message: string) => {
                errorMessages.push(message);
                return Promise.resolve(undefined);
            }
        } as unknown as MessageService;
        const windowService = { openNewWindow: (url: string) => { openedUrls.push(url); } } as unknown as WindowService;
        const quickInputService = {
            input: () => {
                quickInputRequests++;
                return Promise.resolve(quickInput);
            }
        } as unknown as QuickInputService;
        const activationService = { isActive: true } as unknown as AIActivationService;

        contribution = new ChatGptCommandContribution();
        const preferenceService = {
            get: (name: string, fallback: unknown) => name === CHATGPT_AUTHENTICATION_MODE_PREF ? authenticationMode : fallback
        } as unknown as PreferenceService;
        Object.assign(contribution, { authService, windowService, messageService, quickInputService, activationService, preferenceService });
        (contribution as unknown as { init(): void }).init();
        // The initial state is fetched asynchronously.
        await Promise.resolve();
    });

    afterEach(() => {
        contribution.dispose();
    });

    function registerCommands(): Map<string, CommandHandler> {
        const handlers = new Map<string, CommandHandler>();
        contribution.registerCommands({
            registerCommand: (command: Command, handler: CommandHandler) => handlers.set(command.id, handler)
        } as unknown as CommandRegistry);
        return handlers;
    }

    it('offers signing in while there is no session and signing out once there is one', () => {
        const handlers = registerCommands();
        expect(handlers.get(ChatGptCommands.SIGN_IN.id)!.isEnabled!()).to.equal(true);
        expect(handlers.get(ChatGptCommands.SIGN_OUT.id)!.isEnabled!()).to.equal(false);

        authService.fireAuthStateChanged({ isAuthenticated: true, accountLabel: 'user@example.com' });

        expect(handlers.get(ChatGptCommands.SIGN_IN.id)!.isEnabled!()).to.equal(false);
        expect(handlers.get(ChatGptCommands.SIGN_OUT.id)!.isEnabled!()).to.equal(true);
    });

    function initWithPendingAuthState(): Deferred<ChatGptAuthState> {
        contribution.dispose();
        const lookup = new Deferred<ChatGptAuthState>();
        authService.getAuthState = () => lookup.promise;
        contribution = new ChatGptCommandContribution();
        Object.assign(contribution, { authService });
        (contribution as unknown as { init(): void }).init();
        return lookup;
    }

    for (const isAuthenticated of [true, false]) {
        it(`ignores an initial lookup after a newer ${isAuthenticated ? 'sign-in' : 'sign-out'} event`, async () => {
            const lookup = initWithPendingAuthState();
            const handlers = registerCommands();
            authService.fireAuthStateChanged({ isAuthenticated });
            lookup.resolve({ isAuthenticated: !isAuthenticated });
            await lookup.promise;
            expect(handlers.get(ChatGptCommands.SIGN_IN.id)!.isEnabled!()).to.equal(!isAuthenticated);
            expect(handlers.get(ChatGptCommands.SIGN_OUT.id)!.isEnabled!()).to.equal(isAuthenticated);
        });
    }

    it('ignores an initial lookup completed after disposal', async () => {
        const lookup = initWithPendingAuthState();
        const handlers = registerCommands();
        contribution.dispose();
        authService.fireAuthStateChanged({ isAuthenticated: true });
        lookup.resolve({ isAuthenticated: true });
        await lookup.promise;
        expect(handlers.get(ChatGptCommands.SIGN_IN.id)!.isEnabled!()).to.equal(true);
        expect(handlers.get(ChatGptCommands.SIGN_OUT.id)!.isEnabled!()).to.equal(false);
    });

    it('hides all commands while the AI features are disabled', () => {
        authenticationMode = 'oss';
        Object.assign(contribution, { activationService: { isActive: false } });
        const handlers = registerCommands();
        expect(handlers.get(ChatGptCommands.SIGN_IN.id)!.isVisible!()).to.equal(false);
        expect(handlers.get(ChatGptCommands.SIGN_OUT.id)!.isVisible!()).to.equal(false);
    });

    it('hides all commands while the ChatGPT provider is disabled', () => {
        authenticationMode = 'oss';
        Object.assign(contribution, { preferenceService: { get: () => false } });
        const handlers = registerCommands();
        expect(handlers.get(ChatGptCommands.SIGN_IN.id)!.isVisible!()).to.equal(false);
        expect(handlers.get(ChatGptCommands.SIGN_OUT.id)!.isVisible!()).to.equal(false);
    });

    it('shows both commands when AI and the provider are enabled', () => {
        const handlers = registerCommands();
        expect(handlers.get(ChatGptCommands.SIGN_IN.id)!.isVisible!()).to.equal(true);
        expect(handlers.get(ChatGptCommands.SIGN_OUT.id)!.isVisible!()).to.equal(true);
        expect(ChatGptPreferencesSchema.properties[CHATGPT_ENABLED_PREF].default).to.equal(true);
    });

    it('opens the authorization page and reports the account once the browser completed the sign in', async () => {
        const handlers = registerCommands();
        const signingIn = handlers.get(ChatGptCommands.SIGN_IN.id)!.execute();

        await Promise.resolve();
        expect(openedUrls).to.deep.equal([authService.session.authorizationUrl]);

        authService.authState = { isAuthenticated: true, accountLabel: 'user@example.com' };
        authService.login.resolve(true);
        await signingIn;

        expect(infoMessages.pop()).to.contain('user@example.com');
        expect(quickInputRequests).to.equal(0);
    });

    for (const change of ['auth-event', 'dispose']) {
        it(`ignores a post-login lookup after ${change}`, async () => {
            const lookup = new Deferred<ChatGptAuthState>();
            const lookupStarted = new Deferred<void>();
            authService.getAuthState = () => {
                lookupStarted.resolve();
                return lookup.promise;
            };
            const handlers = registerCommands();
            const signingIn = handlers.get(ChatGptCommands.SIGN_IN.id)!.execute();
            authService.login.resolve(true);
            await lookupStarted.promise;

            if (change === 'auth-event') {
                authService.fireAuthStateChanged({ isAuthenticated: false });
            } else {
                contribution.dispose();
            }
            lookup.resolve({ isAuthenticated: true, accountLabel: 'old@example.com' });
            await signingIn;

            expect(handlers.get(ChatGptCommands.SIGN_IN.id)!.isEnabled!()).to.equal(true);
            expect(handlers.get(ChatGptCommands.SIGN_OUT.id)!.isEnabled!()).to.equal(false);
            expect(infoMessages.some(message => message.includes('Connected to ChatGPT'))).to.equal(false);
        });
    }

    for (const outcome of ['success', 'cancelled', 'rejected']) {
        it(`closes the waiting notification when authorization is ${outcome}`, async () => {
            const signingIn = registerCommands().get(ChatGptCommands.SIGN_IN.id)!.execute();
            await Promise.resolve();
            expect(notifications).to.have.lengthOf(1);
            expect(notifications[0].closed).to.equal(false);
            if (outcome === 'rejected') {
                authService.login.reject(new Error('Authorization failed'));
            } else {
                authService.login.resolve(outcome === 'success');
            }
            await signingIn;
            expect(notifications[0].closed).to.equal(true);
            expect(quickInputRequests).to.equal(0);
            expect(errorMessages).to.have.lengthOf(outcome === 'rejected' ? 1 : 0);
        });
    }

    it('closes the waiting notification on disposal before the backend settles', async () => {
        const signingIn = registerCommands().get(ChatGptCommands.SIGN_IN.id)!.execute();
        await Promise.resolve();
        // Let the notification handle arrive before disposing the flow.
        await Promise.resolve();
        contribution.dispose();
        expect(notifications[0].closed).to.equal(true);
        await signingIn;
        expect(quickInputRequests).to.equal(0);
        expect(authService.cancelledLoginIds).to.deep.equal(['login']);
        authService.login.reject(new Error('Disposed login'));
        await Promise.resolve();
        expect(errorMessages).to.be.empty;
    });

    it('closes a notification whose handle arrives after disposal', async () => {
        const signingIn = registerCommands().get(ChatGptCommands.SIGN_IN.id)!.execute();
        await Promise.resolve();
        contribution.dispose();
        await signingIn;
        expect(notifications[0].closed).to.equal(true);
        expect(authService.waitedLoginIds).to.be.empty;
    });

    it('keeps waiting if the waiting notification is dismissed', async () => {
        const signingIn = registerCommands().get(ChatGptCommands.SIGN_IN.id)!.execute();
        await Promise.resolve();
        notifications[0].result.resolve(undefined);
        authService.login.resolve(true);
        await signingIn;
        expect(notifications[0].closed).to.equal(true);
        expect(authService.waitedLoginIds).to.deep.equal(['login']);
        expect(quickInputRequests).to.equal(0);
    });

    for (const input of [undefined, 'http://localhost:1455/auth/callback?code=manual']) {
        it(`preserves manual callback ${input === undefined ? 'dismissal' : 'entry'} from the waiting notification`, async () => {
            quickInput = input;
            const signingIn = registerCommands().get(ChatGptCommands.SIGN_IN.id)!.execute();
            await Promise.resolve();
            notifications[0].result.resolve(notifications[0].actions[0]);
            await signingIn;
            expect(quickInputRequests).to.equal(1);
            expect(authService.completed).to.deep.equal(input === undefined ? [] : [input]);
            expect(authService.cancelledLoginIds).to.deep.equal(input === undefined ? ['login'] : []);
            expect(notifications[0].closed).to.equal(true);
            // A later backend rejection must remain handled after the manual path wins the race.
            authService.login.reject(new Error('Listener stopped'));
            await Promise.resolve();
            expect(errorMessages).to.be.empty;
        });
    }

    for (const outcome of ['success', 'cancelled', 'rejected']) {
        it(`closes the notification when authorization is ${outcome} with manual input still open`, async () => {
            const manual = new Deferred<string | undefined>();
            const inputRequested = new Deferred<void>();
            Object.assign(contribution, {
                quickInputService: {
                    input: () => {
                        inputRequested.resolve();
                        return manual.promise;
                    }
                }
            });
            const signingIn = registerCommands().get(ChatGptCommands.SIGN_IN.id)!.execute();
            await Promise.resolve();
            notifications[0].result.resolve(notifications[0].actions[0]);
            await inputRequested.promise;
            if (outcome === 'rejected') {
                authService.login.reject(new Error('Listener stopped'));
            } else {
                authService.login.resolve(outcome === 'success');
            }
            await notifications[0].whenClosed.promise;
            expect(notifications[0].closed).to.equal(true);
            manual.resolve(undefined);
            await signingIn;
            expect(errorMessages).to.be.empty;
        });
    }

    it('asks for the full callback URL when the listener is not reachable', async () => {
        authService.session = { loginId: 'login', authorizationUrl: 'https://auth.openai.com/oauth/authorize', callbackListening: false };
        quickInput = 'http://127.0.0.1:1455/auth/callback?code=the-code&state=state&client_id=dynamic_agent_client_test';

        const handlers = registerCommands();
        await handlers.get(ChatGptCommands.SIGN_IN.id)!.execute();

        expect(quickInputRequests).to.equal(1);
        expect(authService.completed).to.deep.equal([quickInput]);
        expect(authService.completedLoginIds).to.deep.equal(['login']);
    });

    it('abandons the sign in when the authorization code input is dismissed', async () => {
        authService.session = { loginId: 'login', authorizationUrl: 'https://auth.openai.com/oauth/authorize', callbackListening: false };
        quickInput = undefined;

        const handlers = registerCommands();
        await handlers.get(ChatGptCommands.SIGN_IN.id)!.execute();

        expect(authService.completed).to.be.empty;
        expect(authService.cancelledLogins).to.equal(1);
        expect(infoMessages).to.be.empty;
    });

    it('starts a login without selecting a client registration in the frontend', async () => {
        const startLogin = stub(authService, 'startLogin').resolves(authService.session);
        authService.login.resolve(false);
        await registerCommands().get(ChatGptCommands.SIGN_IN.id)!.execute();
        expect(startLogin.calledOnceWithExactly()).to.equal(true);
    });

    it('allows reconnecting when authenticated without token sharing', async () => {
        authService.fireAuthStateChanged({ isAuthenticated: true, canUseChatGptPlan: false });
        const handlers = registerCommands();
        expect(handlers.get(ChatGptCommands.SIGN_IN.id)!.isEnabled!()).to.equal(true);
        expect(handlers.get(ChatGptCommands.SIGN_OUT.id)!.isEnabled!()).to.equal(true);
    });

    it('reports identity-only login without claiming plan access', async () => {
        authService.authState = { isAuthenticated: true, canUseChatGptPlan: false };
        authService.login.resolve(true);
        await registerCommands().get(ChatGptCommands.SIGN_IN.id)!.execute();
        expect(infoMessages.pop()).to.contain('token sharing is not enabled');
    });

    for (const mode of ['codex', 'oss'] as const) {
        it(`offers only sign-in and sign-out commands in ${mode} mode`, () => {
            authenticationMode = mode;
            expect([...registerCommands().keys()]).to.deep.equal([ChatGptCommands.SIGN_IN.id, ChatGptCommands.SIGN_OUT.id]);
        });

        it(`changes accounts by signing out and signing in again in ${mode} mode`, async () => {
            authenticationMode = mode;
            authService.fireAuthStateChanged({ isAuthenticated: true, accountLabel: 'first@example.com' });
            const handlers = registerCommands();
            const confirm = stub(ConfirmDialog.prototype, 'open').resolves(true);
            try {
                await handlers.get(ChatGptCommands.SIGN_OUT.id)!.execute();
            } finally {
                confirm.restore();
            }
            expect(authService.signOuts).to.equal(1);
            expect(handlers.get(ChatGptCommands.SIGN_IN.id)!.isEnabled!()).to.equal(true);
            expect(handlers.get(ChatGptCommands.SIGN_OUT.id)!.isEnabled!()).to.equal(false);

            authService.authState = { isAuthenticated: true, accountLabel: 'other@example.com' };
            authService.login.resolve(true);
            await handlers.get(ChatGptCommands.SIGN_IN.id)!.execute();
            expect(authService.loginStarts).to.equal(1);
            expect(infoMessages.pop()).to.contain('other@example.com');
            expect(handlers.get(ChatGptCommands.SIGN_IN.id)!.isEnabled!()).to.equal(false);
        });
    }

    it('does not cancel a replacement when an older startup rejects', async () => {
        const first = new Deferred<ChatGptLoginSession>();
        let starts = 0;
        authService.startLogin = () => ++starts === 1 ? first.promise : Promise.resolve({ ...authService.session, loginId: 'new' });
        const execute = registerCommands().get(ChatGptCommands.SIGN_IN.id)!.execute;
        const oldLogin = execute();
        const newLogin = execute();
        await Promise.resolve();
        first.reject(new Error('The old sign in was cancelled.'));
        await oldLogin;
        expect(authService.cancelledLoginIds).to.be.empty;
        expect(errorMessages).to.be.empty;
        expect(authService.waitedLoginIds).to.deep.equal(['new']);
        authService.login.resolve(false);
        await newLogin;
    });

    it('cancels only an older listener when its startup finishes after a replacement', async () => {
        const first = new Deferred<ChatGptLoginSession>();
        let starts = 0;
        authService.startLogin = () => ++starts === 1 ? first.promise : Promise.resolve({ ...authService.session, loginId: 'new' });
        const execute = registerCommands().get(ChatGptCommands.SIGN_IN.id)!.execute;
        const oldLogin = execute();
        const newLogin = execute();
        await Promise.resolve();
        first.resolve({ ...authService.session, loginId: 'old' });
        await oldLogin;
        expect(authService.cancelledLoginIds).to.deep.equal(['old']);
        expect(openedUrls).to.have.lengthOf(1);
        authService.login.resolve(false);
        await newLogin;
    });

    for (const input of [undefined, 'http://127.0.0.1:1455/auth/callback?code=old']) {
        it(`ignores a replaced manual dialog returning ${input === undefined ? 'dismissal' : 'a callback'}`, async () => {
            const manual = new Deferred<string | undefined>();
            Object.assign(contribution, { quickInputService: { input: () => manual.promise } });
            let starts = 0;
            authService.startLogin = async () => {
                starts++;
                return { ...authService.session, loginId: starts === 1 ? 'old' : 'new', callbackListening: starts !== 1 };
            };
            const execute = registerCommands().get(ChatGptCommands.SIGN_IN.id)!.execute;
            const oldLogin = execute();
            await Promise.resolve();
            const newLogin = execute();
            await Promise.resolve();
            manual.resolve(input);
            await oldLogin;
            expect(authService.cancelledLoginIds).to.be.empty;
            expect(authService.completedLoginIds).to.be.empty;
            authService.login.resolve(false);
            await newLogin;
        });
    }

    it('targets the original attempt when another frontend replaces a manual login', async () => {
        const manual = new Deferred<string | undefined>();
        Object.assign(contribution, { quickInputService: { input: () => manual.promise } });
        authService.session = { ...authService.session, loginId: 'original', callbackListening: false };
        const signingIn = registerCommands().get(ChatGptCommands.SIGN_IN.id)!.execute();
        await Promise.resolve();
        // Another frontend changes the backend attempt without changing this contribution's local generation.
        authService.session = { ...authService.session, loginId: 'replacement' };
        manual.resolve(undefined);
        await signingIn;
        expect(authService.cancelledLoginIds).to.deep.equal(['original']);
    });

    it('cancels a late owned listener after disposal without opening its authorization page', async () => {
        const session = new Deferred<ChatGptLoginSession>();
        authService.startLogin = () => session.promise;
        const signingIn = registerCommands().get(ChatGptCommands.SIGN_IN.id)!.execute();
        contribution.dispose();
        session.resolve({ ...authService.session, loginId: 'late' });
        await signingIn;
        expect(openedUrls).to.be.empty;
        expect(authService.cancelledLoginIds).to.deep.equal(['late']);
    });

    it('reports a startup failure without cancelling an unrelated attempt', async () => {
        authService.startLoginError = new Error('the port is in use');

        const handlers = registerCommands();
        await handlers.get(ChatGptCommands.SIGN_IN.id)!.execute();

        expect(errorMessages.pop()).to.contain('the port is in use');
        expect(authService.cancelledLogins).to.equal(0);
    });

});
