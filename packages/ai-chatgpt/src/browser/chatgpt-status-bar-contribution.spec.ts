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
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { Emitter, PreferenceChange, PreferenceService } from '@theia/core';
import { StatusBar, StatusBarAlignment, StatusBarEntry } from '@theia/core/lib/browser/status-bar/status-bar-types';
import { ChatGptAuthService, ChatGptAuthState, CHATGPT_ENABLED_PREF } from '../common';
import { ChatGptCommands } from './chatgpt-command-contribution';
import { ChatGptStatusBarContribution } from './chatgpt-status-bar-contribution';

disableJSDOM();

describe('ChatGptStatusBarContribution', () => {
    let contribution: ChatGptStatusBarContribution;
    let authEmitter: Emitter<ChatGptAuthState>;
    let activationEmitter: Emitter<boolean>;
    let preferenceEmitter: Emitter<PreferenceChange>;
    let entries: Map<string, StatusBarEntry>;
    let active: boolean;
    let enabled: boolean;
    let initialState: Promise<ChatGptAuthState>;

    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        disableJSDOM();
    });
    beforeEach(() => {
        active = true;
        enabled = true;
        initialState = Promise.resolve({ isAuthenticated: false });
        authEmitter = new Emitter<ChatGptAuthState>();
        activationEmitter = new Emitter<boolean>();
        preferenceEmitter = new Emitter<PreferenceChange>();
        entries = new Map();
        contribution = new ChatGptStatusBarContribution();
        Object.assign(contribution, {
            statusBar: {
                setElement: (id: string, value: StatusBarEntry) => entries.set(id, value),
                removeElement: (id: string) => entries.delete(id)
            } as unknown as StatusBar,
            authService: {
                getAuthState: () => initialState,
                onAuthStateChanged: authEmitter.event
            } as unknown as ChatGptAuthService,
            activationService: {
                get isActive(): boolean { return active; },
                onDidChangeActiveStatus: activationEmitter.event
            } as unknown as AIActivationService,
            preferenceService: {
                get: () => enabled,
                onPreferenceChanged: preferenceEmitter.event
            } as unknown as PreferenceService
        });
        (contribution as unknown as { init(): void }).init();
    });
    afterEach(() => {
        contribution.dispose();
        authEmitter.dispose();
        activationEmitter.dispose();
        preferenceEmitter.dispose();
    });

    function entry(): StatusBarEntry | undefined {
        return entries.get('chatgpt-auth-status');
    }

    async function start(): Promise<void> {
        contribution.onStart();
        await Promise.resolve();
    }

    it('offers sign-in while signed out and account sign-out after sign-in', async () => {
        await start();
        expect(entry()?.command).to.equal(ChatGptCommands.SIGN_IN.id);
        expect(entry()?.text).to.contain('Sign in with ChatGPT');
        expect(entry()?.alignment).to.equal(StatusBarAlignment.RIGHT);
        authEmitter.fire({ isAuthenticated: true, accountLabel: 'user@example.com' });
        expect(entry()?.text).to.contain('ChatGPT');
        expect(entry()?.text).to.contain('user@example.com');
        expect(entry()?.tooltip).to.contain('Click to sign out');
        expect(entry()?.command).to.equal(ChatGptCommands.SIGN_OUT.id);
        authEmitter.fire({ isAuthenticated: false });
        expect(entry()?.command).to.equal(ChatGptCommands.SIGN_IN.id);
    });

    it('shows the initial authenticated account', async () => {
        initialState = Promise.resolve({ isAuthenticated: true, accountLabel: 'initial@example.com' });
        await start();
        expect(entry()?.text).to.contain('initial@example.com');
        expect(entry()?.command).to.equal(ChatGptCommands.SIGN_OUT.id);
    });

    it('removes the entry while disabled and restores it when enabled', async () => {
        await start();
        enabled = false;
        preferenceEmitter.fire({ preferenceName: CHATGPT_ENABLED_PREF } as PreferenceChange);
        expect(entries).to.have.property('size', 0);
        authEmitter.fire({ isAuthenticated: true, accountLabel: 'user@example.com' });
        expect(entries.size).to.equal(0);
        enabled = true;
        preferenceEmitter.fire({ preferenceName: CHATGPT_ENABLED_PREF } as PreferenceChange);
        expect(entry()?.command).to.equal(ChatGptCommands.SIGN_OUT.id);
    });

    it('removes the entry while AI is inactive and restores it when active', async () => {
        await start();
        active = false;
        activationEmitter.fire(active);
        expect(entries.size).to.equal(0);
        active = true;
        activationEmitter.fire(active);
        expect(entry()?.command).to.equal(ChatGptCommands.SIGN_IN.id);
    });

    it('does not show an entry on startup when disabled or AI is inactive', async () => {
        enabled = false;
        await start();
        expect(entries.size).to.equal(0);
        enabled = true;
        active = false;
        preferenceEmitter.fire({ preferenceName: CHATGPT_ENABLED_PREF } as PreferenceChange);
        expect(entries.size).to.equal(0);
    });

    it('ignores an initial lookup that finishes after an auth event', async () => {
        let resolveState: (state: ChatGptAuthState) => void = () => undefined;
        initialState = new Promise(resolve => resolveState = resolve);
        await start();
        authEmitter.fire({ isAuthenticated: false });
        resolveState({ isAuthenticated: true, accountLabel: 'old@example.com' });
        await Promise.resolve();
        expect(entry()?.command).to.equal(ChatGptCommands.SIGN_IN.id);
    });

    it('removes the entry and all listeners on disposal', async () => {
        await start();
        contribution.dispose();
        authEmitter.fire({ isAuthenticated: true });
        activationEmitter.fire(true);
        preferenceEmitter.fire({ preferenceName: CHATGPT_ENABLED_PREF } as PreferenceChange);
        expect(entries.size).to.equal(0);
    });

    it('does not recreate an entry when the initial lookup completes after disposal', async () => {
        let resolveState: (state: ChatGptAuthState) => void = () => undefined;
        initialState = new Promise(resolve => resolveState = resolve);
        await start();
        contribution.dispose();
        resolveState({ isAuthenticated: true });
        await Promise.resolve();
        expect(entries.size).to.equal(0);
    });
});
