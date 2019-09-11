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

import { injectable, inject, named } from 'inversify';
import { Registry, IOnigLib, IRawGrammar, parseRawGrammar } from 'vscode-textmate';
import { ILogger, ContributionProvider, Emitter, DisposableCollection, Disposable } from '@theia/core';
import { FrontendApplicationContribution, isBasicWasmSupported } from '@theia/core/lib/browser';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { LanguageGrammarDefinitionContribution, getEncodedLanguageId } from './textmate-contribution';
import { createTextmateTokenizer, TokenizerOption } from './textmate-tokenizer';
import { TextmateRegistry } from './textmate-registry';
import { MonacoThemeRegistry } from './monaco-theme-registry';
import { MonacoEditor } from '../monaco-editor';
import { EditorManager } from '@theia/editor/lib/browser';

export const OnigasmPromise = Symbol('OnigasmPromise');
export type OnigasmPromise = Promise<IOnigLib>;

@injectable()
export class MonacoTextmateService implements FrontendApplicationContribution {

    protected readonly _activatedLanguages = new Set<string>();
    get activatedLanguages(): ReadonlySet<string> {
        return this._activatedLanguages;
    }

    protected readonly onDidActivateLanguageEmitter = new Emitter<string>();
    readonly onDidActivateLanguage = this.onDidActivateLanguageEmitter.event;

    protected grammarRegistry: Registry;

    @inject(ContributionProvider) @named(LanguageGrammarDefinitionContribution)
    protected readonly grammarProviders: ContributionProvider<LanguageGrammarDefinitionContribution>;

    @inject(TextmateRegistry)
    protected readonly textmateRegistry: TextmateRegistry;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(OnigasmPromise)
    protected readonly onigasmPromise: OnigasmPromise;

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    @inject(MonacoThemeRegistry)
    protected readonly monacoThemeRegistry: MonacoThemeRegistry;

    @inject(EditorManager)
    private readonly editorManager: EditorManager;

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

        this.grammarRegistry = new Registry({
            getOnigLib: () => this.onigasmPromise,
            theme: this.monacoThemeRegistry.getTheme(this.currentEditorTheme),
            loadGrammar: async (scopeName: string) => {
                const provider = this.textmateRegistry.getProvider(scopeName);
                if (provider) {
                    const definition = await provider.getGrammarDefinition();
                    let rawGrammar: IRawGrammar;
                    if (typeof definition.content === 'string') {
                        rawGrammar = parseRawGrammar(definition.content, definition.format === 'json' ? 'grammar.json' : 'grammar.plist');
                    } else {
                        rawGrammar = definition.content as IRawGrammar;
                    }
                    return rawGrammar;
                }
                return undefined;
            },
            getInjections: (scopeName: string) => {
                const provider = this.textmateRegistry.getProvider(scopeName);
                if (provider && provider.getInjections) {
                    return provider.getInjections(scopeName);
                }
                return [];
            }
        });

        this.updateTheme();
        this.themeService.onThemeChange(() => this.updateTheme());

        for (const { id } of monaco.languages.getLanguages()) {
            monaco.languages.onLanguage(id, () => this.activateLanguage(id));
        }
        this.detectLanguages();
    }

    protected readonly toDisposeOnUpdateTheme = new DisposableCollection();

    protected updateTheme(): void {
        this.toDisposeOnUpdateTheme.dispose();

        const currentEditorTheme = this.currentEditorTheme;
        document.body.classList.add(currentEditorTheme);
        this.toDisposeOnUpdateTheme.push(Disposable.create(() => document.body.classList.remove(currentEditorTheme)));

        // first update registry to run tokenization with the proper theme
        const theme = this.monacoThemeRegistry.getTheme(currentEditorTheme);
        if (theme) {
            this.grammarRegistry.setTheme(theme);
        }

        // then trigger tokenization by setting monaco theme
        monaco.editor.setTheme(currentEditorTheme);
    }

    protected get currentEditorTheme(): string {
        return this.themeService.getCurrentTheme().editorTheme || MonacoThemeRegistry.DARK_DEFAULT_THEME;
    }

    async activateLanguage(languageId: string): Promise<void> {
        if (this._activatedLanguages.has(languageId)) {
            return;
        }
        this._activatedLanguages.add(languageId);
        try {
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
                const grammar = await this.grammarRegistry.loadGrammarWithConfiguration(scopeName, initialLanguage, configuration);
                const options = configuration.tokenizerOption ? configuration.tokenizerOption : TokenizerOption.DEFAULT;
                monaco.languages.setTokensProvider(languageId, createTextmateTokenizer(grammar, options));
            } catch (error) {
                this.logger.warn('No grammar for this language id', languageId, error);
            }
        } finally {
            this.onDidActivateLanguageEmitter.fire(languageId);
        }
    }

    detectLanguages(): void {
        for (const editor of MonacoEditor.getAll(this.editorManager)) {
            if (editor.languageAutoDetected) {
                editor.detectLanguage();
            }
        }
    }
}
