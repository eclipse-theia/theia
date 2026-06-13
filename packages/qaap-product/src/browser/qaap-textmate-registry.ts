// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { Disposable } from '@theia/core/lib/common/disposable';
import {
    GrammarDefinitionProvider,
    TextmateGrammarConfiguration,
    TextmateRegistry,
} from '@theia/monaco/lib/browser/textmate/textmate-registry';

/** Same behavior as upstream {@link TextmateRegistry} without duplicate-registration console warnings. */
@injectable()
export class QaapTextmateRegistry extends TextmateRegistry {

    override registerTextmateGrammarScope(scope: string, provider: GrammarDefinitionProvider): Disposable {
        const providers = this.getScopeProviders(scope);
        providers.unshift(provider);
        this.setScopeProviders(scope, providers);
        return Disposable.create(() => {
            const index = providers.indexOf(provider);
            if (index !== -1) {
                providers.splice(index, 1);
            }
        });
    }

    override mapLanguageIdToTextmateGrammar(languageId: string, scope: string): Disposable {
        const scopes = this.getLanguageScopes(languageId);
        scopes.unshift(scope);
        this.setLanguageScopes(languageId, scopes);
        return Disposable.create(() => {
            const index = scopes.indexOf(scope);
            if (index !== -1) {
                scopes.splice(index, 1);
            }
        });
    }

    override registerGrammarConfiguration(languageId: string, config: TextmateGrammarConfiguration): Disposable {
        const configs = this.getLanguageConfigs(languageId);
        configs.unshift(config);
        this.setLanguageConfigs(languageId, configs);
        return Disposable.create(() => {
            const index = configs.indexOf(config);
            if (index !== -1) {
                configs.splice(index, 1);
            }
        });
    }

    protected getScopeProviders(scope: string): GrammarDefinitionProvider[] {
        return (this as unknown as { scopeToProvider: Map<string, GrammarDefinitionProvider[]> }).scopeToProvider.get(scope) || [];
    }

    protected setScopeProviders(scope: string, providers: GrammarDefinitionProvider[]): void {
        (this as unknown as { scopeToProvider: Map<string, GrammarDefinitionProvider[]> }).scopeToProvider.set(scope, providers);
    }

    protected getLanguageScopes(languageId: string): string[] {
        return (this as unknown as { languageIdToScope: Map<string, string[]> }).languageIdToScope.get(languageId) || [];
    }

    protected setLanguageScopes(languageId: string, scopes: string[]): void {
        (this as unknown as { languageIdToScope: Map<string, string[]> }).languageIdToScope.set(languageId, scopes);
    }

    protected getLanguageConfigs(languageId: string): TextmateGrammarConfiguration[] {
        return (this as unknown as { languageToConfig: Map<string, TextmateGrammarConfiguration[]> }).languageToConfig.get(languageId) || [];
    }

    protected setLanguageConfigs(languageId: string, configs: TextmateGrammarConfiguration[]): void {
        (this as unknown as { languageToConfig: Map<string, TextmateGrammarConfiguration[]> }).languageToConfig.set(languageId, configs);
    }
}
