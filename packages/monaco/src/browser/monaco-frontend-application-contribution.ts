// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ColorTheme, CssStyleCollector, FrontendApplicationContribution, PreferenceSchemaProvider, QuickAccessRegistry, StylingParticipant } from '@theia/core/lib/browser';
import { MonacoSnippetSuggestProvider } from './monaco-snippet-suggest-provider';
import * as monaco from '@theia/monaco-editor-core';
import { setSnippetSuggestSupport } from '@theia/monaco-editor-core/esm/vs/editor/contrib/suggest/browser/suggest';
import { CompletionItemProvider } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import { MonacoEditorService } from './monaco-editor-service';
import { MonacoTextModelService } from './monaco-text-model-service';
import { ContextKeyService as VSCodeContextKeyService } from '@theia/monaco-editor-core/esm/vs/platform/contextkey/browser/contextKeyService';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { ICodeEditorService } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/codeEditorService';
import { ITextModelService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/resolverService';
import { IContextKeyService } from '@theia/monaco-editor-core/esm/vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from '@theia/monaco-editor-core/esm/vs/platform/contextview/browser/contextView';
import { MonacoContextMenuService } from './monaco-context-menu';
import { MonacoThemingService } from './monaco-theming-service';
import { isHighContrast } from '@theia/core/lib/common/theme';
import { editorOptionsRegistry, IEditorOption } from '@theia/monaco-editor-core/esm/vs/editor/common/config/editorOptions';
import { MAX_SAFE_INTEGER } from '@theia/core';
import { editorGeneratedPreferenceProperties } from '@theia/editor/lib/browser/editor-generated-preference-schema';

let theiaDidInitialize = false;
const originalInitialize = StandaloneServices.initialize;
StandaloneServices.initialize = overrides => {
    if (!theiaDidInitialize) {
        console.warn('Monaco was initialized before overrides were installed by Theia\'s initialization.'
            + ' Please check the lifecycle of services that use Monaco and ensure that Monaco entities are not instantiated before Theia is initialized.', new Error());
    }
    return originalInitialize(overrides);
};

@injectable()
export class MonacoFrontendApplicationContribution implements FrontendApplicationContribution, StylingParticipant {

    @inject(MonacoEditorService)
    protected readonly codeEditorService: MonacoEditorService;

    @inject(MonacoTextModelService)
    protected readonly textModelService: MonacoTextModelService;

    @inject(VSCodeContextKeyService)
    protected readonly contextKeyService: VSCodeContextKeyService;

    @inject(MonacoSnippetSuggestProvider)
    protected readonly snippetSuggestProvider: MonacoSnippetSuggestProvider;

    @inject(PreferenceSchemaProvider)
    protected readonly preferenceSchema: PreferenceSchemaProvider;

    @inject(QuickAccessRegistry)
    protected readonly quickAccessRegistry: QuickAccessRegistry;

    @inject(MonacoContextMenuService)
    protected readonly contextMenuService: MonacoContextMenuService;

    @inject(MonacoThemingService) protected readonly monacoThemingService: MonacoThemingService;

    @postConstruct()
    protected init(): void {
        this.addAdditionalPreferenceValidations();
        const { codeEditorService, textModelService, contextKeyService, contextMenuService } = this;
        theiaDidInitialize = true;
        StandaloneServices.initialize({
            [ICodeEditorService.toString()]: codeEditorService,
            [ITextModelService.toString()]: textModelService,
            [IContextKeyService.toString()]: contextKeyService,
            [IContextMenuService.toString()]: contextMenuService,
        });
        // Monaco registers certain quick access providers (e.g. QuickCommandAccess) at import time, but we want to use our own.
        this.quickAccessRegistry.clear();

        /**
         * @monaco-uplift.Should be guaranteed to work.
         * Incomparable enums prevent TypeScript from believing that public ITextModel satisfied private ITextModel
         */
        setSnippetSuggestSupport(this.snippetSuggestProvider as unknown as CompletionItemProvider);

        for (const language of monaco.languages.getLanguages()) {
            this.preferenceSchema.registerOverrideIdentifier(language.id);
        }
        const registerLanguage = monaco.languages.register.bind(monaco.languages);
        monaco.languages.register = language => {
            // first register override identifier, because monaco will immediately update already opened documents and then initialize with bad preferences.
            this.preferenceSchema.registerOverrideIdentifier(language.id);
            registerLanguage(language);
        };

        this.monacoThemingService.initialize();
    }

    initialize(): void { }

    registerThemeStyle(theme: ColorTheme, collector: CssStyleCollector): void {
        if (isHighContrast(theme.type)) {
            const focusBorder = theme.getColor('focusBorder');
            const contrastBorder = theme.getColor('contrastBorder');
            if (focusBorder) {
                // Quick input
                collector.addRule(`
                    .quick-input-list .monaco-list-row {
                        outline-offset: -1px;
                    }
                    .quick-input-list .monaco-list-row.focused {
                        outline: 1px dotted ${focusBorder};
                    }
                    .quick-input-list .monaco-list-row:hover {
                        outline: 1px dashed ${focusBorder};
                    }
                `);
                // Input box always displays an outline, even when unfocused
                collector.addRule(`
                    .monaco-editor .find-widget .monaco-inputbox {
                        outline: var(--theia-border-width) solid;
                        outline-offset: calc(-1 * var(--theia-border-width));
                        outline-color: var(--theia-focusBorder);
                    }
                `);
            }
            if (contrastBorder) {
                collector.addRule(`
                    .quick-input-widget {
                        outline: 1px solid ${contrastBorder};
                        outline-offset: -1px;
                    }
                `);
            }
        } else {
            collector.addRule(`
                .quick-input-widget {
                    box-shadow: rgb(0 0 0 / 36%) 0px 0px 8px 2px;
                }
            `);
        }
    }

    /**
     * For reasons that are unclear, while most preferences that apply in editors are validated, a few are not.
     * There is a utility in `examples/api-samples/src/browser/monaco-editor-preferences/monaco-editor-preference-extractor.ts` to help determine which are not.
     * Check `src/vs/editor/common/config/editorOptions.ts` for constructor arguments and to make sure that the preference names used to extract constructors are still accurate.
     */
    protected addAdditionalPreferenceValidations(): void {
        let editorIntConstructor: undefined | (new (...args: unknown[]) => IEditorOption<number, number>);
        let editorBoolConstructor: undefined | (new (...args: unknown[]) => IEditorOption<number, boolean>);
        let editorStringEnumConstructor: undefined | (new (...args: unknown[]) => IEditorOption<number, string>);
        for (const validator of editorOptionsRegistry) {
            /* eslint-disable @typescript-eslint/no-explicit-any,max-len */
            if (editorIntConstructor && editorBoolConstructor && editorStringEnumConstructor) { break; }
            if (validator.name === 'acceptSuggestionOnCommitCharacter') {
                editorBoolConstructor = validator.constructor as any;
            } else if (validator.name === 'acceptSuggestionOnEnter') {
                editorStringEnumConstructor = validator.constructor as any;
            } else if (validator.name === 'accessibilityPageSize') {
                editorIntConstructor = validator.constructor as any;
            }
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }
        if (editorIntConstructor && editorBoolConstructor && editorStringEnumConstructor) {
            let id = 200; // Needs to be bigger than the biggest index in the EditorOption enum.
            editorOptionsRegistry.push(
                new editorIntConstructor(id++, 'tabSize', 4, 1, MAX_SAFE_INTEGER, editorGeneratedPreferenceProperties['editor.tabSize']),
                new editorBoolConstructor(id++, 'insertSpaces', true, editorGeneratedPreferenceProperties['editor.insertSpaces']),
                new editorBoolConstructor(id++, 'detectIndentation', true, editorGeneratedPreferenceProperties['editor.detectIndentation']),
                new editorBoolConstructor(id++, 'trimAutoWhitespace', true, editorGeneratedPreferenceProperties['editor.trimAutoWhitespace']),
                new editorBoolConstructor(id++, 'largeFileOptimizations', true, editorGeneratedPreferenceProperties['editor.largeFileOptimizations']),
                new editorBoolConstructor(id++, 'wordBasedSuggestions', true, editorGeneratedPreferenceProperties['editor.wordBasedSuggestions']),
                new editorStringEnumConstructor(id++, 'wordBasedSuggestionsMode', 'matchingDocuments', editorGeneratedPreferenceProperties['editor.wordBasedSuggestionsMode'].enum, editorGeneratedPreferenceProperties['editor.wordBasedSuggestionsMode']),
                new editorBoolConstructor(id++, 'stablePeek', false, editorGeneratedPreferenceProperties['editor.stablePeek']),
                new editorIntConstructor(id++, 'maxTokenizationLineLength', 20000, 1, MAX_SAFE_INTEGER, editorGeneratedPreferenceProperties['editor.maxTokenizationLineLength']),
            );
        }
    }
}
