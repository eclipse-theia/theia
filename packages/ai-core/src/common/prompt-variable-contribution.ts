// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { CommandService, ILogger, nls } from '@theia/core';
import { injectable, inject } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';
import {
    AIVariable,
    AIVariableContribution,
    AIVariableService,
    AIVariableResolutionRequest,
    AIVariableContext,
    ResolvedAIVariable,
    AIVariableResolverWithVariableDependencies,
    AIVariableArg
} from './variable-service';
import { isCustomizedPromptFragment, PromptService } from './prompt-service';
import { PromptText } from './prompt-text';

export const PROMPT_VARIABLE: AIVariable = {
    id: 'prompt-provider',
    description: nls.localize('theia/ai/core/promptVariable/description', 'Resolves prompt templates via the prompt service'),
    name: 'prompt',
    args: [
        { name: 'id', description: nls.localize('theia/ai/core/promptVariable/argDescription', 'The prompt template id to resolve') }
    ]
};

@injectable()
export class PromptVariableContribution implements AIVariableContribution, AIVariableResolverWithVariableDependencies {

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(PromptService)
    protected readonly promptService: PromptService;

    @inject(ILogger)
    protected logger: ILogger;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(PROMPT_VARIABLE, this);
        service.registerArgumentPicker(PROMPT_VARIABLE, this.triggerArgumentPicker.bind(this));
        service.registerArgumentCompletionProvider(PROMPT_VARIABLE, this.provideArgumentCompletionItems.bind(this));
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): number {
        if (request.variable.name === PROMPT_VARIABLE.name) {
            return 1;
        }
        return -1;
    }

    async resolve(
        request: AIVariableResolutionRequest,
        context: AIVariableContext,
        resolveDependency?: (variable: AIVariableArg) => Promise<ResolvedAIVariable | undefined>
    ): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.name === PROMPT_VARIABLE.name) {
            const promptId = request.arg?.trim();
            if (promptId) {
                const resolvedPrompt = await this.promptService.getResolvedPromptFragmentWithoutFunctions(promptId, undefined, context, resolveDependency);
                if (resolvedPrompt) {
                    return {
                        variable: request.variable,
                        value: resolvedPrompt.text,
                        allResolvedDependencies: resolvedPrompt.variables
                    };
                }
            }
        }
        this.logger.debug(`Could not resolve prompt variable '${request.variable.name}' with arg '${request.arg}'. Returning empty string.`);
        return {
            variable: request.variable,
            value: '',
            allResolvedDependencies: []
        };
    }

    protected async triggerArgumentPicker(): Promise<string | undefined> {
        // Trigger the suggestion command to show argument completions
        this.commandService.executeCommand('editor.action.triggerSuggest');
        // Return undefined because we don't actually pick the argument here.
        // The argument is selected and inserted by the monaco editor's completion mechanism.
        return undefined;
    }

    protected async provideArgumentCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position
    ): Promise<monaco.languages.CompletionItem[] | undefined> {
        const lineContent = model.getLineContent(position.lineNumber);

        // Only provide completions once the variable argument separator is typed
        const triggerCharIndex = lineContent.lastIndexOf(PromptText.VARIABLE_SEPARATOR_CHAR, position.column - 1);
        if (triggerCharIndex === -1) {
            return undefined;
        }

        // Check if the text immediately before the trigger is the prompt variable, i.e #prompt
        const requiredVariable = `${PromptText.VARIABLE_CHAR}${PROMPT_VARIABLE.name}`;
        if (triggerCharIndex < requiredVariable.length ||
            lineContent.substring(triggerCharIndex - requiredVariable.length, triggerCharIndex) !== requiredVariable) {
            return undefined;
        }

        const range = new monaco.Range(position.lineNumber, triggerCharIndex + 2, position.lineNumber, position.column);

        const activePrompts = this.promptService.getActivePromptFragments();
        let builtinPromptCompletions: monaco.languages.CompletionItem[] | undefined = undefined;

        if (activePrompts.length > 0) {
            builtinPromptCompletions = [];
            activePrompts.forEach(prompt => (builtinPromptCompletions!.push(
                {
                    label: prompt.id,
                    kind: isCustomizedPromptFragment(prompt) ? monaco.languages.CompletionItemKind.Enum : monaco.languages.CompletionItemKind.Variable,
                    insertText: prompt.id,
                    range,
                    detail: isCustomizedPromptFragment(prompt) ?
                        nls.localize('theia/ai/core/promptVariable/completions/detail/custom', 'Customized prompt fragment') :
                        nls.localize('theia/ai/core/promptVariable/completions/detail/builtin', 'Built-in prompt fragment'),
                    sortText: `${prompt.id}`
                })));
        }

        return builtinPromptCompletions;
    }
}
