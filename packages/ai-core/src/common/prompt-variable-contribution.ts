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
            const arg = request.arg?.trim();
            if (arg) {
                // Check if this is a command-style reference (contains | separator)
                const pipeIndex = arg.indexOf('|');
                const promptIdOrCommandName = pipeIndex >= 0 ? arg.substring(0, pipeIndex) : arg;
                const commandArgs = pipeIndex >= 0 ? arg.substring(pipeIndex + 1) : '';

                // Determine the actual fragment ID
                // If this is a command invocation (has args), try to find by command name first
                let fragment = commandArgs
                    ? this.promptService.getPromptFragmentByCommandName(promptIdOrCommandName)
                    : undefined;

                // Fall back to looking up by fragment ID if not found by command name
                if (!fragment) {
                    fragment = this.promptService.getRawPromptFragment(promptIdOrCommandName);
                }

                // If we still don't have a fragment, we can't resolve
                if (!fragment) {
                    this.logger.debug(`Could not find prompt fragment or command '${promptIdOrCommandName}'`);
                    return {
                        variable: request.variable,
                        value: '',
                        allResolvedDependencies: []
                    };
                }

                const fragmentId = fragment.id;

                // Resolve the prompt fragment normally (this handles {{variables}} and ~{functions})
                const resolvedPrompt = await this.promptService.getResolvedPromptFragmentWithoutFunctions(
                    fragmentId,
                    undefined,
                    context,
                    resolveDependency
                );

                if (resolvedPrompt) {
                    // If command args were provided, substitute them in the resolved text
                    // This happens AFTER variable/function resolution, so $ARGUMENTS can be part of the template
                    // alongside {{variables}} which get resolved first
                    const isCommand = fragment?.isCommand === true;
                    const finalText = isCommand && commandArgs
                        ? this.substituteCommandArguments(resolvedPrompt.text, promptIdOrCommandName, commandArgs)
                        : resolvedPrompt.text;

                    return {
                        variable: request.variable,
                        value: finalText,
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

    private substituteCommandArguments(template: string, commandName: string, commandArgs: string): string {
        // Parse arguments (respecting quotes)
        const args = this.parseCommandArguments(commandArgs);

        // Substitute $ARGUMENTS with full arg string
        let result = template.replace(/\$ARGUMENTS/g, commandArgs);

        // Substitute $0 with command name
        result = result.replace(/\$0/g, commandName);

        // Substitute numbered arguments in reverse order to avoid collision
        // (e.g., $10 before $1 to prevent $1 from matching the "1" in "$10")
        for (let i = args.length; i > 0; i--) {
            const regex = new RegExp(`\\$${i}\\b`, 'g');
            result = result.replace(regex, args[i - 1]);
        }

        return result;
    }

    private parseCommandArguments(commandArgs: string): string[] {
        const args: string[] = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';

        for (let i = 0; i < commandArgs.length; i++) {
            const char = commandArgs[i];

            // Handle escape sequences within quotes
            if (char === '\\' && i + 1 < commandArgs.length && inQuotes) {
                const nextChar = commandArgs[i + 1];
                if (nextChar === '"' || nextChar === "'" || nextChar === '\\') {
                    current += nextChar;
                    i++; // Skip the next character
                    continue;
                }
            }

            if ((char === '"' || char === "'") && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
            } else if (char === quoteChar && inQuotes) {
                inQuotes = false;
                quoteChar = '';
            } else if (char === ' ' && !inQuotes) {
                if (current.trim()) {
                    args.push(current.trim());
                    current = '';
                }
            } else {
                current += char;
            }
        }

        if (current.trim()) {
            args.push(current.trim());
        }

        return args;
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
