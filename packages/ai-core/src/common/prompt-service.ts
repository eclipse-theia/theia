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

import { URI, Event } from '@theia/core';
import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { AIVariableArg, AIVariableContext, AIVariableService, createAIResolveVariableCache, ResolvedAIVariable } from './variable-service';
import { ToolInvocationRegistry } from './tool-invocation-registry';
import { toolRequestToPromptText } from './language-model-util';
import { ToolRequest } from './language-model';
import { matchFunctionsRegEx, matchVariablesRegEx } from './prompt-service-util';
import { AISettingsService } from './settings-service';

export interface PromptTemplate {
    id: string;
    template: string;
    /**
     * (Optional) The ID of the main template for which this template is a variant.
     * If present, this indicates that the current template represents an alternative version of the specified main template.
     */
    variantOf?: string;
}

export interface PromptMap { [id: string]: PromptTemplate }

export interface ResolvedPromptTemplate {
    id: string;
    /** The resolved prompt text with variables and function requests being replaced. */
    text: string;
    /** All functions referenced in the prompt template. */
    functionDescriptions?: Map<string, ToolRequest>;
    /** All variables resolved in the prompt template */
    variables?: ResolvedAIVariable[];
}

export const PromptService = Symbol('PromptService');
export interface PromptService {
    /**
     * Retrieve the raw {@link PromptTemplate} object (unresolved variables, functions and including comments).
     * @param id the id of the {@link PromptTemplate}
     */
    getRawPrompt(id: string): PromptTemplate | undefined;
    /**
     * Retrieve the unresolved {@link PromptTemplate} object (unresolved variables, functions, excluding comments)
     * @param id the id of the {@link PromptTemplate}
     */
    getUnresolvedPrompt(id: string): PromptTemplate | undefined;
    /**
     * Retrieve the default raw {@link PromptTemplate} object.
     * @param id the id of the {@link PromptTemplate}
     */
    getDefaultRawPrompt(id: string): PromptTemplate | undefined;
    /**
     * Allows to directly replace placeholders in the prompt. The supported format is 'Hi {{name}}!'.
     * The placeholder is then searched inside the args object and replaced.
     * Function references are also supported via format '~{functionId}'.
     *
     * All placeholders are replaced before function references are resolved.
     * This allows to resolve function references contained in placeholders.
     *
     * @param id the id of the prompt
     * @param args the object with placeholders, mapping the placeholder key to the value
     */
    getPrompt(id: string, args?: { [key: string]: unknown }, context?: AIVariableContext): Promise<ResolvedPromptTemplate | undefined>;

    /**
     * Allows to directly replace placeholders in the prompt. The supported format is 'Hi {{name}}!'.
     * The placeholder is then searched inside the args object and replaced.
     *
     * In contrast to {@link getPrompt}, this method does not resolve function references but leaves them as is.
     * This allows resolving them later as part of the prompt or chat message containing the fragment.
     *
     * @param id the id of the prompt
     * @param args the object with placeholders, mapping the placeholder key to the value
     * @param context the {@link AIVariableContext} to use during variable resolvement
     * @param resolveVariable the variable resolving method. Fall back to using the {@link AIVariableService} if not given.
     */
    getPromptFragment(
        id: string,
        args?: { [key: string]: unknown },
        context?: AIVariableContext,
        resolveVariable?: (variable: AIVariableArg) => Promise<ResolvedAIVariable | undefined>
    ): Promise<Omit<ResolvedPromptTemplate, 'functionDescriptions'> | undefined>;

