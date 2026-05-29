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
import type { ModelInfo } from '@anthropic-ai/sdk/resources/models';
import { LanguageModel, ReasoningApi, ReasoningSupport } from '@theia/ai-core';
import { AnthropicLanguageModelsManagerImpl } from './anthropic-language-models-manager-impl';
import { AnthropicModelDescription } from '../common';
import { AnthropicModel } from './anthropic-language-model';

class TestableAnthropicManager extends AnthropicLanguageModelsManagerImpl {
    public retrieveCalls: string[] = [];
    public stubbedInfo: ModelInfo | Error | undefined;

    public callDeriveReasoningApi(info: ModelInfo | undefined): ReasoningApi | undefined {
        return this.deriveReasoningApi(info);
    }

    public callDeriveSupportsXHighEffort(info: ModelInfo | undefined): boolean | undefined {
        return this.deriveSupportsXHighEffort(info);
    }

    public callDeriveReasoningSupport(info: ModelInfo | undefined): ReasoningSupport | undefined {
        return this.deriveReasoningSupport(info);
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

    describe('deriveReasoningSupport', () => {
        it('returns undefined when thinking is not supported', () => {
            const info = modelInfo({
                capabilities: {
                    thinking: { supported: false, types: { adaptive: { supported: false }, enabled: { supported: false } } }
                }
            } as Partial<ModelInfo>);
            expect(manager.callDeriveReasoningSupport(info)).to.equal(undefined);
        });

        it('returns undefined when info is missing', () => {
            expect(manager.callDeriveReasoningSupport(undefined)).to.equal(undefined);
        });

        it('exposes the full level set on the legacy budget API (budget_tokens scales continuously)', () => {
            const info = modelInfo({
                capabilities: {
                    thinking: { supported: true, types: { adaptive: { supported: false }, enabled: { supported: true } } }
                    // no effort capability — budget API does not advertise per-level flags
                }
            } as Partial<ModelInfo>);
            expect(manager.callDeriveReasoningSupport(info)).to.deep.equal({
                supportedLevels: ['off', 'minimal', 'low', 'medium', 'high', 'auto'],
                defaultLevel: 'auto'
            });
        });

        it('returns [off, auto] on adaptive thinking when effort is not supported (e.g. Haiku 4.5)', () => {
            const info = modelInfo({
                capabilities: {
                    thinking: { supported: true, types: { adaptive: { supported: true }, enabled: { supported: true } } },
                    effort: {
                        supported: false,
                        low: { supported: false },
                        medium: { supported: false },
                        high: { supported: false },
                        max: { supported: false }
                    }
                }
            } as Partial<ModelInfo>);
            expect(manager.callDeriveReasoningSupport(info)).to.deep.equal({
                supportedLevels: ['off', 'auto'],
                defaultLevel: 'auto'
            });
        });

        it('derives the full graded set on adaptive thinking when low/medium/high/max are all supported', () => {
            const info = modelInfo({
                capabilities: {
                    thinking: { supported: true, types: { adaptive: { supported: true }, enabled: { supported: true } } },
                    effort: {
                        supported: true,
                        low: { supported: true },
                        medium: { supported: true },
                        high: { supported: true },
                        max: { supported: true }
                    }
                }
            } as Partial<ModelInfo>);
            expect(manager.callDeriveReasoningSupport(info)).to.deep.equal({
                supportedLevels: ['off', 'minimal', 'low', 'medium', 'high', 'auto'],
                defaultLevel: 'auto'
            });
        });

        it('treats effort.xhigh as a substitute for effort.high when only xhigh is reported', () => {
            const info = modelInfo({
                capabilities: {
                    thinking: { supported: true, types: { adaptive: { supported: true }, enabled: { supported: true } } },
                    effort: {
                        supported: true,
                        low: { supported: true },
                        medium: { supported: true },
                        high: { supported: false },
                        max: { supported: true },
                        xhigh: { supported: true }
                    }
                }
            } as Partial<ModelInfo>);
            // medium still surfaces because xhigh.supported acts as the alternate carrier for 'medium' in
            // the level→effort mapping in `anthropicReasoningFor`.
            const result = manager.callDeriveReasoningSupport(info);
            expect(result?.supportedLevels).to.deep.equal(['off', 'minimal', 'low', 'medium', 'high', 'auto']);
        });

        it('omits levels whose carrier effort value is not supported', () => {
            const info = modelInfo({
                capabilities: {
                    thinking: { supported: true, types: { adaptive: { supported: true }, enabled: { supported: true } } },
                    effort: {
                        supported: true,
                        low: { supported: false },   // -> minimal hidden
                        medium: { supported: true }, // -> low
                        high: { supported: true },   // -> medium
                        max: { supported: false }    // -> high hidden
                    }
                }
            } as Partial<ModelInfo>);
            expect(manager.callDeriveReasoningSupport(info)).to.deep.equal({
                supportedLevels: ['off', 'low', 'medium', 'auto'],
                defaultLevel: 'auto'
            });
        });
    });
});

