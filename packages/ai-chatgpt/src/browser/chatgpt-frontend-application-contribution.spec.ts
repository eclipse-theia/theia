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
import { Emitter, Event, PreferenceChange, PreferenceService } from '@theia/core';
import { Container } from '@theia/core/shared/inversify';
import { AICorePreferences, PREFERENCE_NAME_MAX_RETRIES } from '@theia/ai-core/lib/common/ai-core-preferences';
import { ChatGptAuthService, ChatGptAuthState, ChatGptLanguageModelsManager, ChatGptModelDescription, MODELS_PREF } from '../common';
import { ChatGptFrontendApplicationContribution } from './chatgpt-frontend-application-contribution';

disableJSDOM();

class FakeManager implements ChatGptLanguageModelsManager {
    readonly created: ChatGptModelDescription[][] = [];
    readonly removed: string[][] = [];
    proxyUrl: string | undefined;
    available: string[] = [];
    availableCalls = 0;

    setProxyUrl(proxyUrl: string | undefined): void {
        this.proxyUrl = proxyUrl;
    }
    async getAvailableModels(): Promise<string[]> {
        this.availableCalls++;
        return this.available;
    }
    async createOrUpdateLanguageModels(...models: ChatGptModelDescription[]): Promise<void> {
        this.created.push(models);
    }
    removeLanguageModels(...modelIds: string[]): void {
        this.removed.push(modelIds);
    }
}

/** Only the parts of the preference service the contribution uses. */
class FakePreferenceService {
    readonly values = new Map<string, unknown>();
    readonly ready = Promise.resolve();

    protected readonly emitter = new Emitter<PreferenceChange>();
    readonly onPreferenceChanged: Event<PreferenceChange> = this.emitter.event;

    get<T>(preferenceName: string, defaultValue: T): T {
        return (this.values.get(preferenceName) as T) ?? defaultValue;
    }
    set(preferenceName: string, value: unknown): void {
        this.values.set(preferenceName, value);
        this.emitter.fire({ preferenceName } as PreferenceChange);
    }
}

function registeredIds(descriptions: ChatGptModelDescription[]): string[] {
    return descriptions.map(description => description.id);
}

/** Lets the refresh triggered by the preceding change run to completion. */
async function flush(): Promise<void> {
    await new Promise(resolve => setImmediate(resolve));
}

