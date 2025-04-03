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
import { ChatAgentService } from '@theia/ai-chat';
import { AIVariableService } from '@theia/ai-core/lib/common';
import { PromptText } from '@theia/ai-core/lib/common/prompt-text';
import { ToolInvocationRegistry } from '@theia/ai-core/lib/common/tool-invocation-registry';
import { MaybePromise, nls } from '@theia/core';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';
import { ProviderResult } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import { AIChatFrontendContribution, VARIABLE_ADD_CONTEXT_COMMAND } from '@theia/ai-chat/lib/browser/ai-chat-frontend-contribution';

export const CHAT_VIEW_LANGUAGE_ID = 'theia-ai-chat-view-language';
export const SETTINGS_LANGUAGE_ID = 'theia-ai-chat-settings-language';
export const CHAT_VIEW_LANGUAGE_EXTENSION = 'aichatviewlanguage';

const VARIABLE_RESOLUTION_CONTEXT = { context: 'chat-input-autocomplete' };
const VARIABLE_ARGUMENT_PICKER_COMMAND = 'trigger-variable-argument-picker';

interface CompletionSource<T> {
    triggerCharacter: string;
    getItems: () => T[];
    kind: monaco.languages.CompletionItemKind;
    getId: (item: T) => string;
    getName: (item: T) => string;
    getDescription: (item: T) => string;
    command?: monaco.languages.Command;
}

@injectable()
export class ChatViewLanguageContribution implements FrontendApplicationContribution {

    @inject(ChatAgentService)
    protected readonly agentService: ChatAgentService;

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    @inject(ToolInvocationRegistry)
    protected readonly toolInvocationRegistry: ToolInvocationRegistry;

    @inject(AIChatFrontendContribution)
    protected readonly chatFrontendContribution: AIChatFrontendContribution;

    onStart(_app: FrontendApplication): MaybePromise<void> {
        monaco.languages.register({ id: CHAT_VIEW_LANGUAGE_ID, extensions: [CHAT_VIEW_LANGUAGE_EXTENSION] });
        monaco.languages.register({ id: SETTINGS_LANGUAGE_ID, extensions: ['json'], filenames: ['editor'] });

        this.registerCompletionProviders();

        monaco.editor.registerCommand(VARIABLE_ARGUMENT_PICKER_COMMAND, this.triggerVariableArgumentPicker.bind(this));
    }

    protected registerCompletionProviders(): void {
        this.registerStandardCompletionProvider({
            triggerCharacter: PromptText.AGENT_CHAR,
            getItems: () => this.agentService.getAgents(),
            kind: monaco.languages.CompletionItemKind.Value,
            getId: agent => `${agent.id} `,
            getName: agent => agent.name,
            getDescription: agent => agent.description
        });

        this.registerStandardCompletionProvider({
            triggerCharacter: PromptText.VARIABLE_CHAR,
            getItems: () => this.variableService.getVariables(),
            kind: monaco.languages.CompletionItemKind.Variable,
            getId: variable => variable.args?.some(arg => !arg.isOptional) ? variable.name + PromptText.VARIABLE_SEPARATOR_CHAR : `${variable.name} `,
            getName: variable => variable.name,
            getDescription: variable => variable.description,
            command: {
                title: nls.localize('theia/ai/chat-ui/selectVariableArguments', 'Select variable arguments'),
                id: VARIABLE_ARGUMENT_PICKER_COMMAND,
            }
        });

        this.registerStandardCompletionProvider({
            triggerCharacter: PromptText.FUNCTION_CHAR,
            getItems: () => this.toolInvocationRegistry.getAllFunctions(),
            kind: monaco.languages.CompletionItemKind.Function,
            getId: tool => `${tool.id} `,
            getName: tool => tool.name,
            getDescription: tool => tool.description ?? ''
        });

        // Register the variable argument completion provider (special case)
        monaco.languages.registerCompletionItemProvider(CHAT_VIEW_LANGUAGE_ID, {
            triggerCharacters: [PromptText.VARIABLE_CHAR, PromptText.VARIABLE_SEPARATOR_CHAR],
            provideCompletionItems: (model, position, _context, _token): ProviderResult<monaco.languages.CompletionList> =>
                this.provideVariableWithArgCompletions(model, position),
        });
    }

    protected registerStandardCompletionProvider<T>(source: CompletionSource<T>): void {
        monaco.languages.registerCompletionItemProvider(CHAT_VIEW_LANGUAGE_ID, {
            triggerCharacters: [source.triggerCharacter],
            provideCompletionItems: (model, position, _context, _token): ProviderResult<monaco.languages.CompletionList> =>
                this.provideCompletions(model, position, source),
        });
    }

