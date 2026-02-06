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

import { Event, Emitter, URI, ILogger, DisposableCollection } from '@theia/core';
import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import { AIVariableArg, AIVariableContext, AIVariableService, createAIResolveVariableCache, ResolvedAIVariable } from './variable-service';
import { ToolInvocationRegistry } from './tool-invocation-registry';
import { toolRequestToPromptText } from './language-model-util';
import { ToolRequest } from './language-model';
import { matchFunctionsRegEx, matchVariablesRegEx } from './prompt-service-util';
import { AISettingsService } from './settings-service';

export interface CommandPromptFragmentMetadata {
    /** Mark this template as available as a slash command */
    isCommand?: boolean;

    /** Display name for the command (defaults to fragment id if not specified) */
    commandName?: string;

    /** Description shown in command autocomplete */
    commandDescription?: string;

    /** Hint for command arguments shown in autocomplete detail (e.g., "<topic>", "[options]") */
    commandArgumentHint?: string;

    /** List of agent IDs this command is available for (undefined means available for all agents) */
    commandAgents?: string[];
}

/**
 * Represents a basic prompt fragment with an ID and template content.
 */
export interface BasePromptFragment extends CommandPromptFragmentMetadata {
    /** Unique identifier for this prompt fragment */
    id: string;

    /** The template content, which may contain variables and function references */
    template: string;
}

/**
 * Represents a customized prompt fragment with an assigned customization ID and priority.
 */
export interface CustomizedPromptFragment extends BasePromptFragment {
    /**
     * Unique identifier for this customization
     */
    customizationId: string;

    /**
     * The order/priority of this customization, higher values indicate higher priority
     * when multiple customizations exist for the same fragment
     */
    priority: number;
}

/**
 * Union type representing either a built-in or customized prompt fragment
 */
export type PromptFragment = BasePromptFragment | CustomizedPromptFragment;

/**
 * Type guard to check if a PromptFragment is a built-in fragment (not customized)
 * @param fragment The fragment to check
 * @returns True if the fragment is a basic BasePromptFragment (not customized)
 */
export function isBasePromptFragment(fragment: PromptFragment): fragment is BasePromptFragment {
    return !('customizationId' in fragment && 'priority' in fragment);
}

/**
 * Type guard to check if a PromptFragment is a CustomizedPromptFragment
 * @param fragment The fragment to check
 * @returns True if the fragment is a CustomizedPromptFragment
 */
export function isCustomizedPromptFragment(fragment: PromptFragment): fragment is CustomizedPromptFragment {
    return 'customizationId' in fragment && 'priority' in fragment;
}

/**
 * Contains the effective variant ID and customization state for a prompt fragment
 */
export interface PromptVariantInfo {
    /** The effective variant ID for the prompt fragment */
    variantId: string;
    /** Whether this variant has been customized by the user */
    isCustomized: boolean;
}

/**
 * Map of prompt fragment IDs to prompt fragments
 */
export interface PromptMap { [id: string]: PromptFragment }

/**
 * Represents a prompt fragment with all variables and function references resolved
 */
export interface ResolvedPromptFragment {
    /** The fragment ID */
    id: string;

    /** The resolved prompt text with variables and function requests being replaced */
    text: string;

    /** All functions referenced in the prompt fragment */
    functionDescriptions?: Map<string, ToolRequest>;

    /** All variables resolved in the prompt fragment */
    variables?: ResolvedAIVariable[];
}

/**
 * Describes a custom agent with its properties
 */
export interface CustomAgentDescription {
    /** Unique identifier for this agent */
    id: string;

    /** Display name for the agent */
    name: string;

    /** Description of the agent's purpose and capabilities */
    description: string;

    /** The prompt text for this agent */
    prompt: string;

    /** The default large language model to use with this agent */
    defaultLLM: string;
}

export namespace CustomAgentDescription {
    /**
     * Type guard to check if an object is a CustomAgentDescription
     */
    export function is(entry: unknown): entry is CustomAgentDescription {
        // eslint-disable-next-line no-null/no-null
        return typeof entry === 'object' && entry !== null
            && 'id' in entry && typeof entry.id === 'string'
            && 'name' in entry && typeof entry.name === 'string'
            && 'description' in entry && typeof entry.description === 'string'
            && 'prompt' in entry && typeof entry.prompt === 'string'
            && 'defaultLLM' in entry && typeof entry.defaultLLM === 'string';
    }

    /**
     * Compares two CustomAgentDescription objects for equality
     */
    export function equals(a: CustomAgentDescription, b: CustomAgentDescription): boolean {
        return a.id === b.id && a.name === b.name && a.description === b.description && a.prompt === b.prompt && a.defaultLLM === b.defaultLLM;
    }
}

/**
 * Service responsible for customizing prompt fragments
 */
export const PromptFragmentCustomizationService = Symbol('PromptFragmentCustomizationService');
export interface PromptFragmentCustomizationService {
    /**
     * Event fired when a prompt fragment is changed
     */
    readonly onDidChangePromptFragmentCustomization: Event<string[]>;

    /**
     * Event fired when custom agents are modified
     */
    readonly onDidChangeCustomAgents: Event<void>;

