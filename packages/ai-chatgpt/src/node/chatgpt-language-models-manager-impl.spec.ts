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
import { Emitter, Event } from '@theia/core';
import { Container } from '@theia/core/shared/inversify';
import { LanguageModel, LanguageModelRegistry, LanguageModelSelector } from '@theia/ai-core';
import { OpenAiModelUtils } from '@theia/ai-openai/lib/node/openai-language-model';
import { ChatGptAuthState } from '../common';
import { ChatGptAuthServiceImpl } from './chatgpt-auth-service-impl';
import { ChatGptModel } from './chatgpt-language-model';
import { ChatGptLanguageModelsManagerImpl } from './chatgpt-language-models-manager-impl';
import { ChatGptModelCatalog } from './chatgpt-model-catalog';
import { ChatGptResponseApiUtils } from './chatgpt-response-api-utils';

class FakeLanguageModelRegistry implements LanguageModelRegistry {
    readonly models = new Map<string, LanguageModel>();
    readonly patches: { id: string, patch: Partial<LanguageModel> }[] = [];
    readonly removed: string[][] = [];

    protected readonly emitter = new Emitter<{ models: LanguageModel[] }>();
    readonly onChange: Event<{ models: LanguageModel[] }> = this.emitter.event;

    addLanguageModels(models: LanguageModel[]): void {
        models.forEach(model => this.models.set(model.id, model));
    }
    async getLanguageModels(): Promise<LanguageModel[]> {
        return [...this.models.values()];
    }
    async getLanguageModel(id: string): Promise<LanguageModel | undefined> {
        return this.models.get(id);
    }
    removeLanguageModels(ids: string[]): void {
        this.removed.push(ids);
        ids.forEach(id => this.models.delete(id));
    }
    async selectLanguageModel(request: LanguageModelSelector): Promise<LanguageModel | undefined> {
        return undefined;
    }
    async selectLanguageModels(request: LanguageModelSelector): Promise<LanguageModel[] | undefined> {
        return undefined;
    }
    async patchLanguageModel<T extends LanguageModel = LanguageModel>(id: string, patch: Partial<T>): Promise<void> {
        this.patches.push({ id, patch });
        Object.assign(this.models.get(id)!, patch);
    }
}

const UNAVAILABLE = { status: 'unavailable', message: 'Not signed in with ChatGPT' };

