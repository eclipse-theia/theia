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
        expect(await manager.fetchAvailableModelIds()).to.be.empty;
        const status = await manager.callCalculateStatus();
        expect(status.status).to.equal('unavailable');
        expect(status.message).to.contain('not authorized');
    });

    it('should reflect a failed listing in the models that are already registered', async () => {
        await manager.createOrUpdateLanguageModels({ id: 'copilot/gpt-5', model: 'gpt-5', maxRetries: 3 });
        manager.listFailure = new Error('socket hang up');
        await manager.fetchAvailableModelIds();
        expect(manager.registry.patches.map(patch => patch.id)).to.deep.equal(['copilot/gpt-5']);
        expect(manager.registry.models[0].status).to.deep.include({ status: 'unavailable' });
    });

    it('should report ready again once the models can be listed', async () => {
        await manager.createOrUpdateLanguageModels({ id: 'copilot/gpt-5', model: 'gpt-5', maxRetries: 3 });
        manager.listFailure = new Error('socket hang up');
        await manager.fetchAvailableModelIds();
        manager.listFailure = undefined;
        expect(await manager.fetchAvailableModelIds()).to.deep.equal(['gpt-5']);
        expect(manager.registry.models[0].status).to.deep.equal({ status: 'ready' });
    });

    it('should update an existing model instead of registering it twice', async () => {
        await manager.createOrUpdateLanguageModels({ id: 'copilot/gpt-5', model: 'gpt-5', maxRetries: 3 });
        await manager.createOrUpdateLanguageModels({ id: 'copilot/gpt-5', model: 'gpt-5', maxRetries: 5 });
        expect(manager.registry.models).to.have.lengthOf(1);
        expect(manager.registry.patches).to.have.lengthOf(1);
        expect(manager.registry.patches[0].patch).to.deep.include({ maxRetries: 5 });
    });
});
