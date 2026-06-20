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
import { ReasoningApi } from '@theia/ai-core';
import { GoogleLanguageModelsManagerImpl, reasoningApiFromModelId } from './google-language-models-manager-impl';
import { GoogleModelDescription } from '../common';

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
