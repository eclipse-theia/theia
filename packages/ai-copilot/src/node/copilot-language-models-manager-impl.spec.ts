// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { LanguageModel, LanguageModelStatus } from '@theia/ai-core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { CopilotAuthState } from '../common/copilot-auth-service';
import { CopilotLanguageModelsManagerImpl } from './copilot-language-models-manager-impl';

/** A registry that records the models and the patches it received. */
class FakeRegistry {

    readonly models: LanguageModel[] = [];
    readonly patches: Array<{ id: string, patch: Partial<LanguageModel> }> = [];

    async getLanguageModel(id: string): Promise<LanguageModel | undefined> {
        return this.models.find(model => model.id === id);
    }

    async getLanguageModels(): Promise<LanguageModel[]> {
        return this.models;
    }

    addLanguageModels(models: LanguageModel[]): void {
        this.models.push(...models);
    }

    removeLanguageModels(ids: string[]): void {
        for (const id of ids) {
            const index = this.models.findIndex(model => model.id === id);
            if (index >= 0) {
                this.models.splice(index, 1);
            }
        }
    }

    async patchLanguageModel(id: string, patch: Partial<LanguageModel>): Promise<void> {
        this.patches.push({ id, patch });
        Object.assign(this.models.find(model => model.id === id) ?? {}, patch);
    }
}

class TestableCopilotLanguageModelsManagerImpl extends CopilotLanguageModelsManagerImpl {

    authState: CopilotAuthState = { isAuthenticated: true };
    listFailure: Error | undefined;
    modelIds: string[] = ['gpt-5'];

    callVendorOf(id: string): string | undefined {
        return this.vendorOf(id);
    }

    constructor(readonly registry: FakeRegistry) {
        super();
        Object.assign(this, {
            logger: new MockLogger(),
            languageModelRegistry: registry,
            authService: {
                getAuthState: async () => this.authState,
                onAuthStateChanged: () => ({ dispose: () => { } })
            },
            sdkClientProvider: {
                listModelIds: async () => {
                    if (this.listFailure) {
                        throw this.listFailure;
                    }
                    return this.modelIds;
                }
            }
        });
    }

    callCalculateStatus(): Promise<LanguageModelStatus> {
        return this.calculateStatus();
    }
}

