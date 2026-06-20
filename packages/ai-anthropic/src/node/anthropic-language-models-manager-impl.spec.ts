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
import { ReasoningApi } from '@theia/ai-core';
import { AnthropicLanguageModelsManagerImpl } from './anthropic-language-models-manager-impl';
import { AnthropicModelDescription } from '../common';

class TestableAnthropicManager extends AnthropicLanguageModelsManagerImpl {
    public retrieveCalls: string[] = [];
    public stubbedInfo: ModelInfo | Error | undefined;

    public callDeriveReasoningApi(info: ModelInfo | undefined): ReasoningApi | undefined {
        return this.deriveReasoningApi(info);
    }

    public callDeriveSupportsXHighEffort(info: ModelInfo | undefined): boolean | undefined {
        return this.deriveSupportsXHighEffort(info);
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
