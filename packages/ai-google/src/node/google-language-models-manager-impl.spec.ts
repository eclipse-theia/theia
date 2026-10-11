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
import type { Model } from '@google/genai';
import { DiscoveredModel, ReasoningApi } from '@theia/ai-core';
import { GoogleLanguageModelsManagerImpl, reasoningApiFromModelId } from './google-language-models-manager-impl';
import { GoogleModelDescription } from '../common';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { TestModelDiscoveryFetcher } from '@theia/ai-core/lib/node/test/test-model-discovery-fetcher';

class TestableGoogleManager extends GoogleLanguageModelsManagerImpl {
    public retrieveCalls: string[] = [];
    public stubbedInfo: Model | Error | undefined;

    public callDeriveReasoningApi(modelId: string, info: Model | undefined): ReasoningApi | undefined {
        return this.deriveReasoningApi(modelId, info);
    }

    public callFetchModelInfo(
        desc: GoogleModelDescription,
        apiKey: string | undefined
    ): Promise<Model | undefined> {
        return this.fetchModelInfo(desc, apiKey);
    }

    protected override async retrieveModelInfo(modelDescription: GoogleModelDescription, _apiKey: string): Promise<Model> {
        this.retrieveCalls.push(modelDescription.model);
        if (this.stubbedInfo instanceof Error) {
            throw this.stubbedInfo;
        }
        if (!this.stubbedInfo) {
            throw new Error('No stub configured');
        }
        return this.stubbedInfo;
    }

    public stubbedModels: Model[] = [];
    public listCalls = 0;
    /** Throw {@link failWith} for the first `failTimes` list calls, then return {@link stubbedModels}. */
    public failTimes = 0;
    public failWith: Error = new Error('boom');
    /** The real discovery fetcher, snapshotting in memory and retrying without waiting. */
    public readonly testFetcher = new TestModelDiscoveryFetcher();
    protected override readonly discoveryFetcher = this.testFetcher;

    /** In-memory stand-in for the on-disk snapshot. */
    public get snapshot(): DiscoveredModel[] | undefined {
        return this.testFetcher.snapshot;
    }

    public set snapshot(models: DiscoveredModel[] | undefined) {
        this.testFetcher.snapshot = models;
    }

    protected override async listModels(_apiKey: string): Promise<Model[]> {
        this.listCalls++;
        if (this.listCalls <= this.failTimes) {
            throw this.failWith;
        }
        return this.stubbedModels;
    }
}

function listedModel(name: string, supportedActions?: string[], displayName?: string, modelDescription?: string): Model {
    return ({ name, supportedActions, displayName, description: modelDescription }) as unknown as Model;
}

function description(model: string): GoogleModelDescription {
    return {
        id: `google/${model}`,
        model,
        apiKey: true,
        enableStreaming: true
    };
}

describe('reasoningApiFromModelId', () => {
    it('maps Gemini 3 family ids to "effort"', () => {
        expect(reasoningApiFromModelId('gemini-3-pro')).to.equal('effort');
        expect(reasoningApiFromModelId('gemini-3.0-pro')).to.equal('effort');
        expect(reasoningApiFromModelId('gemini-3-flash')).to.equal('effort');
    });

    it('maps Gemini 2.5 family ids to "budget"', () => {
        expect(reasoningApiFromModelId('gemini-2.5-pro')).to.equal('budget');
        expect(reasoningApiFromModelId('gemini-2.5-flash')).to.equal('budget');
        expect(reasoningApiFromModelId('gemini-2.5')).to.equal('budget');
    });

    it('returns undefined for non-reasoning families', () => {
        expect(reasoningApiFromModelId('gemini-1.5-pro')).to.equal(undefined);
        expect(reasoningApiFromModelId('gemini-2.0-flash')).to.equal(undefined);
        expect(reasoningApiFromModelId('gemini-pro')).to.equal(undefined);
        expect(reasoningApiFromModelId('text-bison')).to.equal(undefined);
    });

    it('does not match prefixes that only happen to start with gemini-2 or gemini-3', () => {
        expect(reasoningApiFromModelId('gemini-30-foo')).to.equal(undefined);
        expect(reasoningApiFromModelId('gemini-2.55')).to.equal(undefined);
    });
});

describe('GoogleLanguageModelsManagerImpl - deriveReasoningApi', () => {
    let manager: TestableGoogleManager;

    beforeEach(() => {
        manager = new TestableGoogleManager();
        (manager as unknown as { logger: MockLogger }).logger = new MockLogger();
    });

    it('falls back to the model-id heuristic when info is missing', () => {
        expect(manager.callDeriveReasoningApi('gemini-3-pro', undefined)).to.equal('effort');
        expect(manager.callDeriveReasoningApi('gemini-2.5-pro', undefined)).to.equal('budget');
        expect(manager.callDeriveReasoningApi('gemini-1.5-pro', undefined)).to.equal(undefined);
    });

    it('uses the model-id heuristic when the API does not report thinking', () => {
        const info = { thinking: undefined } as unknown as Model;
        expect(manager.callDeriveReasoningApi('gemini-3-pro', info)).to.equal('effort');
    });

    it('respects an explicit thinking=true from the API', () => {
        const info = { thinking: true } as unknown as Model;
        expect(manager.callDeriveReasoningApi('gemini-2.5-pro', info)).to.equal('budget');
    });

    it('disables reasoning when the API explicitly reports thinking=false (overrides the model-id heuristic)', () => {
        const info = { thinking: false } as unknown as Model;
        expect(manager.callDeriveReasoningApi('gemini-3-pro', info)).to.equal(undefined);
    });
});

