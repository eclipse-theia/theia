/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { IGrammarConfiguration } from 'vscode-textmate';
import { TokenizerOption } from './textmate-tokenizer';
import { Disposable } from '@theia/core/lib/common/disposable';

export interface TextmateGrammarConfiguration extends IGrammarConfiguration {

    /**
     * Optional options to further refine the tokenization of the grammar.
     */
    readonly tokenizerOption?: TokenizerOption;

}

export interface GrammarDefinitionProvider {
    getGrammarDefinition(): Promise<GrammarDefinition>;
    getInjections?(scopeName: string): string[];
}

export interface GrammarDefinition {
    format: 'json' | 'plist';
    content: object | string;
    location?: string;
}

@injectable()
export class TextmateRegistry {

    protected readonly scopeToProvider = new Map<string, GrammarDefinitionProvider[]>();
    protected readonly languageToConfig = new Map<string, TextmateGrammarConfiguration[]>();
    protected readonly languageIdToScope = new Map<string, string[]>();

    get languages(): IterableIterator<string> {
        return this.languageIdToScope.keys();
    }

    registerTextmateGrammarScope(scope: string, provider: GrammarDefinitionProvider): Disposable {
        const providers = this.scopeToProvider.get(scope) || [];
        const existingProvider = providers[0];
        if (existingProvider) {
            Promise.all([existingProvider.getGrammarDefinition(), provider.getGrammarDefinition()]).then(([a, b]) => {
                if (a.location !== b.location || !a.location && !b.location) {
                    console.warn(`a registered grammar provider for '${scope}' scope is overridden`);
                }
            });
        }
        providers.unshift(provider);
        this.scopeToProvider.set(scope, providers);
        return Disposable.create(() => {
            const index = providers.indexOf(provider);
            if (index !== -1) {
                providers.splice(index, 1);
            }
        });
    }

    getProvider(scope: string): GrammarDefinitionProvider | undefined {
        const providers = this.scopeToProvider.get(scope);
        return providers && providers[0];
    }

    mapLanguageIdToTextmateGrammar(languageId: string, scope: string): Disposable {
        const scopes = this.languageIdToScope.get(languageId) || [];
        const existingScope = scopes[0];
        if (typeof existingScope === 'string') {
            console.warn(`'${languageId}' language is remapped from '${existingScope}' to '${scope}' scope`);
        }
        scopes.unshift(scope);
        this.languageIdToScope.set(languageId, scopes);
        return Disposable.create(() => {
            const index = scopes.indexOf(scope);
            if (index !== -1) {
                scopes.splice(index, 1);
            }
        });
    }

    getScope(languageId: string): string | undefined {
        const scopes = this.languageIdToScope.get(languageId);
        return scopes && scopes[0];
    }

    getLanguageId(scope: string): string | undefined {
        for (const languageId of this.languageIdToScope.keys()) {
            if (this.getScope(languageId) === scope) {
                return languageId;
            }
        }
        return undefined;
    }

    registerGrammarConfiguration(languageId: string, config: TextmateGrammarConfiguration): Disposable {
        const configs = this.languageToConfig.get(languageId) || [];
        const existingConfig = configs[0];
        if (existingConfig) {
            console.warn(`a registered grammar configuration for '${languageId}' language is overridden`);
        }
        configs.unshift(config);
        this.languageToConfig.set(languageId, configs);
        return Disposable.create(() => {
            const index = configs.indexOf(config);
            if (index !== -1) {
                configs.splice(index, 1);
            }
        });
    }

    getGrammarConfiguration(languageId: string): TextmateGrammarConfiguration {
        const configs = this.languageToConfig.get(languageId);
        return configs && configs[0] || {};
    }

}
