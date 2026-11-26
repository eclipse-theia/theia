// *****************************************************************************
// Copyright (C) 2026 CodeSignal and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import { AiConfigurationChange, AiConfigurationService } from '../common/ai-configuration-service.js';
import { LANGUAGE_MODEL_ALIASES_PREFERENCE } from '../common/ai-core-preferences.js';
import { DefaultLanguageModelAliasRegistry } from './frontend-language-model-alias-registry.js';

disableJSDOM();

interface StoredAliases { [name: string]: { selectedModel: string } }

class StubAiConfigurationService implements Pick<AiConfigurationService, 'ready' | 'get' | 'set' | 'onDidChange'> {
    readonly ready = Promise.resolve();
    protected readonly onDidChangeEmitter = new Emitter<AiConfigurationChange>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    stored: StoredAliases = {};

    get<T>(): T | undefined {
        // The registry reads only the aliases preference.
        return this.stored as T;
    }

    async set(key: string, value: unknown): Promise<void> {
        this.stored = value as StoredAliases;
        this.fireChange();
    }

    fireChange(): void {
        this.onDidChangeEmitter.fire({
            preferenceName: LANGUAGE_MODEL_ALIASES_PREFERENCE,
            affects: () => true,
            affectsPreference: preferenceName => preferenceName === LANGUAGE_MODEL_ALIASES_PREFERENCE
        });
    }
}

describe('DefaultLanguageModelAliasRegistry', () => {
    let configuration: StubAiConfigurationService;
    let registry: DefaultLanguageModelAliasRegistry;
    let changes: number;

    beforeEach(async () => {
        configuration = new StubAiConfigurationService();
        const container = new Container();
        container.bind<Pick<AiConfigurationService, 'ready' | 'get' | 'set' | 'onDidChange'>>(AiConfigurationService).toConstantValue(configuration);
        container.bind(DefaultLanguageModelAliasRegistry).toSelf().inSingletonScope();
        registry = container.get(DefaultLanguageModelAliasRegistry);
        await registry.ready;
        changes = 0;
        registry.onDidChange(() => changes++);
    });

    it('fires a change when the aliases preference starts to apply another model, as on a workspace trust change', () => {
        configuration.stored = { 'default/code': { selectedModel: 'test/model' } };
        configuration.fireChange();

        expect(registry.resolveAlias('default/code')).to.deep.equal(['test/model']);
        expect(changes).to.equal(1);
    });

    it('fires once for its own write', () => {
        registry.selectModelForAlias('default/code', 'test/model');

        expect(configuration.stored).to.deep.equal({ 'default/code': { selectedModel: 'test/model' } });
        expect(changes).to.equal(1);
    });
});
