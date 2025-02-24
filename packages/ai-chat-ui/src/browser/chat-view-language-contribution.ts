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
import { AIContextVariable, AIVariableService } from '@theia/ai-core/lib/common';
import { PromptText } from '@theia/ai-core/lib/common/prompt-text';
import { ToolInvocationRegistry } from '@theia/ai-core/lib/common/tool-invocation-registry';
import { MaybePromise, nls } from '@theia/core';
import { ApplicationShell, FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';
import { ProviderResult } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import { ChatViewWidget } from './chat-view-widget';

export const CHAT_VIEW_LANGUAGE_ID = 'theia-ai-chat-view-language';
export const CHAT_VIEW_LANGUAGE_EXTENSION = 'aichatviewlanguage';

const VARIABLE_RESOLUTION_CONTEXT = { context: 'chat-input-autocomplete' };
const VARIABLE_ARGUMENT_PICKER_COMMAND = 'trigger-variable-argument-picker';
const VARIABLE_ADD_CONTEXT_COMMAND = 'add-context-variable';

@injectable()
export class ChatViewLanguageContribution implements FrontendApplicationContribution {

    @inject(ChatAgentService)
    protected readonly agentService: ChatAgentService;

    @inject(AIVariableService)
    protected readonly variableService: AIVariableService;

    @inject(ToolInvocationRegistry)
    protected readonly toolInvocationRegistry: ToolInvocationRegistry;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    onStart(_app: FrontendApplication): MaybePromise<void> {
        monaco.languages.register({ id: CHAT_VIEW_LANGUAGE_ID, extensions: [CHAT_VIEW_LANGUAGE_EXTENSION] });

        monaco.languages.registerCompletionItemProvider(CHAT_VIEW_LANGUAGE_ID, {
            triggerCharacters: [PromptText.AGENT_CHAR],
            provideCompletionItems: (model, position, _context, _token): ProviderResult<monaco.languages.CompletionList> => this.provideAgentCompletions(model, position),
        });
        monaco.languages.registerCompletionItemProvider(CHAT_VIEW_LANGUAGE_ID, {
            triggerCharacters: [PromptText.VARIABLE_CHAR],
            provideCompletionItems: (model, position, _context, _token): ProviderResult<monaco.languages.CompletionList> => this.provideVariableCompletions(model, position),
        });
        monaco.languages.registerCompletionItemProvider(CHAT_VIEW_LANGUAGE_ID, {
            triggerCharacters: [PromptText.VARIABLE_CHAR, PromptText.VARIABLE_SEPARATOR_CHAR],
            provideCompletionItems: (model, position, _context, _token): ProviderResult<monaco.languages.CompletionList> => this.provideVariableWithArgCompletions(model, position),
        });
        monaco.languages.registerCompletionItemProvider(CHAT_VIEW_LANGUAGE_ID, {
            triggerCharacters: [PromptText.FUNCTION_CHAR],
            provideCompletionItems: (model, position, _context, _token): ProviderResult<monaco.languages.CompletionList> => this.provideToolCompletions(model, position),
        });

        monaco.editor.registerCommand(VARIABLE_ARGUMENT_PICKER_COMMAND, this.triggerVariableArgumentPicker.bind(this));
        monaco.editor.registerCommand(VARIABLE_ADD_CONTEXT_COMMAND, (_, ...args) => args.length > 1 ? this.addContextVariable(args[0], args[1]) : undefined);
    }

    getCompletionRange(model: monaco.editor.ITextModel, position: monaco.Position, triggerCharacter: string): monaco.Range | undefined {
        const wordInfo = model.getWordUntilPosition(position);
        const lineContent = model.getLineContent(position.lineNumber);
        // one to the left, and -1 for 0-based index
        const characterBeforeCurrentWord = lineContent[wordInfo.startColumn - 1 - 1];
        // return suggestions only if the word is directly preceded by the trigger character
        if (characterBeforeCurrentWord !== triggerCharacter) {
            return undefined;
        }

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
        getDescription: (item: T) => string,
        command?: monaco.languages.Command
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
            command
        }));
        return { suggestions };
    }

    provideAgentCompletions(model: monaco.editor.ITextModel, position: monaco.Position): ProviderResult<monaco.languages.CompletionList> {
        return this.getSuggestions(
            model,
            position,
            PromptText.AGENT_CHAR,
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
            PromptText.VARIABLE_CHAR,
            this.variableService.getVariables(),
            monaco.languages.CompletionItemKind.Variable,
            variable => variable.args?.some(arg => !arg.isOptional) ? variable.name + PromptText.VARIABLE_SEPARATOR_CHAR : variable.name,
            variable => variable.name,
            variable => variable.description,
            {
                title: nls.localize('theia/ai/chat-ui/selectVariableArguments', 'Select variable arguments'),
                id: VARIABLE_ARGUMENT_PICKER_COMMAND,
            }
        );
    }

    async provideVariableWithArgCompletions(model: monaco.editor.ITextModel, position: monaco.Position): Promise<monaco.languages.CompletionList> {
        const variables = this.variableService.getVariables();
        const suggestions: monaco.languages.CompletionItem[] = [];
        for (const variable of variables) {
            const provider = await this.variableService.getArgumentCompletionProvider(variable.name);
            if (provider) {
                const items = await provider(model, position);
                if (items) {
                    suggestions.push(...items.map(item => ({
                        ...item,
                        // trigger command to check if we should add a context variable
                        command: {
                            title: nls.localize('theia/ai/chat-ui/addContextVariable', 'Add context variable'),
                            id: VARIABLE_ADD_CONTEXT_COMMAND,
                            arguments: [variable.name, item.insertText]
                        }
                    })));
                }
            }
        }
        return { suggestions };
    }

    provideToolCompletions(model: monaco.editor.ITextModel, position: monaco.Position): ProviderResult<monaco.languages.CompletionList> {
        return this.getSuggestions(
            model,
            position,
            PromptText.FUNCTION_CHAR,
            this.toolInvocationRegistry.getAllFunctions(),
            monaco.languages.CompletionItemKind.Function,
            tool => tool.id,
            tool => tool.name,
            tool => tool.description ?? ''
        );
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

        // account for the variable separator character if present
        let endOfWordPosition = position.column;
        let insertTextPrefix = PromptText.VARIABLE_SEPARATOR_CHAR;
        if (this.getCharacterBeforePosition(model, position) === PromptText.VARIABLE_SEPARATOR_CHAR) {
            endOfWordPosition = position.column - 1;
            insertTextPrefix = '';
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
            text: insertTextPrefix + arg
        }]);
        await this.addContextVariable(variableName, arg);
    }

    protected getCharacterBeforePosition(model: monaco.editor.ITextModel, position: monaco.Position): string {
        // one to the left, and -1 for 0-based index
        return model.getLineContent(position.lineNumber)[position.column - 1 - 1];
    }

    protected async addContextVariable(variableName: string, arg: string | undefined): Promise<void> {
        const variable = this.variableService.getVariable(variableName);
        if (!variable || !AIContextVariable.is(variable)) {
            return;
        }
        const widget = this.shell.getWidgetById(ChatViewWidget.ID);
        if (widget instanceof ChatViewWidget) {
            widget.addContext({ variable, arg });
        }
    }
}
