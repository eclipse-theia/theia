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
import { Event, MaybePromise } from '@theia/core';
import { AIVariableContext } from './variable-service';

/** Prompt fragment IDs for each generic capability type */
export const GENERIC_CAPABILITIES_SKILLS_PROMPT_ID = 'generic-capabilities-skills';
export const GENERIC_CAPABILITIES_MCP_FUNCTIONS_PROMPT_ID = 'generic-capabilities-mcp-functions';
export const GENERIC_CAPABILITIES_FUNCTIONS_PROMPT_ID = 'generic-capabilities-functions';
export const GENERIC_CAPABILITIES_PROMPT_FRAGMENTS_PROMPT_ID = 'generic-capabilities-prompt-fragments';
export const GENERIC_CAPABILITIES_AGENT_DELEGATION_PROMPT_ID = 'generic-capabilities-agent-delegation';
export const GENERIC_CAPABILITIES_VARIABLES_PROMPT_ID = 'generic-capabilities-variables';

export type CapabilityType = keyof GenericCapabilitySelections;

/** Prefix used by internal prompt fragments for generic capabilities */
export const GENERIC_CAPABILITIES_PROMPT_PREFIX = 'generic-capabilities-';

/** Prefix used by internal variables for generic capability selections */
export const GENERIC_CAPABILITIES_VARIABLE_PREFIX = 'selected_';

/**
 * Represents a single capability item that can be selected.
 */
export interface GenericCapabilityItem {
    /** Unique identifier for this capability */
    id: string;
    /** Display name for the capability */
    name: string;
    /** Optional group name for grouping related items */
    group?: string;
    /** Optional description */
    description?: string;
}

/**
 * Represents a group of capability items.
 */
export interface GenericCapabilityGroup {
    /** Group name */
    name: string;
    /** Items in this group */
    items: GenericCapabilityItem[];
}

export const GenericCapabilitiesContribution = Symbol('GenericCapabilitiesContribution');

/**
 * Contribution point for external packages to provide additional generic capabilities.
 * For example, the MCP package can contribute MCP tool functions without
 * creating coupling between unrelated packages.
 */
export interface GenericCapabilitiesContribution {
    /** The capability type this contribution provides items for */
    readonly capabilityType: CapabilityType;
    /** Event fired when available capabilities from this contribution change */
    readonly onDidChange?: Event<void>;
    /** Returns available capability groups for this type */
    getAvailableCapabilities(): MaybePromise<GenericCapabilityGroup[]>;
}

/**
 * Static mapping of capability types to their corresponding prompt fragment IDs.
 * This is the single source of truth for the enumeration of capability types,
 * reducing DRY violations across the codebase.
 */
export const CAPABILITY_TYPE_PROMPT_MAP: ReadonlyArray<{ type: CapabilityType; promptId: string }> = [
    { type: 'skills', promptId: GENERIC_CAPABILITIES_SKILLS_PROMPT_ID },
    { type: 'mcpFunctions', promptId: GENERIC_CAPABILITIES_MCP_FUNCTIONS_PROMPT_ID },
    { type: 'functions', promptId: GENERIC_CAPABILITIES_FUNCTIONS_PROMPT_ID },
    { type: 'promptFragments', promptId: GENERIC_CAPABILITIES_PROMPT_FRAGMENTS_PROMPT_ID },
    { type: 'agentDelegation', promptId: GENERIC_CAPABILITIES_AGENT_DELEGATION_PROMPT_ID },
    { type: 'variables', promptId: GENERIC_CAPABILITIES_VARIABLES_PROMPT_ID },
];

/**
 * Represents user-selected generic capabilities to be included in chat requests.
 * These are capabilities selected via dropdown menus in the chat UI.
 */
export interface GenericCapabilitySelections {
    /** Selected skill IDs */
    skills?: string[];
    /** Selected MCP function IDs (format: "servername_toolname") */
    mcpFunctions?: string[];
    /** Selected function IDs */
    functions?: string[];
    /** Selected prompt fragment IDs */
    promptFragments?: string[];
    /** Selected agent IDs for delegation */
    agentDelegation?: string[];
    /** Selected variable names */
    variables?: string[];
}