    /**
     * Checks if a prompt fragment has customizations
     * @param fragmentId The prompt fragment ID
     * @returns Whether the fragment has any customizations
     */
    isPromptFragmentCustomized(fragmentId: string): boolean;

    /**
     * Gets the active customized prompt fragment for a given ID
     * @param fragmentId The prompt fragment ID
     * @returns The active customized fragment or undefined if none exists
     */
    getActivePromptFragmentCustomization(fragmentId: string): CustomizedPromptFragment | undefined;

    /**
     * Gets all customizations for a prompt fragment ordered by priority
     * @param fragmentId The prompt fragment ID
     * @returns Array of customized fragments ordered by priority (highest first)
     */
    getAllCustomizations(fragmentId: string): CustomizedPromptFragment[];

    /**
     * Gets the IDs of all prompt fragments that have customizations
     * @returns Array of prompt fragment IDs
     */
    getCustomizedPromptFragmentIds(): string[];

    /**
     * Creates a new customization for a prompt fragment
     * @param fragmentId The fragment ID to customize
     * @param defaultContent Optional default content for the customization
     */
    createPromptFragmentCustomization(fragmentId: string, defaultContent?: string): Promise<void>;

    /**
     * Creates a customization based on a built-in fragment
     * @param fragmentId The ID of the built-in fragment to customize
     * @param defaultContent Optional default content for the customization
     */
    createBuiltInPromptFragmentCustomization(fragmentId: string, defaultContent?: string): Promise<void>;

    /**
     * Edits a specific customization of a prompt fragment
     * @param fragmentId The prompt fragment ID
     * @param customizationId The customization ID to edit
     */
    editPromptFragmentCustomization(fragmentId: string, customizationId: string): Promise<void>;

    /**
     * Edits the built-in customization of a prompt fragment
     * @param fragmentId The prompt fragment ID to edit
     * @param defaultContent Optional default content for the customization
     */
    editBuiltInPromptFragmentCustomization(fragmentId: string, defaultContent?: string): Promise<void>;

    /**
     * Removes a specific customization of a prompt fragment
     * @param fragmentId The prompt fragment ID
     * @param customizationId The customization ID to remove
     */
    removePromptFragmentCustomization(fragmentId: string, customizationId: string): Promise<void>;

    /**
     * Resets a fragment to its built-in version by removing all customizations
     * @param fragmentId The fragment ID to reset
     */
    removeAllPromptFragmentCustomizations(fragmentId: string): Promise<void>;

    /**
     * Resets to a specific customization by removing higher-priority customizations
     * @param fragmentId The fragment ID
     * @param customizationId The customization ID to reset to
     */
    resetToCustomization(fragmentId: string, customizationId: string): Promise<void>;

    /**
     * Gets information about the description of a customization
     * @param fragmentId The fragment ID
     * @param customizationId The customization ID
     * @returns Description of the customization
     */
    getPromptFragmentCustomizationDescription(fragmentId: string, customizationId: string): Promise<string | undefined>;

    /**
     * Gets information about the source/type of a customization
     * @param fragmentId The fragment ID
     * @param customizationId The customization ID
     * @returns Type of the customization source
     */
    getPromptFragmentCustomizationType(fragmentId: string, customizationId: string): Promise<string | undefined>;

    /**
     * Gets the fragment ID from a resource identifier
     * @param resourceId Resource identifier (implementation specific)
     * @returns Fragment ID or undefined if not found
     */
    getPromptFragmentIDFromResource(resourceId: unknown): string | undefined;

    /**
     * Gets all custom agent descriptions
     * @returns Array of custom agent descriptions
     */
    getCustomAgents(): Promise<CustomAgentDescription[]>;

    /**
     * Gets the locations of custom agent configuration files
     * @returns Array of URIs and existence status
     */
    getCustomAgentsLocations(): Promise<{ uri: URI, exists: boolean }[]>;

    /**
     * Opens an existing customAgents.yml file at the given URI, or creates a new one if it doesn't exist.
     *
     * @param uri The URI of the customAgents.yml file to open or create
     */
    openCustomAgentYaml(uri: URI): Promise<void>;
}

/**
 * Service for managing and resolving prompt fragments
 */
export const PromptService = Symbol('PromptService');
export interface PromptService {
    /**
     * Event fired when the prompts change
     */
    readonly onPromptsChange: Event<void>;

    /**
     * Event fired when the selected variant for a prompt variant set changes
     */
    readonly onSelectedVariantChange: Event<{ promptVariantSetId: string, variantId: string | undefined }>;

    /**
     * Gets the raw prompt fragment with comments
     * @param fragmentId The prompt fragment ID
     * @returns The raw prompt fragment or undefined if not found
     */
    getRawPromptFragment(fragmentId: string): PromptFragment | undefined;

    /**
     * Gets the raw prompt fragment without comments
     * @param fragmentId The prompt fragment ID
     * @returns The raw prompt fragment or undefined if not found
     */
    getPromptFragment(fragmentId: string): PromptFragment | undefined;

    /**
     * Gets the built-in raw prompt fragment (before any customizations)
     * @param fragmentId The prompt fragment ID
     * @returns The built-in fragment or undefined if not found
     */
    getBuiltInRawPrompt(fragmentId: string): PromptFragment | undefined;

