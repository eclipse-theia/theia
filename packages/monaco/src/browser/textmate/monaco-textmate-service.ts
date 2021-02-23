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

import { injectable, inject, named } from '@theia/core/shared/inversify';
import { Registry, IOnigLib, IRawGrammar, parseRawGrammar } from 'vscode-textmate';
import { ILogger, ContributionProvider, DisposableCollection, Disposable } from '@theia/core';
import { FrontendApplicationContribution, isBasicWasmSupported } from '@theia/core/lib/browser';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { LanguageGrammarDefinitionContribution, getEncodedLanguageId } from './textmate-contribution';
import { createTextmateTokenizer, TokenizerOption } from './textmate-tokenizer';
import { TextmateRegistry } from './textmate-registry';
import { MonacoThemeRegistry } from './monaco-theme-registry';
import { EditorPreferences } from '@theia/editor/lib/browser/editor-preferences';

export const OnigasmPromise = Symbol('OnigasmPromise');
export type OnigasmPromise = Promise<IOnigLib>;

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

    @inject(OnigasmPromise)
    protected readonly onigasmPromise: OnigasmPromise;

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    @inject(MonacoThemeRegistry)
    protected readonly monacoThemeRegistry: MonacoThemeRegistry;

    @inject(EditorPreferences)
    protected readonly preferences: EditorPreferences;

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
            theme: this.monacoThemeRegistry.getThemeData(this.currentEditorTheme),
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

        this.tokenizerOption.lineLimit = this.preferences['editor.maxTokenizationLineLength'];
        this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'editor.maxTokenizationLineLength') {
                this.tokenizerOption.lineLimit = e.newValue;
            }
        });

        this.updateTheme();
        this.themeService.onThemeChange(() => this.updateTheme());

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

        await this.onigasmPromise;
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
            const support = monaco.modes.TokenizationRegistry.get(languageId);
            const themeService = monaco.services.StaticServices.standaloneThemeService.get();
            const languageIdentifier = monaco.services.StaticServices.modeService.get().getLanguageIdentifier(languageId);
            const adapter = new monaco.services.TokenizationSupport2Adapter(themeService, languageIdentifier!, tokenizer);
            support!.tokenize = adapter.tokenize.bind(adapter);
        } catch (error) {
            this.logger.warn('No grammar for this language id', languageId, error);
        }
    }

    protected waitForLanguage(language: string, cb: () => {}): Disposable {
        const modeService = monaco.services.StaticServices.modeService.get();
        for (const modeId of Object.keys(modeService['_instantiatedModes'])) {
            const mode = modeService['_instantiatedModes'][modeId];
            if (mode.getId() === language) {
                cb();
                return Disposable.NULL;
            }
        }
        return monaco.languages.onLanguage(language, cb);
    }

}