describe('ChatGptLanguageModelsManagerImpl', () => {

    let manager: ChatGptLanguageModelsManagerImpl;
    let registry: FakeLanguageModelRegistry;
    let authState: ChatGptAuthState;

    beforeEach(() => {
        registry = new FakeLanguageModelRegistry();
        authState = { isAuthenticated: false };

        const container = new Container();
        container.bind(LanguageModelRegistry).toConstantValue(registry);
        container.bind(ChatGptAuthServiceImpl).toConstantValue({
            getAuthState: async () => authState,
            getCredentials: async () => ({ accessToken: 'token', accountId: 'account-id' })
        } as unknown as ChatGptAuthServiceImpl);
        container.bind(ChatGptResponseApiUtils).toSelf().inSingletonScope();
        container.bind(OpenAiModelUtils).toSelf().inSingletonScope();
        container.bind(ChatGptModelCatalog).toConstantValue({
            getAvailableModels: async () => ['gpt-5.6-sol']
        } as unknown as ChatGptModelCatalog);
        container.bind(ChatGptLanguageModelsManagerImpl).toSelf().inSingletonScope();
        manager = container.get(ChatGptLanguageModelsManagerImpl);
    });

    it('registers the configured models while nobody is signed in, stating why they are unavailable', async () => {
        await manager.createOrUpdateLanguageModels({ id: 'chatgpt/gpt-5.5', model: 'gpt-5.5', maxRetries: 3 });

        const model = registry.models.get('chatgpt/gpt-5.5') as ChatGptModel;
        expect(model).to.be.instanceOf(ChatGptModel);
        expect(model.status).to.deep.equal(UNAVAILABLE);
        expect(model.vendor).to.equal('chatgpt');
        expect(model.model).to.equal('gpt-5.5');
        expect(model.maxRetries).to.equal(3);
    });

    it('reports the models as ready once the user is signed in', async () => {
        authState = { isAuthenticated: true, accountLabel: 'user@example.com' };
        await manager.createOrUpdateLanguageModels({ id: 'chatgpt/gpt-5.5', model: 'gpt-5.5', maxRetries: 3 });

        expect((registry.models.get('chatgpt/gpt-5.5') as ChatGptModel).status).to.deep.equal({ status: 'ready' });
    });

    it('flips the status of the already registered models on sign out instead of removing them', async () => {
        authState = { isAuthenticated: true };
        await manager.createOrUpdateLanguageModels({ id: 'chatgpt/gpt-5.5', model: 'gpt-5.5', maxRetries: 3 });

        authState = { isAuthenticated: false };
        await manager.createOrUpdateLanguageModels({ id: 'chatgpt/gpt-5.5', model: 'gpt-5.5', maxRetries: 3 });

        expect(registry.models.size).to.equal(1);
        expect(registry.patches).to.have.lengthOf(1);
        expect((registry.models.get('chatgpt/gpt-5.5') as ChatGptModel).status).to.deep.equal(UNAVAILABLE);
    });

    it('patches an already registered model instead of replacing it', async () => {
        await manager.createOrUpdateLanguageModels({ id: 'chatgpt/gpt-5.5', model: 'gpt-5.5', maxRetries: 3 });
        const registered = registry.models.get('chatgpt/gpt-5.5');

        await manager.createOrUpdateLanguageModels({ id: 'chatgpt/gpt-5.5', model: 'gpt-5.5-pro', maxRetries: 5 });

        expect(registry.models.get('chatgpt/gpt-5.5')).to.equal(registered);
        expect(registry.patches[0].patch).to.include({ model: 'gpt-5.5-pro', maxRetries: 5 });
    });

    it('applies the OpenAI capabilities of the model', async () => {
        await manager.createOrUpdateLanguageModels({ id: 'chatgpt/gpt-5.5', model: 'gpt-5.5', maxRetries: 3 });

        const model = registry.models.get('chatgpt/gpt-5.5') as ChatGptModel;
        expect(model.reasoningSupport).to.not.equal(undefined);
        expect(model.maxInputTokens).to.be.a('number');
    });

    it('leaves a model of another provider alone', async () => {
        const foreign = { id: 'chatgpt/gpt-5.5', vendor: 'openai' } as unknown as LanguageModel;
        registry.addLanguageModels([foreign]);

        await manager.createOrUpdateLanguageModels({ id: 'chatgpt/gpt-5.5', model: 'gpt-5.5', maxRetries: 3 });

        expect(registry.models.get('chatgpt/gpt-5.5')).to.equal(foreign);
        expect(registry.patches).to.be.empty;
    });

    it('passes the configured proxy on to the models', async () => {
        manager.setProxyUrl('http://proxy.example.com:3128');
        await manager.createOrUpdateLanguageModels({ id: 'chatgpt/gpt-5.5', model: 'gpt-5.5', maxRetries: 3 });

        expect((registry.models.get('chatgpt/gpt-5.5') as ChatGptModel).proxy).to.equal('http://proxy.example.com:3128');
    });

    it('serves the models of the plan to the frontend, which decides what to register', async () => {
        expect(await manager.getAvailableModels()).to.deep.equal(['gpt-5.6-sol']);
    });

    it('removes the models it is asked to remove', async () => {
        await manager.createOrUpdateLanguageModels({ id: 'chatgpt/gpt-5.5', model: 'gpt-5.5', maxRetries: 3 });

        manager.removeLanguageModels('chatgpt/gpt-5.5');

        expect(registry.removed).to.deep.equal([['chatgpt/gpt-5.5']]);
        expect(registry.models.size).to.equal(0);
    });
});
