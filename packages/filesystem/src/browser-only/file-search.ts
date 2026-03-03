// *****************************************************************************
// Copyright (C) 2025 Maksim Kachurin and others.
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

import { minimatch, type MinimatchOptions } from 'minimatch';
import ignore from 'ignore';

import type URI from '@theia/core/lib/common/uri';

/**
 * Normalizes glob patterns to be consistent with ripgrep behavior.
 *
 * Examples of transformations:
 * - "*.js" -> "**\/*.js" (make non-root patterns match anywhere)
 * - "src/" -> "src\/**" (directory patterns match all contents)
 * - "!*.log" -> "!**\/*.log" (negation patterns)
 * - "src/**\/**\/file.js" -> "src/**\/file.js" (collapse repeated double-star patterns)
 *
 * @param glob - The glob pattern to normalize
 * @returns The normalized glob pattern
 */
export function normalizeGlob(glob: string): string {
    let neg = '';
    let root = false;

    // Handle negation patterns (starting with '!')
    if (glob.startsWith('!')) {
        neg = '!';
        glob = glob.slice(1);
    }

    // Convert Windows backslashes to forward slashes for consistency
    glob = glob.replace(/\\/g, '/');

    // Remove redundant './' prefix (same as current directory)
    if (glob.startsWith('./')) {
        glob = glob.slice(1);
    }

    // Check if pattern is root-anchored (starts with '/')
    if (glob.startsWith('/')) {
        root = true;
    }

    // Convert directory patterns to match all contents
    // "src/" becomes "src/**" to match everything inside the directory
    if (glob.endsWith('/') && !glob.endsWith('/**')) {
        glob = glob + '**';
    }

    // Make non-root patterns match anywhere in the directory tree
    // "*.js" becomes "**/*.js" to match .js files anywhere
    if (!root && !glob.startsWith('**')) {
        glob = '**/' + glob;
    }

    // Clean up repeated '**/' patterns
    // "src/**/**/file.js" becomes "src/**/file.js"
    glob = glob.replace(/(\*\*\/)+\*\*\//g, '**/');

    // Restore negation prefix if it was present
    return neg + glob;
}

/**
 * Checks if a text matches any of the minimatch patterns
 * @param text - The text to check
 * @param patterns - The patterns to check
 * @returns True if the text matches any of the patterns, false otherwise
 */
export function matchesPattern(text: string, patterns: string[], opts?: MinimatchOptions): boolean {
    return patterns.some(pattern => minimatch(text, pattern, opts));
}

/**
 * Creates a new ignore pattern matcher for managing ignore patterns.
 * @returns An object with add and ignores methods
 */
export function createIgnoreMatcher(): { add: (patterns: string | string[]) => void; ignores: (path: string) => boolean } {
    const ig = ignore();

    return {
        add: (patterns: string | string[]) => ig.add(patterns),
        ignores: (path: string) => ig.ignores(path)
    };
}

/**
 * Processes ignore files (.gitignore, .ignore, .rgignore) in a directory.
 * @param dir - The directory URI to process
 * @param read - Function to read the ignore file content
 * @returns Array of processed ignore patterns relative to the directory contains that ignore file
 */
export async function getIgnorePatterns(dir: URI, read: (uri: URI) => Promise<string>): Promise<string[]> {
    const fromPath = dir.path.toString();
    const ignoreFiles = await Promise.allSettled(
        ['.gitignore', '.ignore', '.rgignore'].map(file => read(dir.resolve(file)))
    );

    const lines = ignoreFiles
        .filter(result => result.status === 'fulfilled')
        .flatMap((result: PromiseFulfilledResult<string>) =>
            result.value
                .split('\n')
                .map(line => prefixGitignoreLine(fromPath, line))
                .filter((line): line is string => typeof line === 'string')
        );

    return lines;
}

/**
 * Convert patterns from dir base to root-relative git semantics.
 * @param baseRel - The base relative path
 * @param raw - The raw pattern
 * @returns The processed pattern
 */
function prefixGitignoreLine(baseRel: string, raw: string): string | undefined {
    let line = raw.replace(/\r?\n$/, '');
    if (!line || /^\s*#/.test(line)) {
        return undefined;
    }

    // handle escaped leading '!' and '#'
    const escapedBang = line.startsWith('\\!');
    const escapedHash = line.startsWith('\\#');
    if (escapedBang || escapedHash) {
        line = line.slice(1);
    }

    const neg = !escapedBang && line.startsWith('!');
    if (neg) { line = line.slice(1); }

    // normalize slashes in the pattern part
    line = line.replace(/\\/g, '/');

    // strip leading "./"
    if (line.startsWith('./')) { line = line.slice(2); }

    const anchored = line.startsWith('/');
    const hasSlash = line.includes('/');
    const prefix = baseRel ? baseRel.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '') : '';

    let pattern: string;

    if (anchored) {
        // "/foo" in base -> "base/foo"
        pattern = (prefix ? `${prefix}${line}` : line.slice(1)); // remove leading '/' if no base
    } else if (hasSlash) {
        // "bar/*.js" in base -> "base/bar/*.js"
        pattern = prefix ? `${prefix}/${line}` : line;
    } else {
        // "foo" in base -> "base/**/foo"
        pattern = prefix ? `${prefix}/**/${line}` : line;
    }

    return neg ? `!${pattern}` : pattern;
}
