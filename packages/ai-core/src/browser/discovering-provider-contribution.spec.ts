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
import { ApiKeySource, DiscoveredModel, ModelDiscoveryResult } from '../common/model-discovery-status';
import { DiscoveringLanguageModelsManager, DiscoveringProviderContribution, ModelDiscoveryMessages } from './discovering-provider-contribution';
import { ModelDiscoveryStatusService } from './model-discovery-status-service';

interface TestModelDescription {
    id: string;
    model: string;
}

const OVERRIDES_PREF = 'test.modelOverrides';
const ALLOW_ENV_PREF = 'test.allowEnvironmentApiKey';

class TestManager implements DiscoveringLanguageModelsManager<TestModelDescription> {

    result: ModelDiscoveryResult = { models: [], fromCache: false };
    /** Consumed one entry per fetch, so a test can give consecutive runs different answers. */
    readonly resultQueue: ModelDiscoveryResult[] = [];
    failWith: Error | undefined;
    apiKeySource: ApiKeySource = 'preference';
    fetchCalls = 0;
    allowEnvironmentApiKey: boolean | undefined;
    /** Every registration and removal in the order they happened, e.g. `remove:test/a`. */
    readonly calls: string[] = [];

    async fetchAvailableModels(): Promise<ModelDiscoveryResult> {
        this.fetchCalls++;
        if (this.failWith) {
            throw this.failWith;
        }
        return this.resultQueue.shift() ?? this.result;
    }

    async getApiKeySource(): Promise<ApiKeySource> {
        return this.apiKeySource;
    }

    setAllowEnvironmentApiKey(allowed: boolean): void {
        this.allowEnvironmentApiKey = allowed;
    }

    async createOrUpdateLanguageModels(...modelDescriptions: TestModelDescription[]): Promise<void> {
        this.calls.push(`register:${modelDescriptions.map(description => description.id).join(',')}`);
    }

    removeLanguageModels(...modelIds: string[]): void {
        this.calls.push(`remove:${modelIds.join(',')}`);
    }
}

class TestContribution extends DiscoveringProviderContribution<TestModelDescription> {

    protected readonly providerId = 'test';
    protected readonly providerLabel = 'Test Provider';
    protected readonly modelOverridesPreference = OVERRIDES_PREF;
    protected readonly allowEnvironmentApiKeyPreference = ALLOW_ENV_PREF;
    protected readonly manager: TestManager;

    initialized = 0;

    constructor(manager: TestManager) {
        super();
        this.manager = manager;
    }

    protected get discoveryMessages(): ModelDiscoveryMessages {
        return {
            noCredentials: 'no key',
            consentRequired: 'confirm the key',
            consentPrompt: 'may I use the key?',
            useEnvironmentKey: 'Use key',
            overridden: 'configured by hand',
            cached: error => `cached: ${error}`
        };
    }

    protected createModelDescription(model: DiscoveredModel): TestModelDescription {
        return { id: this.qualifiedModelId(model.id), model: model.id };
    }

    protected override initializeProvider(): void {
        this.initialized++;
    }

    /** The queued entry point, which is protected on the contribution itself. */
    discover(): Promise<void> {
        return this.discoverAndRegisterModels();
    }
}

class PrefixedContribution extends TestContribution {
    protected override get modelIdPrefix(): string {
        return 'prefixed';
    }
}