describe('GoogleLanguageModelsManagerImpl - fetchModelInfo cache', () => {
    let manager: TestableGoogleManager;

    beforeEach(() => {
        manager = new TestableGoogleManager();
        (manager as unknown as { logger: MockLogger }).logger = new MockLogger();
    });

    it('returns undefined and skips the network when no API key is provided', async () => {
        manager.stubbedInfo = { thinking: true } as unknown as Model;
        const result = await manager.callFetchModelInfo(description('gemini-3-pro'), undefined);
        expect(result).to.equal(undefined);
        expect(manager.retrieveCalls).to.deep.equal([]);
    });

    it('fetches once per model and reuses the cached result', async () => {
        manager.stubbedInfo = { thinking: true } as unknown as Model;
        const desc = description('gemini-3-pro');

        const first = await manager.callFetchModelInfo(desc, 'key');
        const second = await manager.callFetchModelInfo(desc, 'key');

        expect(first).to.equal(manager.stubbedInfo);
        expect(second).to.equal(manager.stubbedInfo);
        expect(manager.retrieveCalls).to.deep.equal(['gemini-3-pro']);
    });

    it('keys the cache by model id', async () => {
        manager.stubbedInfo = { thinking: true } as unknown as Model;

        await manager.callFetchModelInfo(description('gemini-3-pro'), 'key');
        await manager.callFetchModelInfo(description('gemini-2.5-pro'), 'key');

        expect(manager.retrieveCalls).to.deep.equal(['gemini-3-pro', 'gemini-2.5-pro']);
    });

    it('does not cache failures (next call retries)', async () => {
        manager.stubbedInfo = new Error('boom');
        const desc = description('gemini-3-pro');

        const first = await manager.callFetchModelInfo(desc, 'key');
        expect(first).to.equal(undefined);

        manager.stubbedInfo = { thinking: true } as unknown as Model;
        const second = await manager.callFetchModelInfo(desc, 'key');

        expect(second).to.equal(manager.stubbedInfo);
        expect(manager.retrieveCalls).to.deep.equal(['gemini-3-pro', 'gemini-3-pro']);
    });

    it('shares an in-flight fetch between concurrent callers', async () => {
        let resolve: (info: Model) => void = () => undefined;
        const pending = new Promise<Model>(r => { resolve = r; });
        (manager as unknown as { retrieveModelInfo: (...args: unknown[]) => Promise<Model> })
            .retrieveModelInfo = (modelDescription: GoogleModelDescription) => {
                manager.retrieveCalls.push(modelDescription.model);
                return pending;
            };
        const desc = description('gemini-3-pro');

        const p1 = manager.callFetchModelInfo(desc, 'key');
        const p2 = manager.callFetchModelInfo(desc, 'key');
        const expectedInfo = { thinking: true } as unknown as Model;
        resolve(expectedInfo);

        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1).to.equal(expectedInfo);
        expect(r2).to.equal(expectedInfo);
        expect(manager.retrieveCalls).to.deep.equal(['gemini-3-pro']);
    });
});

