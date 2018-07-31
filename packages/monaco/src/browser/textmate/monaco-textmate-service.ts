/********************************************************************************
 * Copyright (C) 2018 Redhat, Ericsson and others.
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

import { injectable, inject, named } from "inversify";
import { Registry } from 'monaco-textmate';
import { ILogger, DisposableCollection, ContributionProvider } from "@theia/core";
import { FrontendApplicationContribution, isBasicWasmSupported } from "@theia/core/lib/browser";
import { MonacoTextModelService } from "../monaco-text-model-service";
import { LanguageGrammarDefinitionContribution, getEncodedLanguageId } from "./textmate-contribution";
import { createTextmateTokenizer } from "./textmate-tokenizer";
import { TextmateRegistry } from "./textmate-registry";

export const OnigasmPromise = Symbol('OnigasmPromise');
export type OnigasmPromise = Promise<void>;

@injectable()
export class MonacoTextmateService implements FrontendApplicationContribution {

    protected readonly toDispose = new DisposableCollection();

    protected readonly activatedLanguages = new Set<string>();
    protected grammarRegistry: Registry;

    @inject(ContributionProvider) @named(LanguageGrammarDefinitionContribution)
    protected readonly grammarProviders: ContributionProvider<LanguageGrammarDefinitionContribution>;

    @inject(TextmateRegistry)
    protected readonly textmateRegistry: TextmateRegistry;

    @inject(MonacoTextModelService)
    protected readonly monacoModelService: MonacoTextModelService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(OnigasmPromise)
    protected readonly onigasmPromise: OnigasmPromise;

    initialize() {
        if (!isBasicWasmSupported) {
            console.log('Textmate support deactivated because WebAssembly is not detected.');
            return;
        }

        for (const grammarProvider of this.grammarProviders.getContributions()) {
            grammarProvider.registerTextmateLanguage(this.textmateRegistry);
        }

        this.grammarRegistry = new Registry({
            getGrammarDefinition: async (scopeName: string, dependentScope: string) => {
                const provider = this.textmateRegistry.getProvider(scopeName);
                if (provider) {
                    return await provider!.getGrammarDefinition(scopeName, dependentScope);
                }
                return {
                    format: 'json',
                    content: '{}'
                };
            }
        });

        this.toDispose.push(this.monacoModelService.onDidCreate(model => {
            if (!this.activatedLanguages.has(model.languageId)) {
                this.activatedLanguages.add(model.languageId);
                this.activateLanguage(model.languageId);
            }
        }));
    }

    async activateLanguage(languageId: string) {
        const scopeName = this.textmateRegistry.getScope(languageId);
        if (!scopeName) {
            return;
        }
        const provider = this.textmateRegistry.getProvider(scopeName);
        if (!provider) {
            return;
        }

        const configuration = this.textmateRegistry.getGrammarConfiguration(languageId);
        const initialLanguage = getEncodedLanguageId(languageId);

        await this.onigasmPromise;
        try {
            monaco.languages.setTokensProvider(languageId, createTextmateTokenizer(
                await this.grammarRegistry.loadGrammarWithConfiguration(scopeName, initialLanguage, configuration)
            ));
        } catch (err) {
            this.logger.warn('No grammar for this language id', languageId);
        }
    }

    resetLanguage(languageId: string) {
        this.activatedLanguages.delete(languageId);
    }

    onStop(): void {
        this.toDispose.dispose();
    }
}
