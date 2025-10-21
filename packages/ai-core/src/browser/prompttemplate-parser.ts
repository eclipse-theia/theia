// *****************************************************************************
// Copyright (C) 2025 EclipseSource and others.
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

import { load } from 'js-yaml';
import { CommandPromptFragmentMetadata } from '../common';

/**
 * Result of parsing a template file that may contain YAML front matter
 */
export interface ParsedTemplate {
    /** The template content (without front matter) */
    template: string;

    /** Parsed metadata from YAML front matter, if present */
    metadata?: CommandPromptFragmentMetadata;
}

/**
 * Type guard to check if an object is valid TemplateMetadata
 */
export function isTemplateMetadata(obj: unknown): obj is CommandPromptFragmentMetadata {
    if (!obj || typeof obj !== 'object') {
        return false;
    }
    const metadata = obj as Record<string, unknown>;
    return (
        (metadata.isCommand === undefined || typeof metadata.isCommand === 'boolean') &&
        (metadata.commandName === undefined || typeof metadata.commandName === 'string') &&
        (metadata.commandDescription === undefined || typeof metadata.commandDescription === 'string') &&
        (metadata.commandArgumentHint === undefined || typeof metadata.commandArgumentHint === 'string') &&
        (metadata.commandAgents === undefined || (Array.isArray(metadata.commandAgents) &&
            metadata.commandAgents.every(agent => typeof agent === 'string')))
    );
}

/**
 * Parses a template file that may contain YAML front matter.
 *
 * Front matter format:
 * ```
 * ---
 * isCommand: true
 * commandName: mycommand
 * commandDescription: My command description
 * commandArgumentHint: <arg1> <arg2>
 * commandAgents:
 *   - Agent1
 *   - Agent2
 * ---
 * Template content here
 * ```
 *
 * @param fileContent The raw file content to parse
 * @returns ParsedTemplate containing the template content and optional metadata
 */
export function parseTemplateWithMetadata(fileContent: string): ParsedTemplate {
    const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = fileContent.match(frontMatterRegex);

    if (!match) {
        // No front matter, return content as-is
        return { template: fileContent };
    }

    try {
        const yamlContent = match[1];
        const template = match[2];
        const parsedYaml = load(yamlContent);

        // Validate the parsed YAML is an object
        if (!parsedYaml || typeof parsedYaml !== 'object') {
            return { template: fileContent };
        }

        const metadata = parsedYaml as Record<string, unknown>;

        // Extract and validate command metadata
        const templateMetadata: CommandPromptFragmentMetadata = {
            isCommand: typeof metadata.isCommand === 'boolean' ? metadata.isCommand : undefined,
            commandName: typeof metadata.commandName === 'string' ? metadata.commandName : undefined,
            commandDescription: typeof metadata.commandDescription === 'string' ? metadata.commandDescription : undefined,
            commandArgumentHint: typeof metadata.commandArgumentHint === 'string' ? metadata.commandArgumentHint : undefined,
            commandAgents: Array.isArray(metadata.commandAgents) ? metadata.commandAgents.filter(a => typeof a === 'string') : undefined,
        };

        // Only include metadata if it's valid
        if (isTemplateMetadata(templateMetadata)) {
            return { template, metadata: templateMetadata };
        }

        // Metadata validation failed, return just the template
        return { template };
    } catch (error) {
        console.error('Failed to parse front matter:', error);
        // Return entire content if YAML parsing fails
        return { template: fileContent };
    }
}