    /**
     * Gets a prompt fragment by command name (for slash commands)
     * @param commandName The command name to search for
     * @returns The fragment with the matching command name or undefined if not found
     */
    getPromptFragmentByCommandName(commandName: string): PromptFragment | undefined;

    /**
     * Resolves a prompt fragment by replacing variables and function references
     * @param fragmentId The prompt fragment ID
     * @param args Optional object with values for variable replacement
     * @param context Optional context for variable resolution
     * @returns The resolved prompt fragment or undefined if not found
     */
    getResolvedPromptFragment(fragmentId: string, args?: { [key: string]: unknown }, context?: AIVariableContext): Promise<ResolvedPromptFragment | undefined>;

    /**
     * Resolves a prompt fragment by replacing variables but preserving function references
     * @param fragmentId The prompt fragment ID
     * @param args Optional object with values for variable replacement
     * @param context Optional context for variable resolution
     * @param resolveVariable Optional custom variable resolution function
     * @returns The partially resolved prompt fragment or undefined if not found
     */
    getResolvedPromptFragmentWithoutFunctions(
        fragmentId: string,
        args?: { [key: string]: unknown },
        context?: AIVariableContext,
        resolveVariable?: (variable: AIVariableArg) => Promise<ResolvedAIVariable | undefined>
    ): Promise<Omit<ResolvedPromptFragment, 'functionDescriptions'> | undefined>;

    /**
     * Adds a prompt fragment to the service
     * @param promptFragment The fragment to store
     * @param promptVariantSetId Optional ID of the prompt variant set this is a variant of
     */
    addBuiltInPromptFragment(promptFragment: BasePromptFragment, promptVariantSetId?: string, isDefault?: boolean): void;

    /**
     * Removes a prompt fragment from the service
     * @param fragmentId The fragment ID to remove
     */
    removePromptFragment(fragmentId: string): void;

    /**
     * Gets all known prompts, including variants and customizations
     * @returns Map of fragment IDs to arrays of fragments
     */
    getAllPromptFragments(): Map<string, PromptFragment[]>;

    /**
     * Gets all active prompts (highest priority version of each fragment)
     * @returns Array of active prompt fragments
     */
    getActivePromptFragments(): PromptFragment[];

    /**
     * Returns all IDs of all prompt fragments of the given set
     * @param promptVariantSetId The prompt variant set id
     * @returns Array of variant IDs
     */
    getVariantIds(promptVariantSetId: string): string[];

    /**
     * Gets the explicitly selected variant ID for a prompt fragment from settings.
     * This returns only the variant that was explicitly selected in settings, not the default.
     * @param promptVariantSetId The prompt variant set id
     * @returns The selected variant ID from settings, or undefined if none is selected
     */
    getSelectedVariantId(promptVariantSetId: string): string | undefined;

    /**
     * Gets the effective variant ID that is guaranteed to be valid if one exists.
     * This checks if the selected variant ID is valid, and falls back to the default variant if it isn't.
     * @param promptVariantSetId The prompt variant set id
     * @returns A valid variant ID if one exists, or undefined if no valid variant can be found
     */
    getEffectiveVariantId(promptVariantSetId: string): string | undefined;

    /**
     * Gets the effective variant ID and customization state for a prompt fragment.
     * This is a convenience method that combines getEffectiveVariantId and customization check.
     * @param fragmentId The prompt fragment ID or variant set ID
     * @returns The variant info or undefined if no valid variant exists
     */
    getPromptVariantInfo(fragmentId: string): PromptVariantInfo | undefined;

    /**
     * Gets the default variant ID of the given set
     * @param promptVariantSetId The prompt variant set id
     * @returns The default variant ID or undefined if no default is set
     */
    getDefaultVariantId(promptVariantSetId: string): string | undefined;

    /**
     * Updates the selected variant for a prompt variant set
     * @param agentId The ID of the agent to update
     * @param promptVariantSetId The prompt variant set ID
     * @param newVariant The new variant ID to set as selected
     */
    updateSelectedVariantId(agentId: string, promptVariantSetId: string, newVariant: string): Promise<void>;

    /**
     * Gets all prompt variant sets and their variants
     * @returns Map of prompt variant set IDs to arrays of variant IDs
     */
    getPromptVariantSets(): Map<string, string[]>;

    /**
     * Gets all prompt fragments marked as commands, optionally filtered by agent
     * @param agentId Optional agent ID to filter commands (undefined returns commands for all agents)
     * @returns Array of command prompt fragments
     */
    getCommands(agentId?: string): PromptFragment[];

    /**
     * The following methods delegate to the PromptFragmentCustomizationService
     */
    createCustomization(fragmentId: string): Promise<void>;
    createBuiltInCustomization(fragmentId: string): Promise<void>;
    editBuiltInCustomization(fragmentId: string): Promise<void>;
    editCustomization(fragmentId: string, customizationId: string): Promise<void>;
    removeCustomization(fragmentId: string, customizationId: string): Promise<void>;
    resetAllToBuiltIn(): Promise<void>;
    resetToBuiltIn(fragmentId: string): Promise<void>;
    resetToCustomization(fragmentId: string, customizationId: string): Promise<void>;
    getCustomizationDescription(fragmentId: string, customizationId: string): Promise<string | undefined>;
    getCustomizationType(fragmentId: string, customizationId: string): Promise<string | undefined>;
    getTemplateIDFromResource(resourceId: unknown): string | undefined;
}

