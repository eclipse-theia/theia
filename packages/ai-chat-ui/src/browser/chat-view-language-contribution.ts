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
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import * as monaco from '@theia/monaco-editor-core';
import { ContributionProvider, MaybePromise } from '@theia/core';
import { ProviderResult } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import { ChatAgentService } from '@theia/ai-chat';
import { AIVariableService } from '@theia/ai-core/lib/common';
import { ToolProvider } from '@theia/ai-core/lib/common/tool-invocation-registry';

export const CHAT_VIEW_LANGUAGE_ID = 'theia-ai-chat-view-language';
export const CHAT_VIEW_LANGUAGE_EXTENSION = 'aichatviewlanguage';

@injectable()
export class ChatViewLanguageContribution implements FrontendApplicationContribution {

    @inject(ChatAgentService)
    protected readonly agentService: ChatAgentService;

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    @inject(ContributionProvider)
    @named(ToolProvider)
    private providers: ContributionProvider<ToolProvider>;

    onStart(_app: FrontendApplication): MaybePromise<void> {
        console.log('ChatViewLanguageContribution started');
        monaco.languages.register({ id: CHAT_VIEW_LANGUAGE_ID, extensions: [CHAT_VIEW_LANGUAGE_EXTENSION] });

        monaco.languages.registerCompletionItemProvider(CHAT_VIEW_LANGUAGE_ID, {
            triggerCharacters: ['@'],
            provideCompletionItems: (model, position, _context, _token): ProviderResult<monaco.languages.CompletionList> => this.provideAgentCompletions(model, position),
        });
        monaco.languages.registerCompletionItemProvider(CHAT_VIEW_LANGUAGE_ID, {
            triggerCharacters: ['#'],
            provideCompletionItems: (model, position, _context, _token): ProviderResult<monaco.languages.CompletionList> => this.provideVariableCompletions(model, position),
        });
        monaco.languages.registerCompletionItemProvider(CHAT_VIEW_LANGUAGE_ID, {
            triggerCharacters: ['~'],
            provideCompletionItems: (model, position, _context, _token): ProviderResult<monaco.languages.CompletionList> => this.provideToolCompletions(model, position),
        });
    }

    getCompletionRange(model: monaco.editor.ITextModel, position: monaco.Position, triggerCharacter: string): monaco.Range | undefined {
        // Check if the character before the current position is the trigger character
        const lineContent = model.getLineContent(position.lineNumber);
        const characterBefore = lineContent[position.column - 2]; // Get the character before the current position

        if (characterBefore !== triggerCharacter) {
            // Do not return agent suggestions if the user didn't just type the trigger character
            return undefined;
        }

        // Calculate the range from the position of the '@' character
        const wordInfo = model.getWordUntilPosition(position);
        return new monaco.Range(
            position.lineNumber,
            wordInfo.startColumn,
            position.lineNumber,
            position.column
        );
    }

    private getSuggestions<T>(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        triggerChar: string,
        items: T[],
        kind: monaco.languages.CompletionItemKind,
        getId: (item: T) => string,
        getName: (item: T) => string,
        getDescription: (item: T) => string
    ): ProviderResult<monaco.languages.CompletionList> {
        const completionRange = this.getCompletionRange(model, position, triggerChar);
        if (completionRange === undefined) {
            return { suggestions: [] };
        }
        const suggestions = items.map(item => ({
            insertText: getId(item),
            kind: kind,
            label: getName(item),
            range: completionRange,
            detail: getDescription(item),
        }));
        return { suggestions };
    }

    provideAgentCompletions(model: monaco.editor.ITextModel, position: monaco.Position): ProviderResult<monaco.languages.CompletionList> {
        return this.getSuggestions(
            model,
            position,
            '@',
            this.agentService.getAgents(),
            monaco.languages.CompletionItemKind.Value,
            agent => agent.id,
            agent => agent.name,
            agent => agent.description
        );
    }

    provideVariableCompletions(model: monaco.editor.ITextModel, position: monaco.Position): ProviderResult<monaco.languages.CompletionList> {
        return this.getSuggestions(
            model,
            position,
            '#',
            this.variableService.getVariables(),
            monaco.languages.CompletionItemKind.Variable,
            variable => variable.name,
            variable => variable.name,
            variable => variable.description
        );
    }

    provideToolCompletions(model: monaco.editor.ITextModel, position: monaco.Position): ProviderResult<monaco.languages.CompletionList> {
        return this.getSuggestions(
            model,
            position,
            '~',
            this.providers.getContributions().map(provider => provider.getTool()),
            monaco.languages.CompletionItemKind.Function,
            tool => tool.id,
            tool => tool.name,
            tool => tool.description ?? ''
        );
    }
}
