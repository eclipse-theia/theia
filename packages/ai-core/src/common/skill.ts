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

import { load } from 'js-yaml';

/**
 * The standard filename for skill definition files.
 */
export const SKILL_FILE_NAME = 'SKILL.md';

/**
 * Regular expression for valid skill names.
 * Must be lowercase kebab-case with digits allowed.
 * Examples: 'my-skill', 'skill1', 'my-skill-2'
 */
const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Maximum allowed length for skill descriptions.
 */
const MAX_DESCRIPTION_LENGTH = 1024;

/**
 * Represents the YAML frontmatter metadata from a SKILL.md file.
 */
export interface SkillDescription {
    /** Unique identifier, must match directory name, lowercase kebab-case with digits allowed */
    name: string;

    /** Human-readable description of the skill, max 1024 characters */
    description: string;

    /** Optional SPDX license identifier */
    license?: string;

    /** Optional version constraint for compatibility */
    compatibility?: string;

    /** Optional key-value pairs for additional metadata */
    metadata?: Record<string, string>;

    /** Optional experimental feature: list of allowed tool IDs */
    allowedTools?: string[];
}

export namespace SkillDescription {
    /**
     * Type guard to check if an unknown value is a valid SkillDescription.
     * Validates that required fields exist and have correct types.
     */
    export function is(entry: unknown): entry is SkillDescription {
        if (typeof entry !== 'object' || entry === undefined) {
            return false;
        }
        // eslint-disable-next-line no-null/no-null
        if (entry === null) {
            return false;
        }
        const obj = entry as Record<string, unknown>;
        return typeof obj.name === 'string' && typeof obj.description === 'string';
    }

    /**
     * Compares two SkillDescription objects for equality based on name.
     */
    export function equals(a: SkillDescription, b: SkillDescription): boolean {
        return a.name === b.name;
    }
}

/**
 * Full skill representation including location.
 */
export interface Skill extends SkillDescription {
    /** Absolute file path to the SKILL.md file */
    location: string;
}

/**
 * Validates if a skill name follows the required format.
 * Valid names are lowercase kebab-case with digits allowed.
 * No leading/trailing/consecutive hyphens.
 *
 * @param name The skill name to validate
 * @returns true if the name is valid, false otherwise
 */
export function isValidSkillName(name: string): boolean {
    return SKILL_NAME_REGEX.test(name);
}

/**
 * Validates a SkillDescription against all constraints.
 *
 * @param description The skill description to validate
 * @param directoryName The name of the directory containing the SKILL.md file
 * @returns Array of validation error messages, empty if valid
 */
export function validateSkillDescription(description: SkillDescription, directoryName: string): string[] {
    const errors: string[] = [];

    if (typeof description.name !== 'string') {
        errors.push('Skill name must be a string');
    } else {
        if (description.name !== directoryName) {
            errors.push(`Skill name '${description.name}' must match directory name '${directoryName}'`);
        }
        if (!isValidSkillName(description.name)) {
            errors.push(`Skill name '${description.name}' must be lowercase kebab-case (e.g., 'my-skill', 'skill1')`);
        }
    }

    if (typeof description.description !== 'string') {
        errors.push('Skill description must be a string');
    } else if (description.description.length > MAX_DESCRIPTION_LENGTH) {
        errors.push(`Skill description exceeds maximum length of ${MAX_DESCRIPTION_LENGTH} characters`);
    }

    return errors;
}

/**
 * Parses a SKILL.md file content, extracting YAML frontmatter metadata and markdown content.
 * @param content The raw file content
 * @returns Object with parsed metadata (if valid) and the markdown content
 */
export function parseSkillFile(content: string): { metadata: SkillDescription | undefined, content: string } {
    const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontMatterRegex);

    if (!match) {
        return { metadata: undefined, content };
    }

    try {
        const yamlContent = match[1];
        const markdownContent = match[2].trim();
        const parsedYaml = load(yamlContent);

        if (!parsedYaml || typeof parsedYaml !== 'object') {
            return { metadata: undefined, content };
        }

        // Validate that required fields are present (name and description)
        if (!SkillDescription.is(parsedYaml)) {
            return { metadata: undefined, content };
        }

        return { metadata: parsedYaml as SkillDescription, content: markdownContent };
    } catch {
        return { metadata: undefined, content };
    }
}

/**
 * Combines skill directories with proper priority ordering.
 * Workspace directory has highest priority, followed by configured directories, then default.
 * First directory wins on duplicates.
 */
export function combineSkillDirectories(
    workspaceSkillsDir: string | undefined,
    configuredDirectories: string[],
    defaultSkillsDir: string | undefined
): string[] {
    const allDirectories: string[] = [];
    if (workspaceSkillsDir) {
        allDirectories.push(workspaceSkillsDir);
    }
    for (const dir of configuredDirectories) {
        if (!allDirectories.includes(dir)) {
            allDirectories.push(dir);
        }
    }
    if (defaultSkillsDir && !allDirectories.includes(defaultSkillsDir)) {
        allDirectories.push(defaultSkillsDir);
    }
    return allDirectories;
}
