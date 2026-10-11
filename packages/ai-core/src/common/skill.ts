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

import { parseFrontmatter } from './frontmatter';

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
    /**
     * What the runtime and the model address this skill by: `name` for a built-in root,
     * `<qualifier>:<name>` for a contributed one. Unlike `name` this is unique across all discovered
     * skills, which is why it keys the registry.
     */
    qualifiedName: string;
}

export namespace Skill {
    /**
     * Never changes what is written in `SKILL.md` - the frontmatter `name` must still equal the
     * skill's directory name; qualification is layered on top.
     */
    export function qualifyName(name: string, qualifier?: string): string {
        return qualifier ? `${qualifier}:${name}` : name;
    }

    /**
     * The qualifier of {@link Skill.qualifiedName}, or `undefined` for a skill from a built-in root.
     * Unambiguous because neither part can contain a colon: a skill name is validated as lowercase
     * kebab-case, and a qualifier has to be a single path segment.
     */
    export function qualifierOf(skill: Skill): string | undefined {
        const separatorIndex = skill.qualifiedName.indexOf(':');
        return separatorIndex < 0 ? undefined : skill.qualifiedName.substring(0, separatorIndex);
    }
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
            errors.push(`Skill name '${description.name}' must match directory name '${directoryName}'. Skipping skill.`);
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
    const { metadata, body } = parseFrontmatter<SkillDescription>(content, { isValid: SkillDescription.is });
    if (!metadata) {
        return { metadata: undefined, content };
    }
    return { metadata, content: body };
}

/** Provenance tier of a skill directory, used to dispatch tier-specific processing. */
export type SkillDirectoryTier = 'workspace' | 'configured' | 'default' | 'plugin';

/**
 * A skill directory paired with the tier it originates from.
 */
export interface SkillDirectoryEntry {
    /** Absolute filesystem path to the skill directory */
    path: string;
    /** Tier the directory belongs to */
    tier: SkillDirectoryTier;
    /**
     * Prefixes the names of skills beneath this root, as `<qualifier>:<name>`. Skills are addressed
     * by one global name, so two artifacts shipping the same skill name could not otherwise coexist -
     * and renaming the directory instead would change the artifact's content hash. Must be a single
     * path segment, so that it can be told from the skill name it is joined to.
     */
    qualifier?: string;
}

/**
 * Combines skill directories with proper priority ordering and provenance: workspace, then
 * configured, then defaults, then installed artifacts - so a directory the user controls always wins.
 * First occurrence of a path wins on duplicates; later occurrences (regardless of tier) are dropped.
 */
export function combineSkillDirectories(
    workspaceSkillsDirs: string[],
    configuredDirectories: string[],
    defaultSkillsDirs: string[],
    pluginSkillsDirs: SkillDirectoryEntry[] = []
): SkillDirectoryEntry[] {
    const seen = new Set<string>();
    const result: SkillDirectoryEntry[] = [];
    const candidates: SkillDirectoryEntry[] = [
        ...toSkillDirectoryEntries(workspaceSkillsDirs, 'workspace'),
        ...toSkillDirectoryEntries(configuredDirectories, 'configured'),
        ...toSkillDirectoryEntries(defaultSkillsDirs, 'default'),
        ...pluginSkillsDirs
    ];
    for (const candidate of candidates) {
        if (!seen.has(candidate.path)) {
            seen.add(candidate.path);
            result.push(candidate);
        }
    }
    return result;
}

function toSkillDirectoryEntries(dirs: string[], tier: SkillDirectoryTier): SkillDirectoryEntry[] {
    return dirs.map(dir => ({ path: dir, tier }));
}