    /**
     * Adds a {@link PromptTemplate} to the list of prompts.
     * @param promptTemplate the prompt template to store
     */
    storePromptTemplate(promptTemplate: PromptTemplate): void;
    /**
     * Removes a prompt from the list of prompts.
     * @param id the id of the prompt
     */
    removePrompt(id: string): void;
    /**
     * Return all known prompts as a {@link PromptMap map}.
     */
    getAllPrompts(): PromptMap;
    /**
     * Retrieve all variant IDs of a given {@link PromptTemplate}.
     * @param id the id of the main {@link PromptTemplate}
     * @returns an array of string IDs representing the variants of the given template
     */
    getVariantIds(id: string): string[];
    /**
     * Retrieve the currently selected variant ID for a given main prompt ID.
     * If a variant is selected for the main prompt, it will be returned.
     * Otherwise, the main prompt ID will be returned.
     * @param id the id of the main prompt
     * @returns the variant ID if one is selected, or the main prompt ID otherwise
     */
    getVariantId(id: string): Promise<string>;
}

export interface CustomAgentDescription {
    id: string;
    name: string;
    description: string;
    prompt: string;
    defaultLLM: string;
}
export namespace CustomAgentDescription {
    export function is(entry: unknown): entry is CustomAgentDescription {
        // eslint-disable-next-line no-null/no-null
        return typeof entry === 'object' && entry !== null
            && 'id' in entry && typeof entry.id === 'string'
            && 'name' in entry && typeof entry.name === 'string'
            && 'description' in entry && typeof entry.description === 'string'
            && 'prompt' in entry
            && typeof entry.prompt === 'string'
            && 'defaultLLM' in entry
            && typeof entry.defaultLLM === 'string';
    }
    export function equals(a: CustomAgentDescription, b: CustomAgentDescription): boolean {
        return a.id === b.id && a.name === b.name && a.description === b.description && a.prompt === b.prompt && a.defaultLLM === b.defaultLLM;
    }
}

export const PromptCustomizationService = Symbol('PromptCustomizationService');
export interface PromptCustomizationService {
    /**
     * Whether there is a customization for a {@link PromptTemplate} object
     * @param id the id of the {@link PromptTemplate} to check
     */
    isPromptTemplateCustomized(id: string): boolean;

    /**
     * Returns the customization of {@link PromptTemplate} object or undefined if there is none
     * @param id the id of the {@link PromptTemplate} to check
     */
    getCustomizedPromptTemplate(id: string): string | undefined

    getCustomPromptTemplateIDs(): string[];
    /**
     * Edit the template. If the content is specified, is will be
     * used to customize the template. Otherwise, the behavior depends
     * on the implementation. Implementation may for example decide to
     * open an editor, or request more information from the user, ...
     * @param id the template id.
     * @param content optional default content to initialize the template
     */
    editTemplate(id: string, defaultContent?: string): void;

    /**
     * Reset the template to its default value.
     * @param id the template id.
     */
    resetTemplate(id: string): void;

    /**
     * Return the template id for a given template file.
     * @param uri the uri of the template file
     */
    getTemplateIDFromURI(uri: URI): string | undefined;

    /**
     * Event which is fired when the prompt template is changed.
     */
    readonly onDidChangePrompt: Event<string>;

    /**
     * Return all custom agents.
     * @returns all custom agents
     */
    getCustomAgents(): Promise<CustomAgentDescription[]>;

    /**
     * Event which is fired when custom agents are modified.
     */
    readonly onDidChangeCustomAgents: Event<void>;

    /**
     * Returns all locations of existing customAgents.yml files and potential locations where
     * new customAgents.yml files could be created.
     *
     * @returns An array of objects containing the URI and whether the file exists
     */
    getCustomAgentsLocations(): Promise<{ uri: URI, exists: boolean }[]>;

    /**
     * Opens an existing customAgents.yml file at the given URI, or creates a new one if it doesn't exist.
     *
     * @param uri The URI of the customAgents.yml file to open or create
     */
    openCustomAgentYaml(uri: URI): Promise<void>;
}

@injectable()
export class PromptServiceImpl implements PromptService {
    @inject(AISettingsService) @optional()
    protected readonly settingsService: AISettingsService | undefined;

    @inject(PromptCustomizationService) @optional()
    protected readonly customizationService: PromptCustomizationService | undefined;

