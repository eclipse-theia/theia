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

/**
 * Maximum length for exact command patterns offered in dropdown menus.
 * Commands longer than this are too specific to be useful as allowlist/denylist entries.
 */
const MAX_EXACT_PATTERN_LENGTH = 50;

/**
 * A suggestion for one or more patterns to add to the allowlist or denylist.
 * When a suggestion contains multiple patterns, all of them are added together
 * (e.g., "find *" and "head *" for a piped command).
 */
export interface PatternSuggestion {
    patterns: string[];
}

/**
 * Generates allowlist/denylist pattern suggestions from parsed sub-commands.
 *
 * Suggestions are ordered from broadest to most specific:
 * 1. First-word prefix (e.g., "git *") — if all sub-commands share the first word
 * 2. First-two-words prefix (e.g., "git log *") — if all share the first two words
 * 3. Combined prefixes (e.g., ["find *", "head *"]) — if exactly 2 sub-commands
 *    with different first words. Single-word sub-commands use the exact command.
 * 4. Exact match — only for single sub-commands shorter than 50 characters
 *
 * For allow: use suggestions as-is (combined means both patterns are needed).
 * For deny: flatten combined suggestions into individual patterns (either suffices).
 *
 * Examples (with pre-parsed sub-commands):
 * - `["git log --oneline -20"]` → `[{["git *"]}, {["git log *"]}, {["git log --oneline -20"]}]`
 * - `["git rev-parse --show-toplevel", "git log -n 15 ..."]` → `[{["git *"]}]`
 * - `["npm run build", "npm run test"]` → `[{["npm *"]}, {["npm run *"]}]`
 * - `["find . -name '*.ts'", "head -5"]` → `[{["find *", "head *"]}]`
 * - `["find . -type f", "sort"]` → `[{["find *", "sort"]}]`
 * - `["git status", "npm test"]` → `[{["git *", "npm *"]}]`
 * - `["ls"]` → `[{["ls"]}]`
 */
export function generateCommandPatterns(subCommands: string[]): PatternSuggestion[] {
    const suggestions: PatternSuggestion[] = [];

    const parsed = subCommands
        .map(cmd => {
            const trimmed = cmd.trim();
            return { full: trimmed, words: trimmed.split(/\s+/) };
        })
        .filter(p => p.full.length > 0);

    if (parsed.length === 0) {
        return suggestions;
    }

    const firstWord = parsed[0].words[0];
    const allShareFirstWord = parsed.every(p => p.words[0] === firstWord);
    const allHaveMultipleWords = parsed.every(p => p.words.length >= 2);

    if (allShareFirstWord && allHaveMultipleWords) {
        // All sub-commands share the same first word
        suggestions.push({ patterns: [firstWord + ' *'] });

        const secondWord = parsed[0].words[1];
        const allShareSecondWord = parsed.every(p => p.words[1] === secondWord);

        if (allShareSecondWord && parsed.every(p => p.words.length >= 3)) {
            suggestions.push({ patterns: [firstWord + ' ' + secondWord + ' *'] });
        }
    } else if (parsed.length === 2) {
        // Exactly 2 sub-commands with different first words: combined prefixes.
        // Single-word sub-commands use the exact command; multi-word ones use first-word prefix.
        const pattern0 = parsed[0].words.length >= 2 ? parsed[0].words[0] + ' *' : parsed[0].full;
        const pattern1 = parsed[1].words.length >= 2 ? parsed[1].words[0] + ' *' : parsed[1].full;
        suggestions.push({ patterns: [pattern0, pattern1] });
    }

    // Exact match: only for single sub-commands (no compound commands) and short enough
    if (parsed.length === 1 && parsed[0].full.length <= MAX_EXACT_PATTERN_LENGTH) {
        suggestions.push({ patterns: [parsed[0].full] });
    }

    return suggestions;
}

/**
 * Flattens combined suggestions into individual single-pattern suggestions.
 * Useful for deny dropdowns where matching any single sub-command is sufficient.
 */
export function flattenSuggestions(suggestions: PatternSuggestion[]): PatternSuggestion[] {
    const seen = new Set<string>();
    const result: PatternSuggestion[] = [];
    for (const suggestion of suggestions) {
        for (const pattern of suggestion.patterns) {
            if (!seen.has(pattern)) {
                seen.add(pattern);
                result.push({ patterns: [pattern] });
            }
        }
    }
    return result;
}