    getCompletionRange(model: monaco.editor.ITextModel, position: monaco.Position, triggerCharacter: string): monaco.Range | undefined {
        const wordInfo = model.getWordUntilPosition(position);
        const lineContent = model.getLineContent(position.lineNumber);
        // one to the left, and -1 for 0-based index
        const characterBeforeCurrentWord = lineContent[wordInfo.startColumn - 1 - 1];

        if (characterBeforeCurrentWord !== triggerCharacter) {
            return undefined;
        }

        // we are not at the beginning of the line
        if (wordInfo.startColumn > 2) {
            const charBeforeTrigger = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: wordInfo.startColumn - 2,
                endLineNumber: position.lineNumber,
                endColumn: wordInfo.startColumn - 1
            });
            // If the character before the trigger is not whitespace, don't provide completions
            if (!/\s/.test(charBeforeTrigger)) {
                return undefined;
            }
        }

        return new monaco.Range(
            position.lineNumber,
            wordInfo.startColumn,
            position.lineNumber,
            position.column
        );
    }

    protected provideCompletions<T>(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        source: CompletionSource<T>
    ): ProviderResult<monaco.languages.CompletionList> {
        const completionRange = this.getCompletionRange(model, position, source.triggerCharacter);
        if (completionRange === undefined) {
            return { suggestions: [] };
        }

        const items = source.getItems();
        const suggestions = items.map(item => ({
            insertText: source.getId(item),
            kind: source.kind,
            label: source.getName(item),
            range: completionRange,
            detail: source.getDescription(item),
            command: source.command
        }));

        return { suggestions };
    }

    async provideVariableWithArgCompletions(model: monaco.editor.ITextModel, position: monaco.Position): Promise<monaco.languages.CompletionList> {
        // Get the text of the current line up to the cursor position
        const textUntilPosition = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
        });

        // Regex that captures the variable name in contexts like "#varname" or "#var-name:args"
        // Matches only when # is at the beginning of the string or after whitespace
        const variableRegex = /(?:^|\s)#([\w-]*)/;
        const match = textUntilPosition.match(variableRegex);

        if (!match) {
            return { suggestions: [] };
        }

        const currentVariableName = match[1];
        const hasColonSeparator = textUntilPosition.includes(`${currentVariableName}:`);

        const variables = this.variableService.getVariables();
        const suggestions: monaco.languages.CompletionItem[] = [];

        for (const variable of variables) {
            // If we have a variable:arg pattern, only process the matching variable
            if (hasColonSeparator && variable.name !== currentVariableName) {
                continue;
            }

            const provider = await this.variableService.getArgumentCompletionProvider(variable.name);
            if (provider) {
                const items = await provider(model, position);
                if (items) {
                    suggestions.push(...items.map(item => ({
                        command: {
                            title: VARIABLE_ADD_CONTEXT_COMMAND.label!,
                            id: VARIABLE_ADD_CONTEXT_COMMAND.id,
                            arguments: [variable.name, item.insertText]
                        },
                        ...item,
                    })));
                }
            }
        }

        return { suggestions };
    }

    protected async triggerVariableArgumentPicker(): Promise<void> {
        const inputEditor = monaco.editor.getEditors().find(editor => editor.hasTextFocus());
        if (!inputEditor) {
            return;
        }

        const model = inputEditor.getModel();
        const position = inputEditor.getPosition();
        if (!model || !position) {
            return;
        }

        // // Get the word at cursor
        const wordInfo = model.getWordUntilPosition(position);

        // account for the variable separator character if present
        let endOfWordPosition = position.column;
        if (wordInfo.word === '' && this.getCharacterBeforePosition(model, position) === PromptText.VARIABLE_SEPARATOR_CHAR) {
            endOfWordPosition = position.column - 1;
        } else {
            return;
        }

        const variableName = model.getWordAtPosition({ ...position, column: endOfWordPosition })?.word;
        if (!variableName) {
            return;
        }

        const provider = await this.variableService.getArgumentPicker(variableName, VARIABLE_RESOLUTION_CONTEXT);
        if (!provider) {
            return;
        }

        const arg = await provider(VARIABLE_RESOLUTION_CONTEXT);
        if (!arg) {
            return;
        }

        inputEditor.executeEdits('variable-argument-picker', [{
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: arg
        }]);

        await this.chatFrontendContribution.addContextVariable(variableName, arg);
    }

    protected getCharacterBeforePosition(model: monaco.editor.ITextModel, position: monaco.Position): string {
        return model.getLineContent(position.lineNumber)[position.column - 1 - 1];
    }
}
