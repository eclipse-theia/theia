// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { ILogger, nls } from '@theia/core';
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

export const CAPABILITY_VARIABLE: AIVariable = {
    id: 'capability-provider',
    description: nls.localize('theia/ai/core/capabilityVariable/description', 'Conditionally resolves prompt fragments based on default on/off setting'),
    name: 'capability',
    args: [
        {
            name: 'fragment-id default on/off',
            description: nls.localize('theia/ai/core/capabilityVariable/argDescription', 'The prompt fragment id followed by "default on" or "default off"')
        }
    ]
};

@injectable()
export class CapabilityVariableContribution implements AIVariableContribution, AIVariableResolverWithVariableDependencies {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    @inject(ILogger)
    protected logger: ILogger;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(CAPABILITY_VARIABLE, this);
        service.registerArgumentCompletionProvider(CAPABILITY_VARIABLE, this.provideArgumentCompletionItems.bind(this));
    }

    canResolve(request: AIVariableResolutionRequest, context: AIVariableContext): number {
        if (request.variable.name === CAPABILITY_VARIABLE.name) {
            return 1;
        }
        return -1;
    }

    async resolve(
        request: AIVariableResolutionRequest,
        context: AIVariableContext,
        resolveDependency?: (variable: AIVariableArg) => Promise<ResolvedAIVariable | undefined>
    ): Promise<ResolvedAIVariable | undefined> {
        if (request.variable.name === CAPABILITY_VARIABLE.name) {
            const arg = request.arg?.trim();
            if (arg) {
                const parseResult = this.parseCapabilityArgument(arg);
                if (!parseResult) {
                    this.logger.warn(`Could not parse capability argument '${arg}'. Expected format: 'fragment-id default on' or 'fragment-id default off'.`);
                    return {
                        variable: request.variable,
                        value: '',
                        allResolvedDependencies: []
                    };
                }

                const { fragmentId, isEnabled: defaultEnabled } = parseResult;

                // Get the enabled state from context overrides, or fall back to the default from the prompt
                const isEnabled = context.capabilityOverrides?.[fragmentId] ?? defaultEnabled;

                this.logger.debug(`Capability '${fragmentId}': enabled=${isEnabled} (override=${context.capabilityOverrides?.[fragmentId]}, default=${defaultEnabled})`);

                // If capability is disabled, return empty string
                if (!isEnabled) {
                    this.logger.debug(`Capability '${fragmentId}' is disabled, returning empty string`);
                    return {
                        variable: request.variable,
                        value: '',
                        allResolvedDependencies: []
                    };
                }

                // Resolve the prompt fragment
                const fragment = this.promptService.getRawPromptFragment(fragmentId);
                if (!fragment) {
                    this.logger.warn(`Could not find prompt fragment '${fragmentId}' for capability variable.`);
                    return {
                        variable: request.variable,
                        value: '',
                        allResolvedDependencies: []
                    };
                }

                // Resolve the prompt fragment content (this handles {{variables}} within the fragment)
                const resolvedPrompt = await this.promptService.getResolvedPromptFragmentWithoutFunctions(
                    fragmentId,
                    undefined,
                    context,
                    resolveDependency
                );

                if (resolvedPrompt) {
                    this.logger.debug(`Capability '${fragmentId}' resolved to ${resolvedPrompt.text.length} chars`);
                    return {
                        variable: request.variable,
                        value: resolvedPrompt.text,
                        allResolvedDependencies: resolvedPrompt.variables
                    };
                }
            }
        }
        this.logger.warn(`Could not resolve capability variable '${request.variable.name}' with arg '${request.arg}'. Returning empty string.`);
        return {
            variable: request.variable,
            value: '',
            allResolvedDependencies: []
        };
    }

    /**
     * Parses the capability argument string.
     * Expected format: "fragment-id default on" or "fragment-id default off"
     * @param arg The argument string to parse
     * @returns Object with fragmentId and isEnabled, or undefined if parsing failed
     */
    protected parseCapabilityArgument(arg: string): { fragmentId: string; isEnabled: boolean } | undefined {
        // Match pattern: <fragment-id> default on|off
        const match = arg.match(/^(.+?)\s+default\s+(on|off)$/i);
        if (!match) {
            return undefined;
        }

        const fragmentId = match[1].trim();
        const defaultValue = match[2].toLowerCase();

        return {
            fragmentId,
            isEnabled: defaultValue === 'on'
        };
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

        // Check if the text immediately before the trigger is the capability variable
        const requiredVariable = `${PromptText.VARIABLE_CHAR}${CAPABILITY_VARIABLE.name}`;
        if (triggerCharIndex < requiredVariable.length ||
            lineContent.substring(triggerCharIndex - requiredVariable.length, triggerCharIndex) !== requiredVariable) {
            return undefined;
        }

        const range = new monaco.Range(position.lineNumber, triggerCharIndex + 2, position.lineNumber, position.column);

        const activePrompts = this.promptService.getActivePromptFragments();
        const completions: monaco.languages.CompletionItem[] = [];

        if (activePrompts.length > 0) {
            activePrompts.forEach(prompt => {
                // Add completion for "default on"
                completions.push({
                    label: `${prompt.id} default on`,
                    kind: isCustomizedPromptFragment(prompt) ? monaco.languages.CompletionItemKind.Enum : monaco.languages.CompletionItemKind.Variable,
                    insertText: `${prompt.id} default on`,
                    range,
                    detail: nls.localize('theia/ai/core/capabilityVariable/completions/detail/on', 'Capability enabled by default'),
                    sortText: `${prompt.id}0`
                });

                // Add completion for "default off"
                completions.push({
                    label: `${prompt.id} default off`,
                    kind: isCustomizedPromptFragment(prompt) ? monaco.languages.CompletionItemKind.Enum : monaco.languages.CompletionItemKind.Variable,
                    insertText: `${prompt.id} default off`,
                    range,
                    detail: nls.localize('theia/ai/core/capabilityVariable/completions/detail/off', 'Capability disabled by default'),
                    sortText: `${prompt.id}1`
                });
            });
        }

        return completions;
    }
}