export namespace GenericCapabilitySelections {
    /**
     * Checks if the selections object has any non-empty arrays.
     */
    export function hasSelections(selections: GenericCapabilitySelections | undefined): boolean {
        if (!selections) {
            return false;
        }
        return CAPABILITY_TYPE_PROMPT_MAP.some(({ type }) => (selections[type]?.length ?? 0) > 0);
    }
}

/**
 * An extended variable resolution context that includes capability override information.
 *
 * This context is used during prompt template resolution to determine which capability
 * fragments should be enabled or disabled, allowing dynamic customization of agent behavior.
 */
export namespace CapabilityAwareContext {
    export function is(candidate: unknown): candidate is CapabilityAwareContext {
        return typeof candidate === 'object' && !!candidate
            && ('capabilityOverrides' in candidate || 'genericCapabilitySelections' in candidate);
    }
}

export interface CapabilityAwareContext extends AIVariableContext {
    /**
     * Optional mapping of capability fragment IDs to their enabled/disabled state.
     *
     * When resolving capability variables in prompt templates, this map is consulted
     * to determine whether a capability should be enabled. If a fragment ID is not
     * present in this map, the capability's default state is used.
     */
    capabilityOverrides?: Record<string, boolean>;

    /**
     * Optional generic capability selections from dropdown menus.
     * These selections are used to dynamically include additional capabilities
     * (skills, functions, MCP tools, etc.) in the agent's prompt.
     */
    genericCapabilitySelections?: GenericCapabilitySelections;
}

/**
 * Represents a parsed capability variable from a prompt template.
 */
export interface ParsedCapability {
    /** The fragment ID to resolve when the capability is enabled */
    fragmentId: string;
    /** Whether the capability is enabled by default */
    defaultEnabled: boolean;
    /** Display name for the capability (defaults to fragmentId if not specified) */
    name?: string;
    /** Description of the capability */
    description?: string;
}

/**
 * Parses capability variables from a prompt template string.
 *
 * Capability variables have the format:
 * - `{{capability:fragment-id}}` (defaults to off)
 * - `{{capability:fragment-id default on}}` or `{{capability:fragment-id default off}}`
 * - `{{{capability:fragment-id}}}` (defaults to off)
 * - `{{{capability:fragment-id default on}}}` or `{{{capability:fragment-id default off}}}`
 *
 * @param template The prompt template string to parse
 * @returns Array of parsed capabilities in the order they appear in the template
 */
export function parseCapabilitiesFromTemplate(template: string): ParsedCapability[] {
    const seenFragmentIds = new Set<string>();
    const capabilities: ParsedCapability[] = [];

    const regex = /\{{2,3}\s*capability:([^\s}]+)(?:\s+default\s+(on|off))?\s*\}{2,3}/gi;
    let match = regex.exec(template);
    while (match) {
        const fragmentId = match[1];
        if (!seenFragmentIds.has(fragmentId)) {
            seenFragmentIds.add(fragmentId);
            capabilities.push({
                fragmentId,
                defaultEnabled: match[2]?.toLowerCase() === 'on'
            });
        }
        match = regex.exec(template);
    }

    return capabilities;
}

/**
 * Parses a capability argument string.
 * Expected formats:
 * - "fragment-id" (defaults to off)
 * - "fragment-id default on" or "fragment-id default off"
 * @param arg The argument string to parse
 * @returns Object with fragmentId and defaultEnabled, or undefined if parsing failed
 */
export function parseCapabilityArgument(arg: string): { fragmentId: string; defaultEnabled: boolean } | undefined {
    const match = arg.trim().match(/^(.+?)(?:\s+default\s+(on|off))?$/i);
    if (!match || !match[1].trim()) {
        return undefined;
    }

    return {
        fragmentId: match[1].trim(),
        defaultEnabled: match[2]?.toLowerCase() === 'on'
    };
}
