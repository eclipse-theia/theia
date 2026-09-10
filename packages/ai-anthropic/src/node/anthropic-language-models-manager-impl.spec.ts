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
import { APIConnectionError } from '@anthropic-ai/sdk';
import type { ModelInfo } from '@anthropic-ai/sdk/resources/models';
import { DiscoveredModel, ReasoningApi } from '@theia/ai-core';
import { AnthropicLanguageModelsManagerImpl } from './anthropic-language-models-manager-impl';
import { AnthropicModelDescription } from '../common';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { TestModelDiscoveryFetcher } from '@theia/ai-core/lib/node/test/test-model-discovery-fetcher';

class TestableAnthropicManager extends AnthropicLanguageModelsManagerImpl {
    public retrieveCalls: string[] = [];
    public stubbedInfo: ModelInfo | Error | undefined;
    public stubbedModels: ModelInfo[] = [];
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

    protected override async listModels(_apiKey: string, _proxyUrl: string | undefined): Promise<ModelInfo[]> {
        this.listCalls++;
        if (this.listCalls <= this.failTimes) {
            throw this.failWith;
        }
        return this.stubbedModels;
    }

    public callDeriveReasoningApi(info: ModelInfo | undefined): ReasoningApi | undefined {
        return this.deriveReasoningApi(info);
    }

    public callDeriveSupportsXHighEffort(info: ModelInfo | undefined): boolean | undefined {
        return this.deriveSupportsXHighEffort(info);
    }

    public callDeriveServerSideCompactionSupport(desc: AnthropicModelDescription): boolean {
        return this.deriveServerSideCompactionSupport(desc);
    }

    public callFetchModelInfo(
        desc: AnthropicModelDescription,
        apiKey: string | undefined,
        proxyUrl: string | undefined
    ): Promise<ModelInfo | undefined> {
        return this.fetchModelInfo(desc, apiKey, proxyUrl);
    }

    protected override async retrieveModelInfo(
        modelDescription: AnthropicModelDescription,
        _apiKey: string,
        _proxyUrl: string | undefined
    ): Promise<ModelInfo> {
        this.retrieveCalls.push(`${modelDescription.url ?? ''}::${modelDescription.model}`);
        if (this.stubbedInfo instanceof Error) {
            throw this.stubbedInfo;
        }
        if (!this.stubbedInfo) {
            throw new Error('No stub configured');
        }
        return this.stubbedInfo;
    }
}

function description(model: string, url?: string): AnthropicModelDescription {
    return {
        id: `anthropic/${model}`,
        model,
        apiKey: true,
        enableStreaming: true,
        useCaching: true,
        maxRetries: 3,
        serverSideCompactionEnabledByDefault: false,
        url
    };
}

function modelInfo(overrides: Partial<ModelInfo> = {}): ModelInfo {
    return ({
        id: overrides.id ?? 'claude-test',
        type: 'model',
        ...overrides
    }) as unknown as ModelInfo;
}