describe('CopilotLanguageModelsManagerImpl - status', () => {

    let manager: TestableCopilotLanguageModelsManagerImpl;

    beforeEach(() => {
        manager = new TestableCopilotLanguageModelsManagerImpl(new FakeRegistry());
    });

    it('should report a model as ready for a user who is signed in', async () => {
        await manager.createOrUpdateLanguageModels({ id: 'copilot/gpt-5', model: 'gpt-5', maxRetries: 3 });
        expect(manager.registry.models[0].status).to.deep.equal({ status: 'ready' });
    });

    it('should report a model as unavailable while nobody is signed in', async () => {
        manager.authState = { isAuthenticated: false };
        expect(await manager.callCalculateStatus()).to.deep.include({ status: 'unavailable' });
    });

    it('should report models as unavailable when they cannot be listed, rather than as ready', async () => {
        manager.listFailure = new Error('not authorized to use this Copilot feature');
        const result = await manager.fetchAvailableModels();
        expect(result.models).to.be.empty;
        expect(result.error).to.contain('not authorized');
        const status = await manager.callCalculateStatus();
        expect(status.status).to.equal('unavailable');
        expect(status.message).to.contain('not authorized');
    });

    it('should reflect a failed listing in the models that are already registered', async () => {
        await manager.createOrUpdateLanguageModels({ id: 'copilot/gpt-5', model: 'gpt-5', maxRetries: 3 });
        manager.listFailure = new Error('socket hang up');
        await manager.fetchAvailableModels();
        expect(manager.registry.patches.map(patch => patch.id)).to.deep.equal(['copilot/gpt-5']);
        expect(manager.registry.models[0].status).to.deep.include({ status: 'unavailable' });
    });

    it('should report ready again once the models can be listed', async () => {
        await manager.createOrUpdateLanguageModels({ id: 'copilot/gpt-5', model: 'gpt-5', maxRetries: 3 });
        manager.listFailure = new Error('socket hang up');
        await manager.fetchAvailableModels();
        manager.listFailure = undefined;
        expect((await manager.fetchAvailableModels()).models).to.deep.equal([{ id: 'gpt-5', featured: true }]);
        expect(manager.registry.models[0].status).to.deep.equal({ status: 'ready' });
    });

    it('nominates auto and one model of each major vendor before a second of any', async () => {
        manager.modelIds = ['auto', 'gpt-5', 'gpt-4.1', 'claude-sonnet-4.5', 'claude-haiku-4', 'gemini-2.5-pro', 'gpt-5-2026-04-17'];
        const featured = (await manager.fetchAvailableModels()).models.filter(model => model.featured).map(model => model.id);
        // Five in total: auto, the newest of each vendor, then the next of the first vendor with one left.
        expect(featured).to.have.members(['auto', 'gpt-5', 'claude-sonnet-4.5', 'gemini-2.5-pro', 'claude-haiku-4']);
    });

    it('fills the list to five even when the CLI offers no auto', async () => {
        manager.modelIds = ['gpt-5', 'gpt-4.1', 'claude-sonnet-4.5', 'claude-haiku-4', 'gemini-3-pro', 'gemini-2.5-pro'];
        const featured = (await manager.fetchAvailableModels()).models.filter(model => model.featured).map(model => model.id);
        expect(featured).to.have.members(['gpt-5', 'claude-sonnet-4.5', 'gemini-3-pro', 'gpt-4.1', 'claude-haiku-4']);
    });

    it('nominates no more than the five, however much one vendor offers', async () => {
        manager.modelIds = ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o', 'o5-preview', 'chatgpt-5-latest'];
        const featured = (await manager.fetchAvailableModels()).models.filter(model => model.featured).map(model => model.id);
        expect(featured).to.have.lengthOf(5);
    });

    it('counts the reasoning models as OpenAI, rather than as a vendor of their own', () => {
        expect(manager.callVendorOf('o5-preview')).to.equal('openai');
        expect(manager.callVendorOf('gpt-4.1')).to.equal('openai');
        expect(manager.callVendorOf('claude-sonnet-4.5')).to.equal('anthropic');
        expect(manager.callVendorOf('grok-code-fast-1')).to.equal(undefined);
    });

    it('nominates nothing for the vendors beyond the three, which stay selectable but not preselected', async () => {
        manager.modelIds = ['claude-sonnet-4.5', 'grok-code-fast-1', 'mistral-large', 'llama-4-maverick'];
        const result = await manager.fetchAvailableModels();
        expect(result.models.map(model => model.id)).to.have.lengthOf(4);
        expect(result.models.filter(model => model.featured).map(model => model.id)).to.deep.equal(['claude-sonnet-4.5']);
    });

    it('recognises a vendor-qualified id, in case the CLI reports them that way', async () => {
        manager.modelIds = ['google/gemini-2.5-pro', 'anthropic/claude-sonnet-4.5'];
        const featured = (await manager.fetchAvailableModels()).models.filter(model => model.featured).map(model => model.id);
        expect(featured).to.have.members(['google/gemini-2.5-pro', 'anthropic/claude-sonnet-4.5']);
    });

    it('never nominates a release-pinned id, whose undated form is nominated instead', async () => {
        manager.modelIds = ['gpt-5', 'gpt-5-2026-04-17'];
        const featured = (await manager.fetchAvailableModels()).models.filter(model => model.featured).map(model => model.id);
        expect(featured).to.deep.equal(['gpt-5']);
    });

    it('should update an existing model instead of registering it twice', async () => {
        await manager.createOrUpdateLanguageModels({ id: 'copilot/gpt-5', model: 'gpt-5', maxRetries: 3 });
        await manager.createOrUpdateLanguageModels({ id: 'copilot/gpt-5', model: 'gpt-5', maxRetries: 5 });
        expect(manager.registry.models).to.have.lengthOf(1);
        expect(manager.registry.patches).to.have.lengthOf(1);
        expect(manager.registry.patches[0].patch).to.deep.include({ maxRetries: 5 });
    });
});
