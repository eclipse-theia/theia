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

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';
import { LanguageModelAlias, LanguageModelAliasRegistry } from '../common/language-model-alias';

@injectable()
export class DefaultLanguageModelAliasRegistry implements LanguageModelAliasRegistry {
    protected aliases: LanguageModelAlias[] = [
        { id: 'default/code', defaultModelIds: ['anthropic/claude-3-7-sonnet-latest', 'openai/gpt-4.1', 'google/gemini-2.5-pro-exp-03-25'] },
        { id: 'default/universal', defaultModelIds: ['anthropic/claude-3-7-sonnet-latest', 'openai/gpt-4.1', 'google/gemini-2.5-pro-exp-03-25'] },
        { id: 'default/code-completion', defaultModelIds: ['anthropic/claude-3-7-sonnet-latest', 'openai/gpt-4.1', 'google/gemini-2.5-pro-exp-03-25'] },
        { id: 'default/summarize', defaultModelIds: ['anthropic/claude-3-7-sonnet-latest', 'openai/gpt-4.1', 'google/gemini-2.5-pro-exp-03-25'] }
    ];
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    addAlias(alias: LanguageModelAlias): void {
        const idx = this.aliases.findIndex(a => a.id === alias.id);
        if (idx !== -1) {
            this.aliases[idx] = alias;
        } else {
            this.aliases.push(alias);
        }
        this.onDidChangeEmitter.fire();
    }

    removeAlias(id: string): void {
        const idx = this.aliases.findIndex(a => a.id === id);
        if (idx !== -1) {
            this.aliases.splice(idx, 1);
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
}