describe('AnthropicLanguageModelsManagerImpl - fetchModelInfo cache', () => {
    let manager: TestableAnthropicManager;

    beforeEach(() => {
        manager = new TestableAnthropicManager();
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

class FakeLanguageModelRegistry {
    public readonly models = new Map<string, LanguageModel>();
    public readonly addCalls: string[][] = [];
    public readonly removeCalls: string[][] = [];
    public readonly patchCalls: string[] = [];

    addLanguageModels(models: LanguageModel[]): void {
        this.addCalls.push(models.map(m => m.id));
        for (const m of models) {
            this.models.set(m.id, m);
        }
    }
    async getLanguageModel(id: string): Promise<LanguageModel | undefined> {
        return this.models.get(id);
    }
    removeLanguageModels(ids: string[]): void {
        this.removeCalls.push([...ids]);
        for (const id of ids) {
            this.models.delete(id);
        }
    }
    async patchLanguageModel<T extends LanguageModel>(id: string, patch: Partial<T>): Promise<void> {
        this.patchCalls.push(id);
        const existing = this.models.get(id);
        if (existing) {
            Object.assign(existing, patch);
        }
    }
}

class DiscoveryTestableManager extends AnthropicLanguageModelsManagerImpl {
    public stubbedSnapshotData: ModelInfo[] | undefined;
    public stubbedSnapshotError: Error | undefined;
    public fetchCount = 0;
    public savedSnapshots: ModelInfo[][] = [];
    public persistedSnapshot: ModelInfo[] | undefined;

    constructor(registry: FakeLanguageModelRegistry) {
        super();
        (this as unknown as { languageModelRegistry: FakeLanguageModelRegistry }).languageModelRegistry = registry;
    }

    protected override async fetchSnapshot(_apiKey: string): Promise<{
        readonly fetchedAt: string;
        readonly endpoint: string;
        readonly response: { readonly data: ModelInfo[] };
    }> {
        this.fetchCount += 1;
        if (this.stubbedSnapshotError) {
            throw this.stubbedSnapshotError;
        }
        return {
            fetchedAt: '2026-05-29T00:00:00.000Z',
            endpoint: 'https://api.anthropic.com',
            response: { data: this.stubbedSnapshotData ?? [] }
        };
    }

    protected override async loadSnapshot(): Promise<{
        readonly fetchedAt: string;
        readonly endpoint: string;
        readonly response: { readonly data: ModelInfo[] };
    } | undefined> {
        if (!this.persistedSnapshot) {
            return undefined;
        }
        return {
            fetchedAt: '2026-05-29T00:00:00.000Z',
            endpoint: 'https://api.anthropic.com',
            response: { data: this.persistedSnapshot }
        };
    }

    protected override async saveSnapshot(snapshot: {
        readonly response: { readonly data: ModelInfo[] };
    }): Promise<void> {
        this.savedSnapshots.push(snapshot.response.data);
        this.persistedSnapshot = snapshot.response.data;
    }
}

function richInfo(id: string, overrides: Partial<ModelInfo> = {}): ModelInfo {
    return ({
        id,
        type: 'model',
        created_at: '2026-01-01T00:00:00Z',
        display_name: `Display ${id}`,
        max_input_tokens: 200000,
        max_tokens: 64000,
        ...overrides
    }) as unknown as ModelInfo;
}

describe('AnthropicLanguageModelsManagerImpl - discoverModels', () => {
    let registry: FakeLanguageModelRegistry;
    let manager: DiscoveryTestableManager;

    beforeEach(() => {
        registry = new FakeLanguageModelRegistry();
        manager = new DiscoveryTestableManager(registry);
        manager.setApiKey('test-key');
    });

    it('does nothing when no API key and no persisted snapshot', async () => {
        manager.setApiKey(undefined);
        delete process.env.ANTHROPIC_API_KEY;
        manager.stubbedSnapshotData = [richInfo('claude-opus-4-8')];
        await manager.discoverModels();
        expect(manager.fetchCount).to.equal(0);
        expect(registry.addCalls).to.deep.equal([]);
    });

    it('fetches and registers all models on first run, persisting the snapshot', async () => {
        manager.stubbedSnapshotData = [richInfo('claude-opus-4-8'), richInfo('claude-sonnet-4-6')];
        await manager.discoverModels();
        expect(manager.fetchCount).to.equal(1);
        expect(registry.addCalls).to.have.lengthOf(2);
        expect(registry.models.has('anthropic/claude-opus-4-8')).to.equal(true);
        expect(registry.models.has('anthropic/claude-sonnet-4-6')).to.equal(true);
        expect(manager.savedSnapshots).to.have.lengthOf(1);
        expect(manager.savedSnapshots[0].map(m => m.id)).to.deep.equal(['claude-opus-4-8', 'claude-sonnet-4-6']);
    });

    it('uses the persisted snapshot on subsequent runs without re-fetching', async () => {
        manager.persistedSnapshot = [richInfo('claude-opus-4-8')];
        await manager.discoverModels();
        expect(manager.fetchCount).to.equal(0);
        expect(registry.models.has('anthropic/claude-opus-4-8')).to.equal(true);
    });

    it('forces re-fetch and rewrites the snapshot when refreshModels is called', async () => {
        manager.persistedSnapshot = [richInfo('claude-opus-4-7')];
        await manager.discoverModels();
        expect(manager.fetchCount).to.equal(0);
        // Now refresh with new data.
        manager.stubbedSnapshotData = [richInfo('claude-opus-4-8')];
        await manager.refreshModels();
        expect(manager.fetchCount).to.equal(1);
        // The previously registered model should be pruned.
        expect(registry.models.has('anthropic/claude-opus-4-7')).to.equal(false);
        expect(registry.models.has('anthropic/claude-opus-4-8')).to.equal(true);
    });

    it('shares an in-flight discovery between concurrent callers', async () => {
        manager.stubbedSnapshotData = [richInfo('claude-x')];
        const p1 = manager.discoverModels();
        const p2 = manager.discoverModels();
        await Promise.all([p1, p2]);
        expect(manager.fetchCount).to.equal(1);
    });

    it('populates rich metadata on the registered model (name, max_input_tokens, vendor, family)', async () => {
        // `name` is populated from the API's `display_name` so selectors / settings UI / tooltips can use it,
        // while the chat-input dropdown renders the id directly for consistency — see the UI renderers.
        manager.stubbedSnapshotData = [richInfo('claude-opus-4-8', {
            display_name: 'Claude Opus 4.8',
            max_input_tokens: 1000000,
            max_tokens: 128000
        })];
        await manager.discoverModels();
        const model = registry.models.get('anthropic/claude-opus-4-8') as AnthropicModel | undefined;
        expect(model).to.not.equal(undefined);
        expect(model!.name).to.equal('Claude Opus 4.8');
        expect(model!.vendor).to.equal('Anthropic');
        expect(model!.family).to.equal('claude-opus');
        expect(model!.maxInputTokens).to.equal(1000000);
        expect(model!.maxOutputTokens).to.equal(128000);
        expect(model!.maxTokens).to.equal(128000);
    });

    it('does not persist a snapshot when fetching fails', async () => {
        manager.stubbedSnapshotError = new Error('network down');
        await manager.discoverModels();
        expect(manager.savedSnapshots).to.deep.equal([]);
        expect(registry.addCalls).to.deep.equal([]);
    });

    it('populates metadata from the persisted snapshot even when no API key is set', async () => {
        // Realistic scenario: discovery succeeded previously, then the user cleared the API key.
        // The snapshot still drives the token-usage warning, so name/maxInputTokens/maxOutputTokens must survive.
        manager.setApiKey(undefined);
        delete process.env.ANTHROPIC_API_KEY;
        manager.persistedSnapshot = [richInfo('claude-opus-4-8', {
            display_name: 'Claude Opus 4.8',
            max_input_tokens: 1000000,
            max_tokens: 128000
        })];
        await manager.discoverModels();
        expect(manager.fetchCount).to.equal(0);
        const model = registry.models.get('anthropic/claude-opus-4-8') as AnthropicModel | undefined;
        expect(model).to.not.equal(undefined);
        expect(model!.name).to.equal('Claude Opus 4.8');
        expect(model!.maxInputTokens).to.equal(1000000);
        expect(model!.maxOutputTokens).to.equal(128000);
        // The status should reflect that there is no key yet — the model is registered but not ready.
        expect(model!.status.status).to.equal('unavailable');
    });

    it('refresh always performs a real fetch even when a non-force discovery is in flight', async () => {
        // Reproduces the race where a user triggers the refresh command right after startup.
        manager.persistedSnapshot = [richInfo('claude-opus-4-7')];
        manager.stubbedSnapshotData = [richInfo('claude-opus-4-8')];
        const inFlight = manager.discoverModels(); // non-force, will load the persisted snapshot
        const refresh = manager.refreshModels();   // must force-fetch, not piggy-back on the non-force load
        await Promise.all([inFlight, refresh]);
        expect(manager.fetchCount).to.equal(1);
        expect(registry.models.has('anthropic/claude-opus-4-7')).to.equal(false);
        expect(registry.models.has('anthropic/claude-opus-4-8')).to.equal(true);
    });

    it('clears the in-flight slot after a force discovery so subsequent non-force calls still run', async () => {
        // Regression: `Promise.finally` returns a new promise, so the identity guard in the force branch
        // must compare against the wrapped promise that is actually stored in `discoveryInFlight`.
        // If the guard fails to clear the slot, the maxRetries-changed and API-key-changed handlers in the
        // frontend contribution silently no-op after any refresh.
        manager.persistedSnapshot = [richInfo('claude-x')];
        manager.stubbedSnapshotData = [richInfo('claude-x')];
        await manager.refreshModels(); // force — must release the in-flight slot in `finally`
        manager.persistedSnapshot = [richInfo('claude-y')];
        await manager.discoverModels(); // non-force — must actually run, not return a stale resolved promise
        expect(registry.models.has('anthropic/claude-x')).to.equal(false);
        expect(registry.models.has('anthropic/claude-y')).to.equal(true);
    });
});
