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
import { AIVariableContext } from './variable-service';

/**
 * An extended variable resolution context that includes capability override information.
 *
 * This context is used during prompt template resolution to determine which capability
 * fragments should be enabled or disabled, allowing dynamic customization of agent behavior.
 */
export interface CapabilityAwareContext extends AIVariableContext {
    /**
     * Optional mapping of capability fragment IDs to their enabled/disabled state.
     *
     * When resolving capability variables in prompt templates, this map is consulted
     * to determine whether a capability should be enabled. If a fragment ID is not
     * present in this map, the capability's default state is used.
     */
    capabilityOverrides?: Record<string, boolean>;
}

/**
 * Represents a parsed capability variable from a prompt template.
 */
export interface ParsedCapability {
    /** The fragment ID to resolve when the capability is enabled */
    fragmentId: string;
    /** Whether the capability is enabled by default */
    defaultEnabled: boolean;
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