@injectable()
export class PromptServiceImpl implements PromptService {
    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(AISettingsService) @optional()
    protected readonly settingsService: AISettingsService | undefined;

    @inject(PromptFragmentCustomizationService) @optional()
    protected readonly customizationService: PromptFragmentCustomizationService | undefined;

    // Map to store selected variant for each prompt variant set (key: promptVariantSetId, value: variantId)
    protected _selectedVariantsMap = new Map<string, string>();

    @inject(AIVariableService) @optional()
    protected readonly variableService: AIVariableService | undefined;

    @inject(ToolInvocationRegistry) @optional()
    protected readonly toolInvocationRegistry: ToolInvocationRegistry | undefined;

    // Collection of built-in prompt fragments
    protected _builtInFragments: BasePromptFragment[] = [];

    // Map to store prompt variants sets (key: promptVariantSetId, value: array of variantIds)
    protected _promptVariantSetsMap = new Map<string, string[]>();

    // Map to store default variant for each prompt variant set (key: promptVariantSetId, value: variantId)
    protected _defaultVariantsMap = new Map<string, string>();

    // Event emitter for prompt changes
    protected _onPromptsChangeEmitter = new Emitter<void>();
    readonly onPromptsChange = this._onPromptsChangeEmitter.event;

    // Event emitter for selected variant changes
    protected _onSelectedVariantChangeEmitter = new Emitter<{ promptVariantSetId: string, variantId: string | undefined }>();
    readonly onSelectedVariantChange = this._onSelectedVariantChangeEmitter.event;

    protected promptChangeDebounceTimer?: NodeJS.Timeout;

    protected toDispose = new DisposableCollection();

    protected fireOnPromptsChangeDebounced(): void {
        if (this.promptChangeDebounceTimer) {
            clearTimeout(this.promptChangeDebounceTimer);
        }
        this.promptChangeDebounceTimer = setTimeout(() => {
            this._onPromptsChangeEmitter.fire();
        }, 300);
    }

    @postConstruct()
    protected init(): void {
        if (this.customizationService) {
            this.toDispose.pushAll([
                this.customizationService.onDidChangePromptFragmentCustomization(() => {
                    this.fireOnPromptsChangeDebounced();
                }),
                this.customizationService.onDidChangeCustomAgents(() => {
                    this.fireOnPromptsChangeDebounced();
                })
            ]);
        }
        if (this.settingsService) {
            this.recalculateSelectedVariantsMap();
            this.toDispose.push(
                this.settingsService!.onDidChange(async () => {
                    await this.recalculateSelectedVariantsMap();
                })
            );
        }
    }

    /**
     * Recalculates the selected variants map for all variant sets and fires the onSelectedVariantChangeEmitter
     * if the selectedVariants field has changed.
     */
    protected async recalculateSelectedVariantsMap(): Promise<void> {
        if (!this.settingsService) {
            return;
        }
        const agentSettingsMap = await this.settingsService.getSettings();
        const newSelectedVariants = new Map<string, string>();
        for (const agentSettings of Object.values(agentSettingsMap)) {
            if (agentSettings.selectedVariants) {
                for (const [variantSetId, variantId] of Object.entries(agentSettings.selectedVariants)) {
                    if (!newSelectedVariants.has(variantSetId)) {
                        newSelectedVariants.set(variantSetId, variantId);
                    }
                }
            }
        }
        // Compare with the old map and fire events for changes and removed variant sets
        for (const [variantSetId, newVariantId] of newSelectedVariants.entries()) {
            const oldVariantId = this._selectedVariantsMap.get(variantSetId);
            if (oldVariantId !== newVariantId) {
                this._onSelectedVariantChangeEmitter.fire({ promptVariantSetId: variantSetId, variantId: newVariantId });
            }
        }
        for (const oldVariantSetId of this._selectedVariantsMap.keys()) {
            if (!newSelectedVariants.has(oldVariantSetId)) {
                this._onSelectedVariantChangeEmitter.fire({ promptVariantSetId: oldVariantSetId, variantId: undefined });
            }
        }
        this._selectedVariantsMap = newSelectedVariants;
        // Also fire a full prompts change, because other fields (like effectiveVariantId) might have changed
        this.fireOnPromptsChangeDebounced();
    }

    // ===== Fragment Retrieval Methods =====

    /**
     * Finds a built-in fragment by its ID
     * @param fragmentId The ID of the fragment to find
     * @returns The built-in fragment or undefined if not found
     */
    protected findBuiltInFragmentById(fragmentId: string): BasePromptFragment | undefined {
        return this._builtInFragments.find(fragment => fragment.id === fragmentId);
    }

    protected findBuiltInFragmentByName(fragmentName: string): BasePromptFragment | undefined {
        return this._builtInFragments.find(fragment => fragment.commandName === fragmentName);
    }

