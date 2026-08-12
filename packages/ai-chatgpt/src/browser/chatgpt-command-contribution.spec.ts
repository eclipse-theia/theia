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
import { Command, CommandHandler, CommandRegistry, Emitter, Event, MessageService } from '@theia/core';
import { QuickInputService } from '@theia/core/lib/browser';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { ChatGptAuthService, ChatGptAuthState, ChatGptLoginSession, ChatGptPreferencesSchema, MODELS_PREF } from '../common';
import { ChatGptCommandContribution, ChatGptCommands } from './chatgpt-command-contribution';

disableJSDOM();

class FakeAuthService implements ChatGptAuthService {
    authState: ChatGptAuthState = { isAuthenticated: false };
    session: ChatGptLoginSession = { authorizationUrl: 'https://auth.openai.com/oauth/authorize?code_challenge=x', callbackListening: true };
    readonly login = new Deferred<boolean>();
    readonly completed: string[] = [];
    startLoginError: Error | undefined;
    cancelledLogins = 0;
    signOuts = 0;

    protected readonly emitter = new Emitter<ChatGptAuthState>();
    readonly onAuthStateChanged: Event<ChatGptAuthState> = this.emitter.event;

    async startLogin(): Promise<ChatGptLoginSession> {
        if (this.startLoginError) {
            throw this.startLoginError;
        }
        return this.session;
    }
    waitForLogin(): Promise<boolean> {
        return this.login.promise;
    }
    async completeLogin(codeOrRedirectUrl: string): Promise<boolean> {
        this.completed.push(codeOrRedirectUrl);
        return true;
    }
    async cancelLogin(): Promise<void> {
        this.cancelledLogins++;
    }
    async getAuthState(): Promise<ChatGptAuthState> {
        return this.authState;
    }
    async signOut(): Promise<void> {
        this.signOuts++;
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

        const messageService = {
            // An action message stays open until the user picks one, which the tests model as a pending promise.
            info: (message: string, ...actions: string[]) => {
                infoMessages.push(message);
                return actions.length ? new Promise<string | undefined>(() => { }) : Promise.resolve(undefined);
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
        Object.assign(contribution, { authService, windowService, messageService, quickInputService, activationService });
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

    it('hides both commands while the AI features are disabled', () => {
        Object.assign(contribution, { activationService: { isActive: false } });
        const handlers = registerCommands();
        expect(handlers.get(ChatGptCommands.SIGN_IN.id)!.isVisible!()).to.equal(false);
        expect(handlers.get(ChatGptCommands.SIGN_OUT.id)!.isVisible!()).to.equal(false);
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

    it('asks for the authorization code when the callback listener is not reachable', async () => {
        authService.session = { authorizationUrl: 'https://auth.openai.com/oauth/authorize', callbackListening: false };
        quickInput = 'the-code';

        const handlers = registerCommands();
        await handlers.get(ChatGptCommands.SIGN_IN.id)!.execute();

        expect(quickInputRequests).to.equal(1);
        expect(authService.completed).to.deep.equal(['the-code']);
    });

    it('abandons the sign in when the authorization code input is dismissed', async () => {
        authService.session = { authorizationUrl: 'https://auth.openai.com/oauth/authorize', callbackListening: false };
        quickInput = undefined;

        const handlers = registerCommands();
        await handlers.get(ChatGptCommands.SIGN_IN.id)!.execute();

        expect(authService.completed).to.be.empty;
        expect(authService.cancelledLogins).to.equal(1);
        expect(infoMessages).to.be.empty;
    });

    it('cancels the sign in and reports the reason when it fails', async () => {
        authService.startLoginError = new Error('the port is in use');

        const handlers = registerCommands();
        await handlers.get(ChatGptCommands.SIGN_IN.id)!.execute();

        expect(errorMessages.pop()).to.contain('the port is in use');
        expect(authService.cancelledLogins).to.equal(1);
    });

    it('offers both commands as links on the preference page', () => {
        const description = ChatGptPreferencesSchema.properties[MODELS_PREF].markdownDescription!;
        expect(description).to.contain(`(command:${ChatGptCommands.SIGN_IN.id})`);
        expect(description).to.contain(`(command:${ChatGptCommands.SIGN_OUT.id})`);
        // Four leading spaces would render the links as a code block instead.
        expect(description).to.not.match(/\n {4}/);
    });
});