function createContribution(
    preferences: Record<string, unknown> = {},
    factory: (testManager: TestManager) => TestContribution = testManager => new TestContribution(testManager)
): {
    contribution: TestContribution;
    manager: TestManager;
    status: ModelDiscoveryStatusService;
    written: Record<string, unknown>;
    prompts: string[];
    answer: (choice: string | undefined) => void;
} {
    const manager = new TestManager();
    const contribution = factory(manager);
    const status = new ModelDiscoveryStatusService();
    const written: Record<string, unknown> = {};
    const prompts: string[] = [];
    let choice: string | undefined;
    const preferenceService = {
        ready: Promise.resolve(),
        get: (name: string, defaultValue: unknown) => (name in preferences ? preferences[name] : defaultValue),
        set: async (name: string, value: unknown) => { written[name] = value; },
        onPreferenceChanged: () => ({ dispose: () => { } })
    };
    const messageService = {
        info: async (text: string) => {
            prompts.push(text);
            return choice;
        }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internals = contribution as any;
    internals.preferenceService = preferenceService;
    internals.discoveryStatus = status;
    internals.messageService = messageService;
    return { contribution, manager, status, written, prompts, answer: next => { choice = next; } };
}

function discovered(id: string): DiscoveredModel {
    return { id };
}

describe('DiscoveringProviderContribution', () => {

    it('registers what the provider offers and reports it as ready', async () => {
        const { contribution, manager, status } = createContribution();
        manager.result = { models: [discovered('a'), discovered('b')], fromCache: false };

        await contribution.discover();

        expect(manager.calls).to.deep.equal(['remove:', 'register:test/a,test/b']);
        const reported = status.getStatus('test');
        expect(reported?.state).to.equal('ready');
        expect(reported?.discovered?.map(entry => entry.id)).to.deep.equal(['a', 'b']);
        expect(reported?.lastFetch).to.be.a('number');
    });

    it('unregisters the models a later discovery no longer offers', async () => {
        const { contribution, manager } = createContribution();
        manager.result = { models: [discovered('a'), discovered('b')], fromCache: false };
        await contribution.discover();
        manager.calls.length = 0;

        manager.result = { models: [discovered('b')], fromCache: false };
        await contribution.discover();

        expect(manager.calls).to.deep.equal(['remove:test/a', 'register:test/b']);
    });

    it('qualifies the model ids with the prefix the provider registers under', async () => {
        const { contribution, manager } = createContribution({}, testManager => new PrefixedContribution(testManager));
        manager.result = { models: [discovered('a')], fromCache: false };
        await contribution.discover();
        manager.calls.length = 0;

        manager.result = { models: [], fromCache: false };
        await contribution.discover();

        expect(manager.calls).to.deep.equal(['remove:prefixed/a', 'register:']);
    });

    it('replaces discovery with a configured list without asking the provider', async () => {
        const { contribution, manager, status } = createContribution({ [OVERRIDES_PREF]: ['pinned-1', 'pinned-2'] });

        await contribution.discover();

        expect(manager.fetchCalls).to.equal(0);
        expect(manager.calls).to.deep.equal(['remove:', 'register:test/pinned-1,test/pinned-2']);
        expect(status.getStatus('test')?.state).to.equal('overridden');
    });

    it('drops the registered models and asks for a credential when there is none', async () => {
        const { contribution, manager, status } = createContribution();
        manager.result = { models: [discovered('a')], fromCache: false };
        await contribution.discover();
        manager.calls.length = 0;

        manager.apiKeySource = 'none';
        await contribution.discover();

        expect(manager.calls).to.deep.equal(['remove:test/a']);
        expect(manager.fetchCalls).to.equal(1);
        expect(status.getStatus('test')?.state).to.equal('no-credentials');
        expect(status.getStatus('test')?.message).to.equal('no key');
    });

    it('withholds an environment key until it is confirmed, asking once', async () => {
        const { contribution, manager, status, prompts } = createContribution();
        manager.apiKeySource = 'environment';

        await contribution.discover();
        await contribution.discover();

        expect(manager.fetchCalls).to.equal(0);
        expect(status.getStatus('test')?.state).to.equal('awaiting-consent');
        // Asked once per session, however often the state is reached again.
        expect(prompts).to.deep.equal(['may I use the key?']);
    });

    it('persists the consent when the user grants it', async () => {
        const { contribution, manager, written, answer } = createContribution();
        manager.apiKeySource = 'environment';
        answer('Use key');

        await contribution.discover();
        // The prompt is answered asynchronously, after the run itself has returned.
        await Promise.resolve();

        expect(written[ALLOW_ENV_PREF]).to.equal(true);
    });

    it('uses an environment key once the consent is on record', async () => {
        const { contribution, manager, status } = createContribution({ [ALLOW_ENV_PREF]: true });
        manager.apiKeySource = 'environment';
        manager.result = { models: [discovered('a')], fromCache: false };

        await contribution.discover();

        expect(manager.fetchCalls).to.equal(1);
        expect(status.getStatus('test')?.state).to.equal('ready');
    });

    it('keeps cached models usable and says that they may be stale', async () => {
        const { contribution, status } = createContribution();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (contribution as any).manager.result = { models: [discovered('a')], fromCache: true, error: 'network down' };

        await contribution.discover();

        const reported = status.getStatus('test');
        expect(reported?.state).to.equal('ready');
        expect(reported?.fromCache).to.equal(true);
        expect(reported?.message).to.equal('cached: network down');
        // Nothing was fetched, so there is no successful fetch to date.
        expect(reported?.lastFetch).to.equal(undefined);
    });

    it('reports a failed run instead of rejecting, since nobody awaits it', async () => {
        const { contribution, manager, status } = createContribution();
        manager.failWith = new Error('the endpoint is gone');

        // Rejecting here would surface as an unhandled rejection from the unawaited startup call.
        await contribution.discover();

        expect(status.getStatus('test')?.state).to.equal('error');
        expect(status.getStatus('test')?.message).to.equal('the endpoint is gone');
    });

    it('queues overlapping runs so they cannot compute what to unregister from the same list', async () => {
        const { contribution, manager } = createContribution();
        // The runs start before either has fetched, so what they see has to come from the queue.
        manager.resultQueue.push({ models: [discovered('a')], fromCache: false }, { models: [discovered('b')], fromCache: false });

        await Promise.all([contribution.discover(), contribution.discover()]);

        // The second run sees what the first registered, rather than the empty list both started from.
        expect(manager.calls).to.deep.equal(['remove:', 'register:test/a', 'remove:test/a', 'register:test/b']);
    });

    it('registers the provider, hands over the consent and discovers on startup', async () => {
        const { contribution, manager, status } = createContribution();
        manager.result = { models: [discovered('a')], fromCache: false };

        contribution.onStart();
        await contribution.discover();

        expect(status.getStatus('test')?.label).to.equal('Test Provider');
        expect(manager.allowEnvironmentApiKey).to.equal(false);
        expect(contribution.initialized).to.equal(1);
        expect(manager.fetchCalls).to.be.greaterThan(0);
    });
});