    getRawPromptFragment(fragmentId: string): PromptFragment | undefined {
        if (this.customizationService?.isPromptFragmentCustomized(fragmentId)) {
            const customizedFragment = this.customizationService.getActivePromptFragmentCustomization(fragmentId);
            if (customizedFragment !== undefined) {
                return customizedFragment;
            }
        }
        return this.getBuiltInRawPrompt(fragmentId);
    }

    getBuiltInRawPrompt(fragmentId: string): PromptFragment | undefined {
        return this.findBuiltInFragmentById(fragmentId) ?? this.findBuiltInFragmentByName(fragmentId);
    }

    getPromptFragment(fragmentId: string): PromptFragment | undefined {
        const rawFragment = this.getRawPromptFragment(fragmentId);
        if (!rawFragment) {
            return undefined;
        }
        return {
            ...rawFragment,
            template: this.stripComments(rawFragment.template)
        };
    }

    getPromptFragmentByCommandName(commandName: string): PromptFragment | undefined {
        // First check customized fragments
        if (this.customizationService) {
            const customizedIds = this.customizationService.getCustomizedPromptFragmentIds();
            for (const fragmentId of customizedIds) {
                const fragment = this.customizationService.getActivePromptFragmentCustomization(fragmentId);
                if (fragment?.isCommand && fragment.commandName === commandName) {
                    return fragment;
                }
            }
        }

        // Then check built-in fragments
        return this._builtInFragments.find(fragment =>
            fragment.isCommand && fragment.commandName === commandName
        );
    }

    /**
     * Strips comments from a template string
     * @param templateText The template text to process
     * @returns Template text with comments removed
     */
    protected stripComments(templateText: string): string {
        const commentRegex = /^\s*{{!--[\s\S]*?--}}\s*\n?/;
        return commentRegex.test(templateText) ? templateText.replace(commentRegex, '').trimStart() : templateText;
    }

    getSelectedVariantId(variantSetId: string): string | undefined {
        return this._selectedVariantsMap.get(variantSetId);
    }

    getEffectiveVariantId(variantSetId: string): string | undefined {
        const selectedVariantId = this.getSelectedVariantId(variantSetId);

        // Check if the selected variant actually exists
        if (selectedVariantId) {
            const variantIds = this.getVariantIds(variantSetId);
            if (!variantIds.includes(selectedVariantId)) {
                this.logger.warn(`Selected variant '${selectedVariantId}' for prompt set '${variantSetId}' does not exist. Falling back to default variant.`);
            } else {
                return selectedVariantId;
            }
        }

        // Fall back to default variant
        const defaultVariantId = this.getDefaultVariantId(variantSetId);
        if (defaultVariantId) {
            const variantIds = this.getVariantIds(variantSetId);
            if (!variantIds.includes(defaultVariantId)) {
                this.logger.error(`Default variant '${defaultVariantId}' for prompt set '${variantSetId}' does not exist.`);
                return undefined;
            }
            return defaultVariantId;
        }

        // No valid selected or default variant
        if (this.getVariantIds(variantSetId).length > 0) {
            this.logger.error(`No valid selected or default variant found for prompt set '${variantSetId}'.`);
        }
        return undefined;
    }

    getPromptVariantInfo(fragmentId: string): PromptVariantInfo | undefined {
        const variantId = this.getEffectiveVariantId(fragmentId) ?? fragmentId;
        const rawFragment = this.getRawPromptFragment(variantId);
        if (!rawFragment) {
            return undefined;
        }
        const isCustomized = isCustomizedPromptFragment(rawFragment);
        return { variantId, isCustomized };
    }

    protected resolvePotentialSystemPrompt(promptFragmentId: string): PromptFragment | undefined {
        if (this._promptVariantSetsMap.has(promptFragmentId)) {
            // This is a systemPrompt find the effective variant
            const effectiveVariantId = this.getEffectiveVariantId(promptFragmentId);
            if (effectiveVariantId === undefined) {
                return undefined;
            }
            return this.getPromptFragment(effectiveVariantId);
        }
        return this.getPromptFragment(promptFragmentId);
    }

    // ===== Fragment Resolution Methods =====

    async getResolvedPromptFragment(systemOrFragmentId: string, args?: { [key: string]: unknown }, context?: AIVariableContext): Promise<ResolvedPromptFragment | undefined> {
        const promptFragment = this.resolvePotentialSystemPrompt(systemOrFragmentId);
        if (promptFragment === undefined) {
            return undefined;
        }

        // First resolve variables and arguments
        let resolvedTemplate = promptFragment.template;
        const variableAndArgResolutions = await this.resolveVariablesAndArgs(promptFragment.template, args, context);
        variableAndArgResolutions.replacements.forEach(replacement =>
            resolvedTemplate = resolvedTemplate.replace(replacement.placeholder, replacement.value));

        // Then resolve function references with already resolved variables and arguments
        // This allows to resolve function references contained in resolved variables (e.g. prompt fragments)
        const functionMatches = matchFunctionsRegEx(resolvedTemplate);
        const functionMap = new Map<string, ToolRequest>();
        const functionReplacements = functionMatches.map(match => {
            const completeText = match[0];
            const functionId = match[1];
            const toolRequest = this.toolInvocationRegistry?.getFunction(functionId);
            if (toolRequest) {
                functionMap.set(toolRequest.id, toolRequest);
            }
            return {
                placeholder: completeText,
                value: toolRequest ? toolRequestToPromptText(toolRequest) : completeText
            };
        });
        functionReplacements.forEach(replacement =>
            resolvedTemplate = resolvedTemplate.replace(replacement.placeholder, replacement.value));

        return {
            id: systemOrFragmentId,
            text: resolvedTemplate,
            functionDescriptions: functionMap.size > 0 ? functionMap : undefined,
            variables: variableAndArgResolutions.resolvedVariables
        };
    }