describe('AnthropicLanguageModelsManagerImpl - metadata derivation', () => {
    let manager: TestableAnthropicManager;

    beforeEach(() => {
        manager = new TestableAnthropicManager();
        (manager as unknown as { logger: MockLogger }).logger = new MockLogger();
    });

    describe('deriveReasoningApi', () => {
        it('returns undefined when info is missing', () => {
            expect(manager.callDeriveReasoningApi(undefined)).to.equal(undefined);
        });

        it('returns undefined when capabilities are missing', () => {
            expect(manager.callDeriveReasoningApi(modelInfo())).to.equal(undefined);
        });

        it('returns undefined when thinking is not supported', () => {
            const info = modelInfo({
                capabilities: {
                    thinking: { supported: false, types: { adaptive: { supported: false }, enabled: { supported: false } } }
                }
            } as Partial<ModelInfo>);
            expect(manager.callDeriveReasoningApi(info)).to.equal(undefined);
        });

        it('returns "effort" when adaptive thinking is supported (newer Claude models)', () => {
            const info = modelInfo({
                capabilities: {
                    thinking: { supported: true, types: { adaptive: { supported: true }, enabled: { supported: true } } }
                }
            } as Partial<ModelInfo>);
            expect(manager.callDeriveReasoningApi(info)).to.equal('effort');
        });

        it('prefers "effort" over "budget" when both are reported supported', () => {
            const info = modelInfo({
                capabilities: {
                    thinking: { supported: true, types: { adaptive: { supported: true }, enabled: { supported: true } } }
                }
            } as Partial<ModelInfo>);
            expect(manager.callDeriveReasoningApi(info)).to.equal('effort');
        });

        it('returns "budget" when only enabled thinking is supported (legacy 4.x extended thinking)', () => {
            const info = modelInfo({
                capabilities: {
                    thinking: { supported: true, types: { adaptive: { supported: false }, enabled: { supported: true } } }
                }
            } as Partial<ModelInfo>);
            expect(manager.callDeriveReasoningApi(info)).to.equal('budget');
        });

        it('returns undefined when thinking is supported but neither type is', () => {
            const info = modelInfo({
                capabilities: {
                    thinking: { supported: true, types: { adaptive: { supported: false }, enabled: { supported: false } } }
                }
            } as Partial<ModelInfo>);
            expect(manager.callDeriveReasoningApi(info)).to.equal(undefined);
        });
    });

    describe('deriveSupportsXHighEffort', () => {
        it('returns undefined when info is missing', () => {
            expect(manager.callDeriveSupportsXHighEffort(undefined)).to.equal(undefined);
        });

        it('returns undefined when effort capability is absent', () => {
            expect(manager.callDeriveSupportsXHighEffort(modelInfo())).to.equal(undefined);
        });

        it('reflects the supported flag when effort.xhigh is reported', () => {
            const supported = modelInfo({
                capabilities: { effort: { xhigh: { supported: true } } }
            } as Partial<ModelInfo>);
            const unsupported = modelInfo({
                capabilities: { effort: { xhigh: { supported: false } } }
            } as Partial<ModelInfo>);
            expect(manager.callDeriveSupportsXHighEffort(supported)).to.equal(true);
            expect(manager.callDeriveSupportsXHighEffort(unsupported)).to.equal(false);
        });
    });

    describe('deriveServerSideCompactionSupport', () => {
        function capabilityFor(modelId: string): boolean {
            return manager.callDeriveServerSideCompactionSupport(description(modelId));
        }

        it('returns true for claude-opus-4-6', () => {
            expect(capabilityFor('claude-opus-4-6')).to.equal(true);
        });
        it('returns true for claude-sonnet-4-6', () => {
            expect(capabilityFor('claude-sonnet-4-6')).to.equal(true);
        });
        it('returns true for claude-opus-4-7 (newer minor version)', () => {
            expect(capabilityFor('claude-opus-4-7')).to.equal(true);
        });
        it('returns false for claude-haiku-4-5 (haiku variant)', () => {
            expect(capabilityFor('claude-haiku-4-5')).to.equal(false);
        });
        it('returns false for claude-opus-4-5 (older minor version)', () => {
            expect(capabilityFor('claude-opus-4-5')).to.equal(false);
        });
        it('returns false for claude-sonnet-4-5 (older minor version, sonnet variant)', () => {
            expect(capabilityFor('claude-sonnet-4-5')).to.equal(false);
        });
        it('returns true for claude-opus-5 (dateless major release, no minor segment)', () => {
            expect(capabilityFor('claude-opus-5')).to.equal(true);
        });
        it('returns true for claude-sonnet-5 (dateless major release, no minor segment)', () => {
            expect(capabilityFor('claude-sonnet-5')).to.equal(true);
        });
        it('returns true for claude-opus-5-0 (newer major version)', () => {
            expect(capabilityFor('claude-opus-5-0')).to.equal(true);
        });
        it('returns false for claude-3-opus-20240229 (old date-style id)', () => {
            expect(capabilityFor('claude-3-opus-20240229')).to.equal(false);
        });
        it('returns false for claude-sonnet-4-20250514 (4.0 with a date suffix, not minor 20250514)', () => {
            expect(capabilityFor('claude-sonnet-4-20250514')).to.equal(false);
        });
        it('returns true for claude-opus-4-6-20250101 (4.6 with a date suffix)', () => {
            expect(capabilityFor('claude-opus-4-6-20250101')).to.equal(true);
        });
        it('returns false for an unrecognized model id', () => {
            expect(capabilityFor('gpt-4o')).to.equal(false);
        });
    });
});