    @inject(AIVariableService) @optional()
    protected readonly variableService: AIVariableService | undefined;

    @inject(ToolInvocationRegistry) @optional()
    protected readonly toolInvocationRegistry: ToolInvocationRegistry | undefined;

    protected _prompts: PromptMap = {};

    getRawPrompt(id: string): PromptTemplate | undefined {
        if (this.customizationService !== undefined && this.customizationService.isPromptTemplateCustomized(id)) {
            const template = this.customizationService.getCustomizedPromptTemplate(id);
            if (template !== undefined) {
                return { id, template };
            }
        }
        return this.getDefaultRawPrompt(id);
    }
    getDefaultRawPrompt(id: string): PromptTemplate | undefined {
        return this._prompts[id];
    }

    getUnresolvedPrompt(id: string): PromptTemplate | undefined {
        const rawPrompt = this.getRawPrompt(id);
        if (!rawPrompt) {
            return undefined;
        }
        return {
            id: rawPrompt.id,
            template: this.stripComments(rawPrompt.template)
        };
    }

    protected stripComments(template: string): string {
        const commentRegex = /^\s*{{!--[\s\S]*?--}}\s*\n?/;
        return commentRegex.test(template) ? template.replace(commentRegex, '').trimStart() : template;
    }

    async getVariantId(id: string): Promise<string> {
        if (this.settingsService !== undefined) {
            const agentSettingsMap = await this.settingsService.getSettings();

            for (const agentSettings of Object.values(agentSettingsMap)) {
                if (agentSettings.selectedVariants && agentSettings.selectedVariants[id]) {
                    return agentSettings.selectedVariants[id];
                }
            }
        }
        return id;
    }

    async getPrompt(id: string, args?: { [key: string]: unknown }, context?: AIVariableContext): Promise<ResolvedPromptTemplate | undefined> {
        const variantId = await this.getVariantId(id);
        const prompt = this.getUnresolvedPrompt(variantId);
        if (prompt === undefined) {
            return undefined;
        }

        // First resolve variables and arguments
        let resolvedTemplate = prompt.template;
        const variableAndArgReplacements = await this.getVariableAndArgReplacements(prompt.template, args, context);
        variableAndArgReplacements.replacements.forEach(replacement => resolvedTemplate = resolvedTemplate.replace(replacement.placeholder, replacement.value));

        // Then resolve function references with already resolved variables and arguments
        // This allows to resolve function references contained in resolved variables (e.g. prompt fragments)
        const functionMatches = matchFunctionsRegEx(resolvedTemplate);
        const functions = new Map<string, ToolRequest>();
        const functionReplacements = functionMatches.map(match => {
            const completeText = match[0];
            const functionId = match[1];
            const toolRequest = this.toolInvocationRegistry?.getFunction(functionId);
            if (toolRequest) {
                functions.set(toolRequest.id, toolRequest);
            }
            return {
                placeholder: completeText,
                value: toolRequest ? toolRequestToPromptText(toolRequest) : completeText
            };
        });
        functionReplacements.forEach(replacement => resolvedTemplate = resolvedTemplate.replace(replacement.placeholder, replacement.value));

        return {
            id,
            text: resolvedTemplate,
            functionDescriptions: functions.size > 0 ? functions : undefined,
            variables: variableAndArgReplacements.resolvedVariables
        };
    }

    async getPromptFragment(
        id: string,
        args?: { [key: string]: unknown },
        context?: AIVariableContext,
        resolveVariable?: (variable: AIVariableArg) => Promise<ResolvedAIVariable | undefined>
    ): Promise<Omit<ResolvedPromptTemplate, 'functionDescriptions'> | undefined> {
        const variantId = await this.getVariantId(id);
        const prompt = this.getUnresolvedPrompt(variantId);
        if (prompt === undefined) {
            return undefined;
        }

        const replacements = await this.getVariableAndArgReplacements(prompt.template, args, context, resolveVariable);
        let resolvedTemplate = prompt.template;
        replacements.replacements.forEach(replacement => resolvedTemplate = resolvedTemplate.replace(replacement.placeholder, replacement.value));

        return {
            id,
            text: resolvedTemplate,
            variables: replacements.resolvedVariables
        };
    }