describe('GoogleLanguageModelsManagerImpl - fetchAvailableModels', () => {
    let manager: TestableGoogleManager;

    beforeEach(() => {
        manager = new TestableGoogleManager();
        (manager as unknown as { logger: MockLogger }).logger = new MockLogger();
        manager.setApiKey('key');
    });

    it('returns an empty result and skips the network when no API key is set', async () => {
        const previous = { google: process.env.GOOGLE_API_KEY, gemini: process.env.GEMINI_API_KEY };
        delete process.env.GOOGLE_API_KEY;
        delete process.env.GEMINI_API_KEY;
        try {
            manager.setApiKey(undefined);
            expect(await manager.fetchAvailableModels()).to.deep.equal({ models: [], fromCache: false });
            expect(manager.listCalls).to.equal(0);
        } finally {
            if (previous.google !== undefined) { process.env.GOOGLE_API_KEY = previous.google; }
            if (previous.gemini !== undefined) { process.env.GEMINI_API_KEY = previous.gemini; }
        }
    });

    it('strips the "models/" prefix, drops models that cannot generate content, and caches the result', async () => {
        manager.stubbedModels = [
            listedModel('models/gemini-3-pro', ['generateContent', 'countTokens'], 'Gemini 3 Pro', 'The best one.'),
            listedModel('models/text-embedding-004', ['embedContent']),
            // Older SDKs omit the field; such models are kept rather than silently dropped.
            listedModel('models/gemini-3-flash'),
            listedModel('models/gemini-3-pro', ['generateContent'])
        ];
        const result = await manager.fetchAvailableModels();
        expect(result.fromCache).to.equal(false);
        expect(result.models.map(model => model.id)).to.deep.equal(['gemini-3-pro', 'gemini-3-flash']);
        expect(result.models[0].label).to.equal('Gemini 3 Pro');
        expect(result.models[0].description).to.equal('The best one.');
        expect(manager.snapshot).to.deep.equal(result.models);
    });

    it('keeps the Gemini chat models and drops what the endpoint otherwise carries', async () => {
        manager.stubbedModels = [
            listedModel('models/gemini-flash-latest'),
            listedModel('models/gemini-3.8-flash'),
            listedModel('models/gemini-3.1-pro-preview'),
            // Chat-capable, but not a model of this family: its parameter count would read as a version.
            listedModel('models/gemma-3-27b-it'),
            listedModel('models/learnlm-2.0-experimental'),
            // Gemini, and reported as generating content, but not chat: they answer through an API of
            // their own, or they generate something other than text.
            listedModel('models/gemini-3.5-pro-deep-research'),
            listedModel('models/gemini-2.5-flash-preview-tts'),
            listedModel('models/gemini-2.5-flash-image'),
            listedModel('models/gemini-2.5-computer-use-preview'),
            // The Live API and embedding models need no id term: they report what they can do.
            listedModel('models/gemini-2.5-flash-live', ['bidiGenerateContent']),
            listedModel('models/gemini-embedding-001', ['embedContent']),
            listedModel('models/imagen-4.0-generate-001')
        ];
        const result = await manager.fetchAvailableModels();
        expect(result.models.map(model => model.id)).to.deep.equal([
            'gemini-flash-latest',
            'gemini-3.8-flash',
            'gemini-3.1-pro-preview'
        ]);
    });

    it('retries transient network errors and then succeeds', async () => {
        manager.stubbedModels = [listedModel('models/gemini-3-pro')];
        manager.failTimes = 2;
        manager.failWith = new Error('fetch failed');
        const result = await manager.fetchAvailableModels();
        expect(result.models.map(model => model.id)).to.deep.equal(['gemini-3-pro']);
        expect(manager.listCalls).to.equal(3);
    });

    it('falls back to the cached snapshot when the fetch keeps failing', async () => {
        manager.snapshot = [{ id: 'gemini-3-pro' }];
        manager.failTimes = 99;
        manager.failWith = new Error('ETIMEDOUT');
        const result = await manager.fetchAvailableModels();
        expect(result).to.deep.equal({ models: [{ id: 'gemini-3-pro' }], fromCache: true, error: 'ETIMEDOUT' });
        expect(manager.listCalls).to.equal(3);
    });

    it('does not retry auth errors and throws without a snapshot', async () => {
        manager.failTimes = 99;
        manager.failWith = new Error('403 permission denied');
        let threw = false;
        try {
            await manager.fetchAvailableModels();
        } catch (error) {
            threw = true;
            expect((error as Error).message).to.equal('403 permission denied');
        }
        expect(threw).to.be.true;
        expect(manager.listCalls).to.equal(1);
    });
});

describe('GoogleLanguageModelsManagerImpl - environment API key consent', () => {

    it('leaves an environment key unused until it is allowed, wherever a key would be read', async () => {
        const previous = { GOOGLE_API_KEY: process.env.GOOGLE_API_KEY, GEMINI_API_KEY: process.env.GEMINI_API_KEY };
        delete process.env.GOOGLE_API_KEY;
        delete process.env.GEMINI_API_KEY;
        process.env.GOOGLE_API_KEY = 'from-the-environment';
        try {
            const manager = new TestableGoogleManager();
            // The gate sits on the key, so a custom endpoint or a configured model cannot reach past it either.
            expect(manager.apiKey).to.equal(undefined);
            // Discovery still needs to know the key is there, in order to ask for it.
            expect(await manager.getApiKeySource()).to.equal('environment');

            manager.setAllowEnvironmentApiKey(true);
            expect(manager.apiKey).to.equal('from-the-environment');

            // Withdrawing the consent stops it being used at once.
            manager.setAllowEnvironmentApiKey(false);
            expect(manager.apiKey).to.equal(undefined);
        } finally {
            if (previous.GOOGLE_API_KEY !== undefined) { process.env.GOOGLE_API_KEY = previous.GOOGLE_API_KEY; } else { delete process.env.GOOGLE_API_KEY; }
            if (previous.GEMINI_API_KEY !== undefined) { process.env.GEMINI_API_KEY = previous.GEMINI_API_KEY; } else { delete process.env.GEMINI_API_KEY; }
        }
    });

    it('uses a key set in the preferences whatever the environment says', () => {
        const manager = new TestableGoogleManager();
        manager.setApiKey('from-the-preference');
        expect(manager.apiKey).to.equal('from-the-preference');
    });
});