describe('AnthropicLanguageModelsManagerImpl - fetchAvailableModels', () => {
    let manager: TestableAnthropicManager;

    beforeEach(() => {
        manager = new TestableAnthropicManager();
        (manager as unknown as { logger: MockLogger }).logger = new MockLogger();
        manager.setApiKey('key');
    });

    it('returns an empty result and skips the network when no API key is set', async () => {
        const previous = process.env.ANTHROPIC_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
        try {
            manager.setApiKey(undefined);
            const result = await manager.fetchAvailableModels();
            expect(result).to.deep.equal({ models: [], fromCache: false });
            expect(manager.listCalls).to.equal(0);
        } finally {
            if (previous !== undefined) { process.env.ANTHROPIC_API_KEY = previous; }
        }
    });

    it('reports the models the endpoint listed, with their display names, and caches them', async () => {
        manager.stubbedModels = [
            modelInfo({ id: 'claude-opus-4-9', display_name: 'Claude Opus 4.9', created_at: '2026-03-01T00:00:00Z' }),
            modelInfo({ id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8' }),
            // A duplicate entry must not produce a duplicate model.
            modelInfo({ id: 'claude-opus-4-9', display_name: 'Claude Opus 4.9' })
        ];
        const result = await manager.fetchAvailableModels();
        expect(result.fromCache).to.equal(false);
        expect(result.models.map(model => model.id)).to.deep.equal(['claude-opus-4-9', 'claude-opus-4-8']);
        expect(result.models[0].label).to.equal('Claude Opus 4.9');
        expect(result.models[0].released).to.equal(Date.parse('2026-03-01T00:00:00Z'));
        expect(manager.listCalls).to.equal(1);
        expect(manager.snapshot).to.deep.equal(result.models);
    });

    it('adds the undated alias of each release-pinned model, keeping the releases themselves', async () => {
        manager.stubbedModels = [
            modelInfo({ id: 'claude-opus-5-20260401', display_name: 'Claude Opus 5' }),
            modelInfo({ id: 'claude-opus-5-20251120', display_name: 'Claude Opus 5' }),
            modelInfo({ id: 'claude-haiku-4-5-20251001', display_name: 'Claude Haiku 4.5' })
        ];
        const result = await manager.fetchAvailableModels();
        // The aliases are what the model pickers offer; the releases stay available to be pinned.
        expect(result.models.map(model => model.id)).to.deep.equal([
            'claude-opus-5',
            'claude-haiku-4-5',
            'claude-opus-5-20260401',
            'claude-opus-5-20251120',
            'claude-haiku-4-5-20251001'
        ]);
    });

    it('retries transient connection errors and then succeeds', async () => {
        manager.stubbedModels = [modelInfo({ id: 'claude-opus-4-8' })];
        manager.failTimes = 2;
        manager.failWith = new APIConnectionError({ message: 'network down' });
        const result = await manager.fetchAvailableModels();
        expect(result.models.map(model => model.id)).to.deep.equal(['claude-opus-4-8']);
        expect(result.fromCache).to.equal(false);
        expect(manager.listCalls).to.equal(3);
    });

    it('falls back to the cached snapshot when the fetch keeps failing', async () => {
        manager.snapshot = [{ id: 'claude-opus-4-8', label: 'Claude Opus 4.8' }];
        manager.failTimes = 99;
        manager.failWith = new APIConnectionError({ message: 'still down' });
        const result = await manager.fetchAvailableModels();
        expect(result.models).to.deep.equal([{ id: 'claude-opus-4-8', label: 'Claude Opus 4.8' }]);
        expect(result.fromCache).to.equal(true);
        expect(result.error).to.equal('still down');
        // 3 attempts against the retryable error.
        expect(manager.listCalls).to.equal(3);
    });

    it('throws when the fetch fails and there is no cached snapshot', async () => {
        manager.failTimes = 99;
        manager.failWith = new APIConnectionError({ message: 'no cache here' });
        let threw = false;
        try {
            await manager.fetchAvailableModels();
        } catch (error) {
            threw = true;
            expect((error as Error).message).to.equal('no cache here');
        }
        expect(threw).to.be.true;
    });

    it('does not retry non-connection errors (e.g. auth failures)', async () => {
        manager.failTimes = 99;
        manager.failWith = new Error('401 unauthorized');
        let threw = false;
        try {
            await manager.fetchAvailableModels();
        } catch {
            threw = true;
        }
        expect(threw).to.be.true;
        expect(manager.listCalls).to.equal(1);
    });
});

describe('AnthropicLanguageModelsManagerImpl - getApiKeySource', () => {
    let manager: TestableAnthropicManager;

    beforeEach(() => {
        manager = new TestableAnthropicManager();
    });

    it('reports "preference" when a key was set explicitly', async () => {
        manager.setApiKey('key');
        expect(await manager.getApiKeySource()).to.equal('preference');
    });

    it('reports "environment" when only the env var is present', async () => {
        const previous = process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'env-key';
        try {
            manager.setApiKey(undefined);
            expect(await manager.getApiKeySource()).to.equal('environment');
        } finally {
            if (previous !== undefined) { process.env.ANTHROPIC_API_KEY = previous; } else { delete process.env.ANTHROPIC_API_KEY; }
        }
    });

    it('reports "none" when neither is present', async () => {
        const previous = process.env.ANTHROPIC_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
        try {
            manager.setApiKey(undefined);
            expect(await manager.getApiKeySource()).to.equal('none');
        } finally {
            if (previous !== undefined) { process.env.ANTHROPIC_API_KEY = previous; }
        }
    });
});

describe('AnthropicLanguageModelsManagerImpl - fetchModelInfo cache', () => {
    let manager: TestableAnthropicManager;

    beforeEach(() => {
        manager = new TestableAnthropicManager();
        (manager as unknown as { logger: MockLogger }).logger = new MockLogger();
    });

    it('returns undefined and skips the network when no API key is provided', async () => {
        manager.stubbedInfo = modelInfo();
        const result = await manager.callFetchModelInfo(description('claude-x'), undefined, undefined);
        expect(result).to.equal(undefined);
        expect(manager.retrieveCalls).to.deep.equal([]);
    });

    it('fetches once per (baseURL, model) and reuses the cached result', async () => {
        manager.stubbedInfo = modelInfo({ id: 'claude-x' });
        const desc = description('claude-x');

        const first = await manager.callFetchModelInfo(desc, 'key', undefined);
        const second = await manager.callFetchModelInfo(desc, 'key', undefined);

        expect(first).to.equal(manager.stubbedInfo);
        expect(second).to.equal(manager.stubbedInfo);
        expect(manager.retrieveCalls).to.deep.equal(['::claude-x']);
    });

    it('keys the cache by both baseURL and model id', async () => {
        manager.stubbedInfo = modelInfo();
        const a = description('claude-x');
        const b = description('claude-y');
        const c = description('claude-x', 'https://proxy.example.com');

        await manager.callFetchModelInfo(a, 'key', undefined);
        await manager.callFetchModelInfo(b, 'key', undefined);
        await manager.callFetchModelInfo(c, 'key', undefined);

        expect(manager.retrieveCalls).to.deep.equal([
            '::claude-x',
            '::claude-y',
            'https://proxy.example.com::claude-x'
        ]);
    });

    it('does not cache failures (next call retries)', async () => {
        manager.stubbedInfo = new Error('boom');
        const desc = description('claude-x');

        const first = await manager.callFetchModelInfo(desc, 'key', undefined);
        expect(first).to.equal(undefined);

        manager.stubbedInfo = modelInfo({ id: 'claude-x' });
        const second = await manager.callFetchModelInfo(desc, 'key', undefined);

        expect(second).to.equal(manager.stubbedInfo);
        expect(manager.retrieveCalls).to.deep.equal(['::claude-x', '::claude-x']);
    });

    it('shares an in-flight fetch between concurrent callers', async () => {
        let resolve: (info: ModelInfo) => void = () => undefined;
        const pending = new Promise<ModelInfo>(r => { resolve = r; });
        (manager as unknown as { retrieveModelInfo: (...args: unknown[]) => Promise<ModelInfo> })
            .retrieveModelInfo = (modelDescription: AnthropicModelDescription) => {
                manager.retrieveCalls.push(`${modelDescription.url ?? ''}::${modelDescription.model}`);
                return pending;
            };
        const desc = description('claude-x');

        const p1 = manager.callFetchModelInfo(desc, 'key', undefined);
        const p2 = manager.callFetchModelInfo(desc, 'key', undefined);
        const expectedInfo = modelInfo({ id: 'claude-x' });
        resolve(expectedInfo);

        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1).to.equal(expectedInfo);
        expect(r2).to.equal(expectedInfo);
        expect(manager.retrieveCalls).to.deep.equal(['::claude-x']);
    });
});

describe('AnthropicLanguageModelsManagerImpl - environment API key consent', () => {

    it('leaves an environment key unused until it is allowed, wherever a key would be read', async () => {
        const previous = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
        delete process.env.ANTHROPIC_API_KEY;
        process.env.ANTHROPIC_API_KEY = 'from-the-environment';
        try {
            const manager = new TestableAnthropicManager();
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
            if (previous.ANTHROPIC_API_KEY !== undefined) { process.env.ANTHROPIC_API_KEY = previous.ANTHROPIC_API_KEY; } else { delete process.env.ANTHROPIC_API_KEY; }
        }
    });

    it('uses a key set in the preferences whatever the environment says', () => {
        const manager = new TestableAnthropicManager();
        manager.setApiKey('from-the-preference');
        expect(manager.apiKey).to.equal('from-the-preference');
    });
});