    async getResolvedPromptFragmentWithoutFunctions(
        systemOrFragmentId: string,
        args?: { [key: string]: unknown },
        context?: AIVariableContext,
        resolveVariable?: (variable: AIVariableArg) => Promise<ResolvedAIVariable | undefined>
    ): Promise<Omit<ResolvedPromptFragment, 'functionDescriptions'> | undefined> {
        const promptFragment = this.resolvePotentialSystemPrompt(systemOrFragmentId);
        if (promptFragment === undefined) {
            return undefined;
        }

        const resolutions = await this.resolveVariablesAndArgs(promptFragment.template, args, context, resolveVariable);
        let resolvedTemplate = promptFragment.template;
        resolutions.replacements.forEach(replacement =>
            resolvedTemplate = resolvedTemplate.replace(replacement.placeholder, replacement.value));

        return {
            id: systemOrFragmentId,
            text: resolvedTemplate,
            variables: resolutions.resolvedVariables
        };
    }

    /**
     * Calculates all variable and argument replacements for an unresolved template.
     *
     * @param templateText the unresolved template text
     * @param args the object with placeholders, mapping the placeholder key to the value
     * @param context the {@link AIVariableContext} to use during variable resolution
     * @param resolveVariable the variable resolving method. Fall back to using the {@link AIVariableService} if not given.
     * @returns Object containing replacements and resolved variables
     */
    protected async resolveVariablesAndArgs(
        templateText: string,
        args?: { [key: string]: unknown },
        context?: AIVariableContext,
        resolveVariable?: (variable: AIVariableArg) => Promise<ResolvedAIVariable | undefined>
    ): Promise<{
        replacements: { placeholder: string; value: string }[],
        resolvedVariables: ResolvedAIVariable[]
    }> {
        const variableMatches = matchVariablesRegEx(templateText);
        const variableCache = createAIResolveVariableCache();
        const replacementsList: { placeholder: string; value: string }[] = [];
        const resolvedVariablesSet: Set<ResolvedAIVariable> = new Set();

        for (const match of variableMatches) {
            const placeholderText = match[0];
            const variableAndArg = match[1];
            let variableName = variableAndArg;
            let argument: string | undefined;

            const parts = variableAndArg.split(':', 2);
            if (parts.length > 1) {
                variableName = parts[0];
                argument = parts[1];
            }

            let replacementValue: string;
            if (args && args[variableAndArg] !== undefined) {
                replacementValue = String(args[variableAndArg]);
            } else {
                const variableToResolve = { variable: variableName, arg: argument };
                const resolvedVariable = resolveVariable
                    ? await resolveVariable(variableToResolve)
                    : await this.variableService?.resolveVariable(variableToResolve, context ?? {}, variableCache);

                // Track resolved variable and its dependencies in all resolved variables
                if (resolvedVariable) {
                    resolvedVariablesSet.add(resolvedVariable);
                    resolvedVariable.allResolvedDependencies?.forEach(v => resolvedVariablesSet.add(v));
                }
                replacementValue = String(resolvedVariable?.value ?? placeholderText);
            }
            replacementsList.push({ placeholder: placeholderText, value: replacementValue });
        }

        return {
            replacements: replacementsList,
            resolvedVariables: Array.from(resolvedVariablesSet)
        };
    }

    // ===== Fragment Collection Management Methods =====

    getAllPromptFragments(): Map<string, PromptFragment[]> {
        const fragmentsMap = new Map<string, PromptFragment[]>();

        if (this.customizationService) {
            const customizationIds = this.customizationService.getCustomizedPromptFragmentIds();
            customizationIds.forEach(fragmentId => {
                const customizations = this.customizationService!.getAllCustomizations(fragmentId);
                if (customizations.length > 0) {
                    fragmentsMap.set(fragmentId, customizations);
                }
            });
        }

        // Add all built-in fragments
        for (const fragment of this._builtInFragments) {
            if (fragmentsMap.has(fragment.id)) {
                fragmentsMap.get(fragment.id)!.push(fragment);
            } else {
                fragmentsMap.set(fragment.id, [fragment]);
            }
        }

        return fragmentsMap;
    }

    getActivePromptFragments(): PromptFragment[] {
        const activeFragments: PromptFragment[] = [...this._builtInFragments];

        if (this.customizationService) {
            // Fetch all customized fragment IDs once
            const customizedIds = this.customizationService.getCustomizedPromptFragmentIds();

            // For each customized ID, get the active customization
            for (const fragmentId of customizedIds) {
                const customFragment = this.customizationService?.getActivePromptFragmentCustomization(fragmentId);
                if (customFragment) {
                    // Find and replace existing entry with the same ID instead of just adding
                    const existingIndex = activeFragments.findIndex(fragment => fragment.id === fragmentId);
                    if (existingIndex !== -1) {
                        // Replace existing fragment
                        activeFragments[existingIndex] = customFragment;
                    } else {
                        // Add new fragment if no existing one found
                        activeFragments.push(customFragment);
                    }
                }
            }
        }
        return activeFragments;
    }

