// *****************************************************************************
// Copyright (C) 2025 Maksim Kachurin.
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
import { escapeRegExpCharacters } from '../common/strings';

export const IGNORE_FILES = [
    '.gitignore',
    '.ignore',
    '.rgignore'
];

export const DEFAULT_IGNORE_PATTERNS = [
    '**/node_modules/**',
    '**/.git/**',
    '**/.svn/**',
    '**/.hg/**',
    '**/.cache/**',
    '**/.DS_Store'
];

/**
 * Cleans absolute and relative path prefixes.
 * @param path - The path to clean
 * @returns The cleaned path without leading '/' or './' prefixes
 */
export function cleanAbsRelPath(path: string): string {
    if (path.startsWith('/')) {
        return path.slice(1);
    }

    if (path.startsWith('./')) {
        return path.slice(2);
    }

    return path;
}

/**
 * Ripgrep like glob normalization
 */
export function normalizeGlob(glob: string): string {
    let neg = '';
    let root = false;

    if (glob.startsWith('!')) {
        neg = '!';
        glob = glob.slice(1);
    }

    // normalize slashes
    glob = glob.replace(/\\/g, '/');

    // trim redundant leading './' -> '/'
    if (glob.startsWith('./')) {
        glob = glob.slice(1);
    }

    // treat leading "/" as root-anchored
    if (glob.startsWith('/')) {
        root = true;
    }

    // directory pattern: "foo/" -> "foo/**"
    if (glob.endsWith('/') && !glob.endsWith('/**')) {
        glob = glob + '**';
    }

    // if not root-anchored and not already global (** at start), make it match 'anywhere'
    if (!root && !glob.startsWith('**')) {
        glob = '**/' + glob;
    }

    // collapse accidental repeats like "**/**/foo" -> "**/foo"
    glob = glob.replace(/(\*\*\/)+\*\*\//g, '**/');

    // return with negation restored
    return neg + glob;
}

// Convert patterns from dir base to root-relative git semantics.
export function prefixGitignoreLine(baseRel: string, raw: string): string | undefined {
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

/**
 * Makes a search regex from a search term string and options.
 * @param term - The search term
 * @param opts - The search options
 * - useRegExp - Whether to use regular expressions (if true, the term is treated as a regular expression)
 * - matchCase - Whether to match case
 * - matchWholeWord - Whether to match whole word
 * @returns The search regex.
 */
export function makeSearchRegex(
    term: string,
    opts: { useRegExp?: boolean; matchCase?: boolean; matchWholeWord?: boolean }
): RegExp {
    const useRegExp = !!opts.useRegExp;
    const matchCase = !!opts.matchCase;
    const matchWholeWord = !!opts.matchWholeWord;

    const flags = 'g' + (matchCase ? '' : 'i') + 'u';
    let source = useRegExp ? term : escapeRegExpCharacters(term);

    // Unicode word boundaries: letters/numbers/underscore
    if (matchWholeWord) {
        const wbL = '(?<![\\p{L}\\p{N}_])';
        const wbR = '(?![\\p{L}\\p{N}_])';
        source = `${wbL}${source}${wbR}`;
    }

    return new RegExp(source, flags);
}

/**
 * Parses a maxFileSize string (e.g., "20M", "512K", "2G", or "12345") and returns the size in bytes.
 * Accepts suffixes of K, M, or G for kilobytes, megabytes, or gigabytes, respectively.
 * If no suffix is provided, the input is treated as bytes.
 *
 * @param maxFileSize The max file size string to parse.
 * @returns The size in bytes.
 */
export function parseMaxFileSize(maxFileSize: string | undefined): number {
    const defaultSize = 20 * 1024 * 1024;

    if (!maxFileSize) {
        return defaultSize;
    }

    const trimmed = maxFileSize.trim().toUpperCase();
    const match = /^(\d+)([KMG])?$/.exec(trimmed);

    // If the format is invalid, fallback to default 20M
    if (!match) {
        return defaultSize;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
        case 'K':
            return value * 1024;
        case 'M':
            return value * 1024 * 1024;
        case 'G':
            return value * 1024 * 1024 * 1024;
        default:
            return value;
    }
}

/**
 * Checks if a text matches any of the patterns
 * @param text - The text to check
 * @param patterns - The patterns to check
 * @returns True if the text matches any of the patterns, false otherwise
 */
export function matchesPattern(text: string, patterns: string[], opts?: MinimatchOptions): boolean {
    return patterns.some(pattern => minimatch(text, pattern, opts));
}

/**
 * Processes raw gitignore file content into ignore patterns relative to the directory contains that gitignore file.
 * @param fileContent - The raw content of the gitignore file
 * @param fromPath - The directory path where the gitignore file is located
 * @returns Array of processed gitignore patterns ready to be added to an ignore instance
 */
export function processGitignoreContent(fileContent: string, fromPath: string): string[] {
    return fileContent
        .split('\n')
        .map(line => prefixGitignoreLine(fromPath, line))
        .filter((line): line is string => typeof line === 'string');
}