    /**
     * Calculates all variable and argument replacements for an unresolved template.
     *
     * @param template the unresolved template text
     * @param args the object with placeholders, mapping the placeholder key to the value
     * @param context the {@link AIVariableContext} to use during variable resolvement
     * @param resolveVariable the variable resolving method. Fall back to using the {@link AIVariableService} if not given.
     */
    protected async getVariableAndArgReplacements(
        template: string,
        args?: { [key: string]: unknown },
        context?: AIVariableContext,
        resolveVariable?: (variable: AIVariableArg) => Promise<ResolvedAIVariable | undefined>
    ): Promise<{ replacements: { placeholder: string; value: string }[], resolvedVariables: ResolvedAIVariable[] }> {
        const matches = matchVariablesRegEx(template);
        const variableCache = createAIResolveVariableCache();
        const variableAndArgReplacements: { placeholder: string; value: string }[] = [];
        const resolvedVariables: Set<ResolvedAIVariable> = new Set();
        for (const match of matches) {
            const completeText = match[0];
            const variableAndArg = match[1];
            let variableName = variableAndArg;
            let argument: string | undefined;
            const parts = variableAndArg.split(':', 2);
            if (parts.length > 1) {
                variableName = parts[0];
                argument = parts[1];
            }
            let value: string;
            if (args && args[variableAndArg] !== undefined) {
                value = String(args[variableAndArg]);
            } else {
                const toResolve = { variable: variableName, arg: argument };
                const resolved = resolveVariable
                    ? await resolveVariable(toResolve)
                    : await this.variableService?.resolveVariable(toResolve, context ?? {}, variableCache);
                // Track resolved variable and its dependencies in all resolved variables
                if (resolved) {
                    resolvedVariables.add(resolved);
                    resolved.allResolvedDependencies?.forEach(v => resolvedVariables.add(v));
                }
                value = String(resolved?.value ?? completeText);
            }
            variableAndArgReplacements.push({ placeholder: completeText, value });
        }

        return { replacements: variableAndArgReplacements, resolvedVariables: Array.from(resolvedVariables) };
    }

    getAllPrompts(): PromptMap {
        if (this.customizationService !== undefined) {
            const myCustomization = this.customizationService;
            const result: PromptMap = {};
            Object.keys(this._prompts).forEach(id => {
                if (myCustomization.isPromptTemplateCustomized(id)) {
                    const template = myCustomization.getCustomizedPromptTemplate(id);
                    if (template !== undefined) {
                        result[id] = { id, template };
                    } else {
                        result[id] = { ...this._prompts[id] };
                    }
                } else {
                    result[id] = { ...this._prompts[id] };
                }
            });
            return result;
        } else {
            return { ...this._prompts };
        }
    }
    removePrompt(id: string): void {
        delete this._prompts[id];
    }
    getVariantIds(id: string): string[] {
        const allCustomPromptTemplateIds = this.customizationService?.getCustomPromptTemplateIDs() || [];
        const knownPromptIds = Object.keys(this._prompts);

        // We filter out known IDs from the custom prompt template IDs, these are no variants, but customizations. Then we retain IDs that start with the main ID
        const customVariantIds = allCustomPromptTemplateIds.filter(customId =>
            !knownPromptIds.includes(customId) && customId.startsWith(id)
        );
        const variantIds = Object.values(this._prompts)
            .filter(prompt => prompt.variantOf === id)
            .map(variant => variant.id);

        return [...variantIds, ...customVariantIds];
    }
    storePromptTemplate(promptTemplate: PromptTemplate): void {
        this._prompts[promptTemplate.id] = promptTemplate;
    }
}