    removePromptFragment(fragmentId: string): void {
        const index = this._builtInFragments.findIndex(fragment => fragment.id === fragmentId);
        if (index !== -1) {
            this._builtInFragments.splice(index, 1);
        }

        // Remove any variant references
        for (const [promptVariantSetId, variants] of this._promptVariantSetsMap.entries()) {
            if (variants.includes(fragmentId)) {
                this.removeFragmentVariant(promptVariantSetId, fragmentId);
            }
        }

        // Clean up default variants map if needed
        if (this._defaultVariantsMap.has(fragmentId)) {
            this._defaultVariantsMap.delete(fragmentId);
        }

        // Look for this fragmentId as a variant in default variants and remove if found
        for (const [promptVariantSetId, defaultVariantId] of this._defaultVariantsMap.entries()) {
            if (defaultVariantId === fragmentId) {
                this._defaultVariantsMap.delete(promptVariantSetId);
            }
        }

        this.fireOnPromptsChangeDebounced();
    }

    getVariantIds(variantSetId: string): string[] {
        const builtInVariants = this._promptVariantSetsMap.get(variantSetId) || [];

        // Check for custom variants from customization service
        if (this.customizationService) {
            const allCustomizedIds = this.customizationService.getCustomizedPromptFragmentIds();
            // Find customizations that start with the variant set ID
            // These are considered variants of this variant set
            // Only include IDs that are not the variant set ID itself, start with the variant set ID,
            // and are not customizations of existing variants in this set
            const customVariants = allCustomizedIds.filter(id =>
                id !== variantSetId &&
                id.startsWith(variantSetId) &&
                !builtInVariants.includes(id)
            );

            if (customVariants.length > 0) {
                // Combine built-in variants with custom variants, without modifying the internal state
                return [...builtInVariants, ...customVariants];
            }
        }

        return builtInVariants;
    }

    getDefaultVariantId(promptVariantSetId: string): string | undefined {
        return this._defaultVariantsMap.get(promptVariantSetId);
    }

    getPromptVariantSets(): Map<string, string[]> {
        const result = new Map(this._promptVariantSetsMap);

        // Check for custom variants from customization service
        if (this.customizationService) {
            const allCustomizedIds = this.customizationService.getCustomizedPromptFragmentIds();

            // Add custom variants to existing variant sets
            for (const [variantSetId, variants] of result.entries()) {
                // Filter out customized fragments that are just customizations of existing variants
                // so we don't treat them as separate variants themselves
                // Only include IDs that are not the variant set ID itself, start with the variant set ID,
                // and are not customizations of existing variants in this set
                const customVariants = allCustomizedIds.filter(id =>
                    id !== variantSetId &&
                    id.startsWith(variantSetId) &&
                    !variants.includes(id)
                );

                if (customVariants.length > 0) {
                    // Create a new array without modifying the original
                    result.set(variantSetId, [...variants, ...customVariants]);
                }
            }
        }
        return result;
    }

    addBuiltInPromptFragment(promptFragment: BasePromptFragment, promptVariantSetId?: string, isDefault: boolean = false): void {
        this.checkCommandUniqueness(promptFragment);

        const existingIndex = this._builtInFragments.findIndex(fragment => fragment.id === promptFragment.id);
        if (existingIndex !== -1) {
            // Replace existing fragment with the same ID
            this._builtInFragments[existingIndex] = promptFragment;
        } else {
            // Add new fragment
            this._builtInFragments.push(promptFragment);
        }

        // If this is a variant of a prompt variant set, record it in the variants map
        if (promptVariantSetId) {
            this.addFragmentVariant(promptVariantSetId, promptFragment.id, isDefault);
        }

        this.fireOnPromptsChangeDebounced();
    }

    protected checkCommandUniqueness(promptFragment: BasePromptFragment): void {
        if (promptFragment.isCommand && promptFragment.commandName) {
            const commandName = promptFragment.commandName;
            const duplicates = this._builtInFragments.filter(
                f => f.isCommand && f.commandName === commandName && (
                    // undefined commandAgents means applicable to all agents
                    f.commandAgents === undefined ||
                    promptFragment.commandAgents === undefined ||
                    // Check for overlapping command agents
                    f.commandAgents.some(agent => promptFragment.commandAgents!.includes(agent))
                )
            );
            if (duplicates.length > 0) {
                this.logger.warn(
                    `Command name '${commandName}' is used by multiple fragments: ${promptFragment.id} and ${duplicates.map(d => d.id).join(', ')}`
                );
            }
        }
    }

    // ===== Variant Management Methods =====

