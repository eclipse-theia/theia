/*
 * Copyright (C) 2018 Redhat, Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from "inversify";
import { Registry } from 'monaco-textmate';
import { ILogger, DisposableCollection, ContributionProvider } from "@theia/core";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { MonacoTextModelService } from "../monaco-text-model-service";
import { LanguageGrammarDefinitionContribution } from "./textmate-contribution";
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
        for (const grammarProvider of this.grammarProviders.getContributions()) {
            grammarProvider.registerTextmateLanguage(this.textmateRegistry);
        }

        this.grammarRegistry = new Registry({
            getGrammarDefinition: async (scopeName: string, dependentScope: string) => {
                if (this.textmateRegistry.hasProvider(scopeName)) {
                    const provider = this.textmateRegistry.getProvider(scopeName);
                    return await provider!.getGrammarDefinition(scopeName, dependentScope);
                }
                return {
                    format: 'json',
                    content: ''
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

        await this.onigasmPromise;
        try {
            monaco.languages.setTokensProvider(languageId, createTextmateTokenizer(
                await this.grammarRegistry.loadGrammar(scopeName)
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
