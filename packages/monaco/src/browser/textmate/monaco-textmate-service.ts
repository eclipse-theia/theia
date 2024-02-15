// *****************************************************************************
// Copyright (C) 2018 Redhat, Ericsson and others.
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

import { injectable, inject, named } from '@theia/core/shared/inversify';
import { Registry } from 'vscode-textmate';
import { ILogger, ContributionProvider, DisposableCollection, Disposable } from '@theia/core';
import { FrontendApplicationContribution, isBasicWasmSupported } from '@theia/core/lib/browser';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { LanguageGrammarDefinitionContribution, getEncodedLanguageId } from './textmate-contribution';
import { createTextmateTokenizer, TokenizerOption } from './textmate-tokenizer';
import { TextmateRegistry } from './textmate-registry';
import { MonacoThemeRegistry } from './monaco-theme-registry';
import { EditorPreferences } from '@theia/editor/lib/browser/editor-preferences';
import * as monaco from '@theia/monaco-editor-core';
import { TokenizationRegistry } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import { IStandaloneThemeService } from '@theia/monaco-editor-core/esm/vs/editor/standalone/common/standaloneTheme';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { ILanguageService } from '@theia/monaco-editor-core/esm/vs/editor/common/languages/language';
import { TokenizationSupportAdapter } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneLanguages';
import { LanguageService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/languageService';
import { OnigasmProvider, TextmateRegistryFactory } from './monaco-theme-types';

@injectable()
export class MonacoTextmateService implements FrontendApplicationContribution {

    protected readonly tokenizerOption: TokenizerOption = {
        lineLimit: 400
    };

    protected readonly _activatedLanguages = new Set<string>();

    protected grammarRegistry: Registry;

    @inject(ContributionProvider) @named(LanguageGrammarDefinitionContribution)
    protected readonly grammarProviders: ContributionProvider<LanguageGrammarDefinitionContribution>;

    @inject(TextmateRegistry)
    protected readonly textmateRegistry: TextmateRegistry;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(OnigasmProvider)
    protected readonly onigasmProvider: OnigasmProvider;

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    @inject(MonacoThemeRegistry)
    protected readonly monacoThemeRegistry: MonacoThemeRegistry;

    @inject(EditorPreferences)
    protected readonly preferences: EditorPreferences;

    @inject(TextmateRegistryFactory)
    protected readonly registryFactory: TextmateRegistryFactory;

    initialize(): void {
        if (!isBasicWasmSupported) {
            console.log('Textmate support deactivated because WebAssembly is not detected.');
            return;
        }

        for (const grammarProvider of this.grammarProviders.getContributions()) {
            try {
                grammarProvider.registerTextmateLanguage(this.textmateRegistry);
            } catch (err) {
                console.error(err);
            }
        }

        this.grammarRegistry = this.registryFactory(this.monacoThemeRegistry.getThemeData(this.currentEditorTheme));

        this.tokenizerOption.lineLimit = this.preferences['editor.maxTokenizationLineLength'];
        this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'editor.maxTokenizationLineLength') {
                this.tokenizerOption.lineLimit = e.newValue;
            }
        });

        this.updateTheme();
        this.themeService.onDidColorThemeChange(() => this.updateTheme());

        for (const id of this.textmateRegistry.languages) {
            this.activateLanguage(id);
        }
    }

    protected readonly toDisposeOnUpdateTheme = new DisposableCollection();

    protected updateTheme(): void {
        this.toDisposeOnUpdateTheme.dispose();

        const currentEditorTheme = this.currentEditorTheme;
        document.body.classList.add(currentEditorTheme);
        this.toDisposeOnUpdateTheme.push(Disposable.create(() => document.body.classList.remove(currentEditorTheme)));

        // first update registry to run tokenization with the proper theme
        const theme = this.monacoThemeRegistry.getThemeData(currentEditorTheme);
        if (theme) {
            this.grammarRegistry.setTheme(theme);
        }

        // then trigger tokenization by setting monaco theme
        monaco.editor.setTheme(currentEditorTheme);
    }

    protected get currentEditorTheme(): string {
        return this.themeService.getCurrentTheme().editorTheme || MonacoThemeRegistry.DARK_DEFAULT_THEME;
    }

    activateLanguage(language: string): Disposable {
        const toDispose = new DisposableCollection(
            Disposable.create(() => { /* mark as not disposed */ })
        );
        toDispose.push(this.waitForLanguage(language, () =>
            this.doActivateLanguage(language, toDispose)
        ));
        return toDispose;
    }

    protected async doActivateLanguage(languageId: string, toDispose: DisposableCollection): Promise<void> {
        if (this._activatedLanguages.has(languageId)) {
            return;
        }
        this._activatedLanguages.add(languageId);
        toDispose.push(Disposable.create(() => this._activatedLanguages.delete(languageId)));

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

        await this.onigasmProvider();
        if (toDispose.disposed) {
            return;
        }
        try {
            const grammar = await this.grammarRegistry.loadGrammarWithConfiguration(scopeName, initialLanguage, configuration);
            if (toDispose.disposed) {
                return;
            }
            if (!grammar) {
                throw new Error(`no grammar for ${scopeName}, ${initialLanguage}, ${JSON.stringify(configuration)}`);
            }
            const options = configuration.tokenizerOption ? configuration.tokenizerOption : this.tokenizerOption;
            const tokenizer = createTextmateTokenizer(grammar, options);
            toDispose.push(monaco.languages.setTokensProvider(languageId, tokenizer));
            const support = TokenizationRegistry.get(languageId);
            const themeService = StandaloneServices.get(IStandaloneThemeService);
            const languageService = StandaloneServices.get(ILanguageService);
            const adapter = new TokenizationSupportAdapter(languageId, tokenizer, languageService, themeService);
            support!.tokenize = adapter.tokenize.bind(adapter);
        } catch (error) {
            this.logger.warn('No grammar for this language id', languageId, error);
        }
    }

    protected waitForLanguage(language: string, cb: () => {}): Disposable {
        const languageService = StandaloneServices.get(ILanguageService) as LanguageService;
        if (languageService['_requestedBasicLanguages'].has(language)) {
            cb();
            return Disposable.NULL;
        }
        return monaco.languages.onLanguage(language, cb);
    }
}
