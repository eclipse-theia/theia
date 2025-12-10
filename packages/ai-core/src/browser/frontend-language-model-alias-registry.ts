// *****************************************************************************
// Copyright (C) 2024-2025 EclipseSource GmbH.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event, nls } from '@theia/core';
import { LanguageModelAlias, LanguageModelAliasRegistry } from '../common/language-model-alias';
import { PreferenceScope, PreferenceService } from '@theia/core/lib/common';
import { LANGUAGE_MODEL_ALIASES_PREFERENCE } from '../common/ai-core-preferences';
import { Deferred } from '@theia/core/lib/common/promise-util';

@injectable()
export class DefaultLanguageModelAliasRegistry implements LanguageModelAliasRegistry {

    protected aliases: LanguageModelAlias[] = [
        {
            id: 'default/code',
            defaultModelIds: [
                'anthropic/claude-opus-4-5',
                'openai/gpt-5.1',
                'google/gemini-3-pro-preview'
            ],
            description: nls.localize('theia/ai/core/defaultModelAliases/code/description', 'Optimized for code understanding and generation tasks.')
        },
        {
            id: 'default/universal',
            defaultModelIds: [
                'openai/gpt-5.1',
                'anthropic/claude-opus-4-5',
                'google/gemini-3-pro-preview'
            ],
            description: nls.localize('theia/ai/core/defaultModelAliases/universal/description', 'Well-balanced for both code and general language use.')
        },
        {
            id: 'default/code-completion',
            defaultModelIds: [
                'openai/gpt-4.1',
                'anthropic/claude-opus-4-5',
                'google/gemini-3-pro-preview'
            ],
            description: nls.localize('theia/ai/core/defaultModelAliases/code-completion/description', 'Best suited for code autocompletion scenarios.')
        },
        {
            id: 'default/summarize',
            defaultModelIds: [
                'openai/gpt-5.1',
                'anthropic/claude-opus-4-5',
                'google/gemini-3-pro-preview'
            ],
            description: nls.localize('theia/ai/core/defaultModelAliases/summarize/description', 'Models prioritized for summarization and condensation of content.')
        }
    ];
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected readonly _ready = new Deferred<void>();
    get ready(): Promise<void> {
        return this._ready.promise;
    }

    @postConstruct()
    protected init(): void {
        this.preferenceService.ready.then(() => {
            this.loadFromPreference();
            this.preferenceService.onPreferenceChanged(ev => {
                if (ev.preferenceName === LANGUAGE_MODEL_ALIASES_PREFERENCE) {
                    this.loadFromPreference();
                }
            });
            this._ready.resolve();
        }, err => {
            this._ready.reject(err);
        });
    }

    addAlias(alias: LanguageModelAlias): void {
        const idx = this.aliases.findIndex(a => a.id === alias.id);
        if (idx !== -1) {
            this.aliases[idx] = alias;
        } else {
            this.aliases.push(alias);
        }
        this.saveToPreference();
        this.onDidChangeEmitter.fire();
    }

    removeAlias(id: string): void {
        const idx = this.aliases.findIndex(a => a.id === id);
        if (idx !== -1) {
            this.aliases.splice(idx, 1);
            this.saveToPreference();
            this.onDidChangeEmitter.fire();
        }
    }

    getAliases(): LanguageModelAlias[] {
        return [...this.aliases];
    }

    resolveAlias(id: string): string[] | undefined {
        const alias = this.aliases.find(a => a.id === id);
        if (!alias) {
            return undefined;
        }
        if (alias.selectedModelId) {
            return [alias.selectedModelId];
        }
        return alias.defaultModelIds;
    }

    /**
     * Set the selected model for the given alias id.
     * Updates the alias' selectedModelId to the given modelId, persists, and fires onDidChange.
     */
    selectModelForAlias(aliasId: string, modelId: string): void {
        const alias = this.aliases.find(a => a.id === aliasId);
        if (alias) {
            alias.selectedModelId = modelId;
            this.saveToPreference();
            this.onDidChangeEmitter.fire();
        }
    }

    /**
     * Load aliases from the persisted setting
     */
    protected loadFromPreference(): void {
        const stored = this.preferenceService.get<{ [name: string]: { selectedModel: string } }>(LANGUAGE_MODEL_ALIASES_PREFERENCE) || {};
        this.aliases.forEach(alias => {
            if (stored[alias.id] && stored[alias.id].selectedModel) {
                alias.selectedModelId = stored[alias.id].selectedModel;
            } else {
                delete alias.selectedModelId;
            }
        });
    }

    /**
     * Persist the current aliases and their selected models to the setting
     */
    protected saveToPreference(): void {
        const map: { [name: string]: { selectedModel: string } } = {};
        for (const alias of this.aliases) {
            if (alias.selectedModelId) {
                map[alias.id] = { selectedModel: alias.selectedModelId };
            }
        }
        this.preferenceService.set(LANGUAGE_MODEL_ALIASES_PREFERENCE, map, PreferenceScope.User);
    }
}