describe('ChatGptFrontendApplicationContribution', () => {

    let contribution: ChatGptFrontendApplicationContribution;
    let manager: FakeManager;
    let preferences: FakePreferenceService;
    let aiCorePreferenceEmitter: Emitter<PreferenceChange>;
    let authStateEmitter: Emitter<ChatGptAuthState>;
    let maxRetries: number;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    /** Runs `onStart` and the microtasks it defers to `preferenceService.ready`. */
    async function start(): Promise<void> {
        contribution.onStart();
        await preferences.ready;
        await new Promise(resolve => setImmediate(resolve));
    }

    beforeEach(() => {
        manager = new FakeManager();
        preferences = new FakePreferenceService();
        aiCorePreferenceEmitter = new Emitter<PreferenceChange>();
        authStateEmitter = new Emitter<ChatGptAuthState>();
        maxRetries = 3;

        const container = new Container();
        container.bind(PreferenceService).toConstantValue(preferences as unknown as PreferenceService);
        container.bind(ChatGptLanguageModelsManager).toConstantValue(manager);
        container.bind(AICorePreferences).toConstantValue({
            get: (name: string) => (name === PREFERENCE_NAME_MAX_RETRIES ? maxRetries : undefined),
            onPreferenceChanged: aiCorePreferenceEmitter.event
        } as unknown as AICorePreferences);
        container.bind(ChatGptAuthService).toConstantValue({
            onAuthStateChanged: authStateEmitter.event
        } as unknown as ChatGptAuthService);
        container.bind(ChatGptFrontendApplicationContribution).toSelf().inSingletonScope();
        contribution = container.get(ChatGptFrontendApplicationContribution);
    });

    it('registers the configured models on startup, regardless of the sign in state', async () => {
        preferences.values.set(MODELS_PREF, ['gpt-5.5', 'gpt-5.5-pro']);

        await start();

        expect(manager.created).to.have.lengthOf(1);
        expect(registeredIds(manager.created[0])).to.deep.equal(['chatgpt/gpt-5.5', 'chatgpt/gpt-5.5-pro']);
        expect(manager.created[0][0].maxRetries).to.equal(3);
    });

    it('offers the models the ChatGPT plan grants while none are configured', async () => {
        manager.available = ['gpt-5.6-sol', 'gpt-5.5'];

        await start();

        expect(registeredIds(manager.created[0])).to.deep.equal(['chatgpt/gpt-5.6-sol', 'chatgpt/gpt-5.5']);
    });

    it('prefers the configured models over the ones the plan grants', async () => {
        preferences.values.set(MODELS_PREF, ['gpt-5.5']);
        manager.available = ['gpt-5.6-sol'];

        await start();

        expect(registeredIds(manager.created[0])).to.deep.equal(['chatgpt/gpt-5.5']);
        expect(manager.availableCalls).to.equal(0);
    });

    it('registers the added models and removes the ones that were dropped', async () => {
        preferences.values.set(MODELS_PREF, ['gpt-5.5']);
        await start();

        preferences.set(MODELS_PREF, ['gpt-5.5', 'gpt-5.6-sol']);
        await flush();

        expect(registeredIds(manager.created[1])).to.deep.equal(['chatgpt/gpt-5.5', 'chatgpt/gpt-5.6-sol']);
        expect(manager.removed).to.be.empty;

        preferences.set(MODELS_PREF, ['gpt-5.6-sol']);
        await flush();

        expect(manager.removed).to.deep.equal([['chatgpt/gpt-5.5']]);
        expect(registeredIds(manager.created[2])).to.deep.equal(['chatgpt/gpt-5.6-sol']);
    });

    it('refreshes the models when the user signs in or out, so their status follows', async () => {
        preferences.values.set(MODELS_PREF, ['gpt-5.5']);
        await start();

        authStateEmitter.fire({ isAuthenticated: true, accountLabel: 'user@example.com' });
        await flush();

        expect(registeredIds(manager.created[1])).to.deep.equal(['chatgpt/gpt-5.5']);
    });

    it('picks up the models the plan grants once the user is signed in', async () => {
        await start();
        expect(registeredIds(manager.created[0])).to.be.empty;

        manager.available = ['gpt-5.6-sol'];
        authStateEmitter.fire({ isAuthenticated: true });
        await flush();

        expect(registeredIds(manager.created[1])).to.deep.equal(['chatgpt/gpt-5.6-sol']);
    });

    it('applies overlapping refreshes one after the other', async () => {
        const listings: ((models: string[]) => void)[] = [];
        manager.getAvailableModels = () => new Promise<string[]>(resolve => listings.push(resolve));
        await start();

        authStateEmitter.fire({ isAuthenticated: true });
        await flush();
        expect(listings).to.have.lengthOf(1);

        listings[0](['gpt-5.5']);
        await flush();
        expect(listings).to.have.lengthOf(2);

        listings[1](['gpt-5.6-sol']);
        await flush();

        expect(registeredIds(manager.created[0])).to.deep.equal(['chatgpt/gpt-5.5']);
        expect(registeredIds(manager.created[1])).to.deep.equal(['chatgpt/gpt-5.6-sol']);
        expect(manager.removed).to.deep.equal([['chatgpt/gpt-5.5']]);
    });

    it('applies a changed retry count to the registered models', async () => {
        preferences.values.set(MODELS_PREF, ['gpt-5.5']);
        await start();

        maxRetries = 7;
        aiCorePreferenceEmitter.fire({ preferenceName: PREFERENCE_NAME_MAX_RETRIES } as PreferenceChange);
        await flush();

        expect(manager.created[1][0].maxRetries).to.equal(7);
    });

    it('forwards the proxy configuration and re-registers the models when it changes', async () => {
        preferences.values.set(MODELS_PREF, ['gpt-5.5']);
        preferences.values.set('http.proxy', 'http://proxy.example.com:3128');
        await start();

        expect(manager.proxyUrl).to.equal('http://proxy.example.com:3128');

        preferences.set('http.proxy', 'http://other.example.com:3128');
        await flush();

        expect(manager.proxyUrl).to.equal('http://other.example.com:3128');
        expect(registeredIds(manager.created[1])).to.deep.equal(['chatgpt/gpt-5.5']);
    });
});
