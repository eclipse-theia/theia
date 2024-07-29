// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { GrammarDefinition, GrammarDefinitionProvider, LanguageGrammarDefinitionContribution, TextmateRegistry } from '@theia/monaco/lib/browser/textmate';
import * as monaco from '@theia/monaco-editor-core';
import { Command, CommandContribution, CommandRegistry } from '@theia/core';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';

import { codicon, Widget } from '@theia/core/lib/browser';
import { EditorWidget } from '@theia/editor/lib/browser';
import { PromptCustomizationService, PromptService } from '../common';

const PROMPT_TEMPLATE_LANGUAGE_ID = 'theia-ai-prompt-template';
const PROMPT_TEMPLATE_TEXTMATE_SCOPE = 'source.prompttemplate';

export const DISCARD_PROMPT_TEMPLATE_CUSTOMIZATIONS: Command = {
    id: 'theia-ai-prompt-template:discard',
    iconClass: codicon('discard'),
    category: 'Theia AI Prompt Templates'
};

// TODO JF remove test class
export const TEST_COMMAND: Command = {
    id: 'theia-ai-prompt-template:test-command',
    label: 'Test Prompt Service',
    iconClass: codicon('beaker'),
    category: 'Theia AI Prompt Templates',
};

@injectable()
export class PromptTemplateContribution implements LanguageGrammarDefinitionContribution, CommandContribution, TabBarToolbarContribution {

    @inject(PromptService)
    private readonly promptService: PromptService;

    @inject(PromptCustomizationService)
    private readonly promptCustomizationService: PromptCustomizationService;


    readonly config: monaco.languages.LanguageConfiguration =
        {
            'brackets': [
                ['${', '}'],
            ],
            'autoClosingPairs': [
                { 'open': '${', 'close': '}' },
            ],
            'surroundingPairs': [
                { 'open': '${', 'close': '}' },
            ]
        };

    registerTextmateLanguage(registry: TextmateRegistry): void {
        monaco.languages.register({
            id: PROMPT_TEMPLATE_LANGUAGE_ID,
            'aliases': [
                'Theia AI Prompt Templates'
            ],
            'extensions': [
                '.prompttemplate',
            ],
            'filenames': []
        });

        monaco.languages.setLanguageConfiguration(PROMPT_TEMPLATE_LANGUAGE_ID, this.config);

        const textmateGrammar = require('../../data/prompttemplate.tmLanguage.json');
        const grammarDefinitionProvider: GrammarDefinitionProvider = {
            getGrammarDefinition: function (): Promise<GrammarDefinition> {
                return Promise.resolve({
                    format: 'json',
                    content: textmateGrammar
                });
            }
        };
        registry.registerTextmateGrammarScope(PROMPT_TEMPLATE_TEXTMATE_SCOPE, grammarDefinitionProvider);

        registry.mapLanguageIdToTextmateGrammar(PROMPT_TEMPLATE_LANGUAGE_ID, PROMPT_TEMPLATE_TEXTMATE_SCOPE);
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(DISCARD_PROMPT_TEMPLATE_CUSTOMIZATIONS, {
            isVisible: (widget: Widget) => this.isPromptTemplateWidget(widget),
            isEnabled: (widget: EditorWidget) => this.canDiscard(widget),
            execute: (widget: EditorWidget) => this.discard(widget)
        });

        commands.registerCommand(TEST_COMMAND, {
            execute: () => this.testPromptService()
        });
    }

    protected isPromptTemplateWidget(widget: Widget): boolean {
        if (widget instanceof EditorWidget) {
            return PROMPT_TEMPLATE_LANGUAGE_ID === widget.editor.document.languageId;
        }
        return false;
    }

    protected canDiscard(widget: EditorWidget): boolean {
        // TODO JF
        return false;
    }

    protected discard(widget: EditorWidget): void {
        // TODO JF
    }

    private testPromptService(): void {
        console.log(`Test customizationservice: ${this.promptCustomizationService.isPromptTemplateCustomized('foo')}`);
        console.log(`Prompts:\n${JSON.stringify(this.promptService.getAllPrompts())}`);
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: DISCARD_PROMPT_TEMPLATE_CUSTOMIZATIONS.id,
            command: DISCARD_PROMPT_TEMPLATE_CUSTOMIZATIONS.id,
            tooltip: 'Discard Customizations'
        });
    }
}
