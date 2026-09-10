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
import { OpenAiModelDescription } from '../common';
import { OpenAiLanguageModelsManagerImpl } from './openai-language-models-manager-impl';
import { OPENAI_SERVER_TOOLS, OPENAI_WEB_SEARCH } from './openai-server-tools';
import { APIConnectionError } from 'openai';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { DiscoveredModel } from '@theia/ai-core';
import { TestModelDiscoveryFetcher } from '@theia/ai-core/lib/node/test/test-model-discovery-fetcher';

class TestableOpenAiLanguageModelsManagerImpl extends OpenAiLanguageModelsManagerImpl {
    resolveServerToolsForTest(description: OpenAiModelDescription): typeof OPENAI_SERVER_TOOLS | undefined {
        return this.resolveServerTools(description);
    }

    public stubbedModels: Array<{ id: string; created?: number }> = [];
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

    protected override async listModels(_apiKey: string, _proxyUrl: string | undefined): Promise<Array<{ id: string; created?: number }>> {
        this.listCalls++;
        if (this.listCalls <= this.failTimes) {
            throw this.failWith;
        }
        return this.stubbedModels;
    }
}

function modelDescription(overrides: Partial<OpenAiModelDescription> = {}): OpenAiModelDescription {
    return {
        id: 'openai/gpt-5',
        model: 'gpt-5',
        apiKey: true,
        apiVersion: undefined,
        maxRetries: 3,
        ...overrides
    };
}

describe('OpenAiLanguageModelsManagerImpl server tools', () => {
    const manager = new TestableOpenAiLanguageModelsManagerImpl();

    it('offers native web search for Response API models using the OpenAI endpoint', () => {
        const serverTools = manager.resolveServerToolsForTest(modelDescription({ useResponseApi: true }));
        expect(serverTools?.some(tool => tool.id === OPENAI_WEB_SEARCH)).to.equal(true);
    });

    it('does not offer native web search for custom endpoints', () => {
        expect(manager.resolveServerToolsForTest(modelDescription({
            useResponseApi: true,
            url: 'https://example.com/v1'
        }))).to.equal(undefined);
    });

    it('does not offer native web search without the Response API', () => {
        expect(manager.resolveServerToolsForTest(modelDescription())).to.equal(undefined);
    });
});