    /**
     * Adds a variant ID to the fragment variants map
     * @param promptVariantSetId The prompt variant set id
     * @param variantId The variant ID to add
     * @param isDefault Whether this variant should be the default for the prompt variant set (defaults to false)
     */
    protected addFragmentVariant(promptVariantSetId: string, variantId: string, isDefault: boolean = false): void {
        if (!this._promptVariantSetsMap.has(promptVariantSetId)) {
            this._promptVariantSetsMap.set(promptVariantSetId, []);
        }

        const variants = this._promptVariantSetsMap.get(promptVariantSetId)!;
        if (!variants.includes(variantId)) {
            variants.push(variantId);
        }

        if (isDefault) {
            this._defaultVariantsMap.set(promptVariantSetId, variantId);
        }
    }

    /**
     * Removes a variant ID from the fragment variants map
     * @param promptVariantSetId The prompt variant set id
     * @param variantId The variant ID to remove
     */
    protected removeFragmentVariant(promptVariantSetId: string, variantId: string): void {
        if (!this._promptVariantSetsMap.has(promptVariantSetId)) {
            return;
        }

        const variants = this._promptVariantSetsMap.get(promptVariantSetId)!;
        const index = variants.indexOf(variantId);

        if (index !== -1) {
            variants.splice(index, 1);

            // Remove the key if no variants left
            if (variants.length === 0) {
                this._promptVariantSetsMap.delete(promptVariantSetId);
            }
        }
    }

    async updateSelectedVariantId(agentId: string, promptVariantSetId: string, newVariant: string): Promise<void> {
        if (!this.settingsService) {
            return;
        }

        const defaultVariantId = this.getDefaultVariantId(promptVariantSetId);
        const agentSettings = await this.settingsService.getAgentSettings(agentId);
        const selectedVariants = agentSettings?.selectedVariants || {};

        const updatedVariants = { ...selectedVariants };
        if (newVariant === defaultVariantId) {
            delete updatedVariants[promptVariantSetId];
        } else {
            updatedVariants[promptVariantSetId] = newVariant;
        }

        await this.settingsService.updateAgentSettings(agentId, {
            selectedVariants: updatedVariants,
        });

        // Emit the selected variant change event
        this._onSelectedVariantChangeEmitter.fire({ promptVariantSetId, variantId: newVariant });
    }

    // ===== Customization Service Delegation Methods =====

    async createCustomization(fragmentId: string): Promise<void> {
        if (this.customizationService) {
            await this.customizationService.createPromptFragmentCustomization(fragmentId);
        }
    }

    async createBuiltInCustomization(fragmentId: string): Promise<void> {
        if (this.customizationService) {
            const builtInTemplate = this.findBuiltInFragmentById(fragmentId);
            await this.customizationService.createBuiltInPromptFragmentCustomization(fragmentId, builtInTemplate?.template);
        }
    }

    async editCustomization(fragmentId: string, customizationId: string): Promise<void> {
        if (this.customizationService) {
            await this.customizationService.editPromptFragmentCustomization(fragmentId, customizationId);
        }
    }

    async removeCustomization(fragmentId: string, customizationId: string): Promise<void> {
        if (this.customizationService) {
            await this.customizationService.removePromptFragmentCustomization(fragmentId, customizationId);
        }
    }

    async resetAllToBuiltIn(): Promise<void> {
        if (this.customizationService) {
            for (const fragment of this._builtInFragments) {
                await this.customizationService.removeAllPromptFragmentCustomizations(fragment.id);
            }
        }
    }

    async resetToBuiltIn(fragmentId: string): Promise<void> {
        const builtIn = this._builtInFragments.find(b => b.id === fragmentId);
        // Only reset this if it has a built-in, otherwise a delete would be the correct operation
        if (this.customizationService && builtIn) {
            await this.customizationService.removeAllPromptFragmentCustomizations(fragmentId);
        }
    }

    async resetToCustomization(fragmentId: string, customizationId: string): Promise<void> {
        if (this.customizationService) {
            await this.customizationService.resetToCustomization(fragmentId, customizationId);
        }
    }

    async getCustomizationDescription(fragmentId: string, customizationId: string): Promise<string | undefined> {
        if (!this.customizationService) {
            return undefined;
        }
        return await this.customizationService.getPromptFragmentCustomizationDescription(fragmentId, customizationId);
    }

    async getCustomizationType(fragmentId: string, customizationId: string): Promise<string | undefined> {
        if (!this.customizationService) {
            return undefined;
        }
        return await this.customizationService.getPromptFragmentCustomizationType(fragmentId, customizationId);
    }

    getTemplateIDFromResource(resourceId: unknown): string | undefined {
        if (this.customizationService) {
            return this.customizationService.getPromptFragmentIDFromResource(resourceId);
        }
        return undefined;
    }

    async editBuiltInCustomization(fragmentId: string): Promise<void> {
        if (this.customizationService) {
            const builtInTemplate = this.findBuiltInFragmentById(fragmentId);
            await this.customizationService.editBuiltInPromptFragmentCustomization(fragmentId, builtInTemplate?.template);
        }
    }

    getCommands(agentId?: string): PromptFragment[] {
        const allCommands = this.getActivePromptFragments().filter(fragment => fragment.isCommand === true);

        if (!agentId) {
            return allCommands;
        }

        return allCommands.filter(fragment => !fragment.commandAgents || fragment.commandAgents.includes(agentId));
    }
}