describe('OpenAiLanguageModelsManagerImpl - fetchAvailableModels', () => {
    let manager: TestableOpenAiLanguageModelsManagerImpl;

    beforeEach(() => {
        manager = new TestableOpenAiLanguageModelsManagerImpl();
        (manager as unknown as { logger: MockLogger }).logger = new MockLogger();
        manager.setApiKey('key');
    });

    it('returns an empty result and skips the network when no API key is set', async () => {
        const previous = process.env.OPENAI_API_KEY;
        delete process.env.OPENAI_API_KEY;
        try {
            manager.setApiKey(undefined);
            expect(await manager.fetchAvailableModels()).to.deep.equal({ models: [], fromCache: false });
            expect(manager.listCalls).to.equal(0);
        } finally {
            if (previous !== undefined) { process.env.OPENAI_API_KEY = previous; }
        }
    });

    it('keeps the text-chat families and drops the other model types the endpoint lists', async () => {
        manager.stubbedModels = [
            { id: 'gpt-5.5' },
            { id: 'chatgpt-5-latest' },
            { id: 'o3-mini' },
            { id: 'gpt-4o-audio-preview' },
            { id: 'gpt-image-1' },
            { id: 'text-embedding-3-large' },
            { id: 'omni-moderation-latest' },
            { id: 'whisper-1' },
            { id: 'computer-use-preview' },
            { id: 'gpt-4o-search-preview' },
            // Caught by the same `search` term, and rightly so: it speaks the responses API, not this one.
            { id: 'o3-deep-research' },
            { id: 'gpt-3.5-turbo-instruct' },
            { id: 'gpt-5.5' }
        ];
        const result = await manager.fetchAvailableModels();
        expect(result.fromCache).to.equal(false);
        expect(result.models.map(model => model.id)).to.deep.equal(['gpt-5.5', 'chatgpt-5-latest', 'o3-mini']);
        expect(manager.snapshot).to.deep.equal(result.models);
    });

    it('recognises the legacy year-less snapshots as releases of one model', async () => {
        manager.stubbedModels = [
            { id: 'gpt-4-0613', created: 1_686_000_000 },
            { id: 'gpt-4-0125', created: 1_706_000_000 },
            { id: 'gpt-4-32k-0613', created: 1_686_000_000 }
        ];
        const result = await manager.fetchAvailableModels();
        // Two aliases for the two models, then the snapshots they were derived from.
        expect(result.models.map(model => model.id)).to.deep.equal([
            'gpt-4',
            'gpt-4-32k',
            'gpt-4-0613',
            'gpt-4-0125',
            'gpt-4-32k-0613'
        ]);
    });

    it('adds the undated alias of each release-pinned model, keeping the releases themselves', async () => {
        manager.stubbedModels = [
            { id: 'gpt-5.6-sol-2026-04-01' },
            { id: 'gpt-5.6-sol-2025-11-20' },
            { id: 'gpt-5.6-luna' }
        ];
        const result = await manager.fetchAvailableModels();
        expect(result.models.map(model => model.id)).to.deep.equal([
            'gpt-5.6-sol',
            'gpt-5.6-sol-2026-04-01',
            'gpt-5.6-sol-2025-11-20',
            'gpt-5.6-luna'
        ]);
    });

    it('reports the creation timestamp in milliseconds', async () => {
        manager.stubbedModels = [{ id: 'gpt-5.5', created: 1_700_000_000 }];
        const result = await manager.fetchAvailableModels();
        expect(result.models[0].released).to.equal(1_700_000_000_000);
    });

    it('retries transient connection errors and then succeeds', async () => {
        manager.stubbedModels = [{ id: 'gpt-5.5' }];
        manager.failTimes = 2;
        manager.failWith = new APIConnectionError({ message: 'network down' });
        const result = await manager.fetchAvailableModels();
        expect(result.models.map(model => model.id)).to.deep.equal(['gpt-5.5']);
        expect(manager.listCalls).to.equal(3);
    });

    it('falls back to the cached snapshot when the fetch keeps failing', async () => {
        manager.snapshot = [{ id: 'gpt-5.5' }];
        manager.failTimes = 99;
        manager.failWith = new APIConnectionError({ message: 'still down' });
        const result = await manager.fetchAvailableModels();
        expect(result).to.deep.equal({ models: [{ id: 'gpt-5.5' }], fromCache: true, error: 'still down' });
        expect(manager.listCalls).to.equal(3);
    });

    it('does not retry auth errors and throws without a snapshot', async () => {
        manager.failTimes = 99;
        manager.failWith = new Error('401 unauthorized');
        let threw = false;
        try {
            await manager.fetchAvailableModels();
        } catch (error) {
            threw = true;
            expect((error as Error).message).to.equal('401 unauthorized');
        }
        expect(threw).to.be.true;
        expect(manager.listCalls).to.equal(1);
    });
});

describe('OpenAiLanguageModelsManagerImpl - environment API key consent', () => {

    it('leaves an environment key unused until it is allowed, wherever a key would be read', async () => {
        const previous = { OPENAI_API_KEY: process.env.OPENAI_API_KEY };
        delete process.env.OPENAI_API_KEY;
        process.env.OPENAI_API_KEY = 'from-the-environment';
        try {
            const manager = new TestableOpenAiLanguageModelsManagerImpl();
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
            if (previous.OPENAI_API_KEY !== undefined) { process.env.OPENAI_API_KEY = previous.OPENAI_API_KEY; } else { delete process.env.OPENAI_API_KEY; }
        }
    });

    it('uses a key set in the preferences whatever the environment says', () => {
        const manager = new TestableOpenAiLanguageModelsManagerImpl();
        manager.setApiKey('from-the-preference');
        expect(manager.apiKey).to.equal('from-the-preference');
    });
});
