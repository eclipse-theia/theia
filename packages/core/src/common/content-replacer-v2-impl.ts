// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ContentReplacer, Replacement } from './content-replacer';

/**
 * Represents a match with its position and the actual matched content
 */
interface MatchInfo {
    startIndex: number;
    endIndex: number;
    matchedContent: string;
}

/**
 * Result of finding matches
 */
interface MatchResult {
    matches: MatchInfo[];
    strategy: string;
}

export class ContentReplacerV2Impl implements ContentReplacer {
    /**
     * Applies a list of replacements to the original content using a multi-step matching strategy with improved flexibility.
     * @param originalContent The original file content.
     * @param replacements Array of Replacement objects.
     * @returns An object containing the updated content and any error messages.
     */
    applyReplacements(originalContent: string, replacements: Replacement[]): { updatedContent: string, errors: string[] } {
        let updatedContent = originalContent;
        const errorMessages: string[] = [];

        // Guard against conflicting replacements: if the same oldContent appears with different newContent, return with an error.
        const conflictMap = new Map<string, string>();
        for (const replacement of replacements) {
            if (conflictMap.has(replacement.oldContent) && conflictMap.get(replacement.oldContent) !== replacement.newContent) {
                return { updatedContent: originalContent, errors: [`Conflicting replacement values for: "${replacement.oldContent}"`] };
            }
            conflictMap.set(replacement.oldContent, replacement.newContent);
        }

        replacements.forEach(({ oldContent, newContent, multiple }) => {
            // If the old content is empty, prepend the new content to the beginning of the file (e.g. in new file)
            if (oldContent === '') {
                updatedContent = newContent + updatedContent;
                return;
            }

            // Try multiple matching strategies
            const matchResult = this.findMatches(updatedContent, oldContent);

            if (matchResult.matches.length === 0) {
                const truncatedOld = this.truncateForError(oldContent);
                errorMessages.push(`Content to replace not found: "${truncatedOld}"`);
            } else if (matchResult.matches.length > 1) {
                if (multiple) {
                    updatedContent = this.replaceAllMatches(updatedContent, matchResult.matches, newContent);
                } else {
                    const truncatedOld = this.truncateForError(oldContent);
                    errorMessages.push(`Multiple occurrences found for: "${truncatedOld}". Set 'multiple' to true if multiple occurrences of the oldContent are expected to be\
                         replaced at once.`);
                }
            } else {
                updatedContent = this.replaceSingleMatch(updatedContent, matchResult.matches[0], newContent);
            }
        });

        return { updatedContent, errors: errorMessages };
    }

    /**
     * Normalizes line endings to LF
     */
    private normalizeLineEndings(text: string): string {
        return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    /**
     * Finds matches using multiple strategies with increasing flexibility
     */
    private findMatches(content: string, search: string): MatchResult {
        // Strategy 1: Exact match
        const exactMatches = this.findExactMatches(content, search);
        if (exactMatches.length > 0) {
            return { matches: exactMatches, strategy: 'exact' };
        }

        // Strategy 2: Match with normalized line endings
        const normalizedMatches = this.findNormalizedLineEndingMatches(content, search);
        if (normalizedMatches.length > 0) {
            return { matches: normalizedMatches, strategy: 'normalized-line-endings' };
        }

        // Strategy 3: Single line trimmed match (for backward compatibility)
        const lineTrimmedMatches = this.findLineTrimmedMatches(content, search);
        if (lineTrimmedMatches.length > 0) {
            return { matches: lineTrimmedMatches, strategy: 'line-trimmed' };
        }

        // Strategy 4: Multi-line fuzzy match with trimmed comparison
        const fuzzyMatches = this.findFuzzyMultilineMatches(content, search);
        if (fuzzyMatches.length > 0) {
            return { matches: fuzzyMatches, strategy: 'fuzzy-multiline' };
        }

        return { matches: [], strategy: 'none' };
    }

    /**
     * Finds all exact matches of a substring within a string.
     */
    private findExactMatches(content: string, search: string): MatchInfo[] {
        const matches: MatchInfo[] = [];
        let startIndex = 0;

        while ((startIndex = content.indexOf(search, startIndex)) !== -1) {
            matches.push({
                startIndex,
                endIndex: startIndex + search.length,
                matchedContent: search
            });
            startIndex += search.length;
        }

        return matches;
    }

    /**
     * Finds matches after normalizing line endings
     */
    private findNormalizedLineEndingMatches(content: string, search: string): MatchInfo[] {
        const normalizedContent = this.normalizeLineEndings(content);
        const normalizedSearch = this.normalizeLineEndings(search);

        const matches: MatchInfo[] = [];
        let startIndex = 0;

        while ((startIndex = normalizedContent.indexOf(normalizedSearch, startIndex)) !== -1) {
            // Map back to original content position
            const originalStartIndex = this.mapNormalizedPositionToOriginal(content, startIndex);
            const originalEndIndex = this.mapNormalizedPositionToOriginal(content, startIndex + normalizedSearch.length);

            matches.push({
                startIndex: originalStartIndex,
                endIndex: originalEndIndex,
                matchedContent: content.substring(originalStartIndex, originalEndIndex)
            });
            startIndex += normalizedSearch.length;
        }

        return matches;
    }

    /**
     * Maps a position in normalized content back to the original content
     */
    private mapNormalizedPositionToOriginal(originalContent: string, normalizedPosition: number): number {
        let originalPos = 0;
        let normalizedPos = 0;

        while (normalizedPos < normalizedPosition && originalPos < originalContent.length) {
            if (originalPos + 1 < originalContent.length &&
                originalContent[originalPos] === '\r' &&
                originalContent[originalPos + 1] === '\n') {
                // CRLF in original maps to single LF in normalized
                originalPos += 2;
                normalizedPos += 1;
            } else if (originalContent[originalPos] === '\r') {
                // Single CR in original maps to LF in normalized
                originalPos += 1;
                normalizedPos += 1;
            } else {
                // All other characters map 1:1
                originalPos += 1;
                normalizedPos += 1;
            }
        }

        return originalPos;
    }

    /**
     * Attempts to find matches by trimming whitespace from lines (single line only, for backward compatibility)
     */
    private findLineTrimmedMatches(content: string, search: string): MatchInfo[] {
        const trimmedSearch = search.trim();
        const lines = content.split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
            const trimmedLine = lines[i].trim();
            if (trimmedLine === trimmedSearch) {
                // Calculate the starting index of this line in the original content
                const startIndex = this.getLineStartIndex(content, i);
                const endIndex = startIndex + lines[i].length;
                return [{
                    startIndex,
                    endIndex,
                    matchedContent: lines[i]
                }];
            }
        }

        return [];
    }

    /**
     * Finds matches using fuzzy multi-line comparison with trimmed lines
     */
    private findFuzzyMultilineMatches(content: string, search: string): MatchInfo[] {
        // Extract non-empty lines from search for matching
        const searchLines = search.split(/\r?\n/);
        const nonEmptySearchLines = searchLines
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (nonEmptySearchLines.length === 0) { return []; }

        const contentLines = content.split(/\r?\n/);
        const matches: MatchInfo[] = [];

        // Try to find sequences in content that match all non-empty lines from search
        for (let contentStart = 0; contentStart < contentLines.length; contentStart++) {
            // First, check if this could be a valid starting position
            const startLineTrimmed = contentLines[contentStart].trim();
            if (startLineTrimmed.length === 0 || startLineTrimmed !== nonEmptySearchLines[0]) {
                continue;
            }

            let searchIndex = 1; // We already matched the first line
            let contentIndex = contentStart + 1;
            let lastMatchedLine = contentStart;

            // Try to match remaining non-empty lines from search
            while (searchIndex < nonEmptySearchLines.length && contentIndex < contentLines.length) {
                const contentLineTrimmed = contentLines[contentIndex].trim();

                if (contentLineTrimmed.length === 0) {
                    // Skip empty lines in content
                    contentIndex++;
                } else if (contentLineTrimmed === nonEmptySearchLines[searchIndex]) {
                    // Found a match
                    lastMatchedLine = contentIndex;
                    searchIndex++;
                    contentIndex++;
                } else {
                    // No match, this starting position doesn't work
                    break;
                }
            }

            // Check if we matched all non-empty lines
            if (searchIndex === nonEmptySearchLines.length) {
                const startIndex = this.getLineStartIndex(content, contentStart);
                const endIndex = this.getLineEndIndex(content, lastMatchedLine);

                matches.push({
                    startIndex,
                    endIndex,
                    matchedContent: content.substring(startIndex, endIndex)
                });
            }
        }

        return matches;
    }

    /**
     * Calculates the starting index of a specific line number in the content.
     */
    private getLineStartIndex(content: string, lineNumber: number): number {
        if (lineNumber === 0) { return 0; }

        let index = 0;
        let currentLine = 0;

        while (currentLine < lineNumber && index < content.length) {
            if (content[index] === '\r' && index + 1 < content.length && content[index + 1] === '\n') {
                index += 2; // CRLF
                currentLine++;
            } else if (content[index] === '\r' || content[index] === '\n') {
                index += 1; // CR or LF
                currentLine++;
            } else {
                index += 1;
            }
        }

        return index;
    }

    /**
     * Calculates the ending index of a specific line number in the content (including the line).
     */
    private getLineEndIndex(content: string, lineNumber: number): number {
        const lines = content.split(/\r?\n/);
        if (lineNumber >= lines.length) {
            return content.length;
        }

        let index = 0;
        for (let i = 0; i <= lineNumber; i++) {
            index += lines[i].length;
            if (i < lineNumber) {
                // Add line ending length
                const searchPos = index;
                if (content.indexOf('\r\n', searchPos) === searchPos) {
                    index += 2; // CRLF
                } else if (index < content.length && (content[index] === '\r' || content[index] === '\n')) {
                    index += 1; // CR or LF
                }
            }
        }

        return index;
    }

    /**
     * Replaces a single match while preserving indentation
     */
    private replaceSingleMatch(content: string, match: MatchInfo, newContent: string): string {
        const beforeMatch = content.substring(0, match.startIndex);
        const afterMatch = content.substring(match.endIndex);

        // Detect the line ending style from entire original content, not just the match
        const originalLineEnding = content.includes('\r\n') ? '\r\n' :
            content.includes('\r') ? '\r' : '\n';

        // Convert line endings in newContent to match original
        const newContentWithCorrectLineEndings = this.convertLineEndings(newContent, originalLineEnding);

        // Preserve indentation from the matched content
        const preservedReplacement = this.preserveIndentation(match.matchedContent, newContentWithCorrectLineEndings, originalLineEnding);

        return beforeMatch + preservedReplacement + afterMatch;
    }

    /**
     * Replaces all matches
     */
    private replaceAllMatches(content: string, matches: MatchInfo[], newContent: string): string {
        // Sort matches by position (descending) to avoid position shifts
        const sortedMatches = [...matches].sort((a, b) => b.startIndex - a.startIndex);

        // Detect the line ending style from entire original content
        const originalLineEnding = content.includes('\r\n') ? '\r\n' :
            content.includes('\r') ? '\r' : '\n';

        let result = content;
        for (const match of sortedMatches) {
            const beforeMatch = result.substring(0, match.startIndex);
            const afterMatch = result.substring(match.endIndex);

            // Convert line endings in newContent to match original
            const newContentWithCorrectLineEndings = this.convertLineEndings(newContent, originalLineEnding);

            const preservedReplacement = this.preserveIndentation(match.matchedContent, newContentWithCorrectLineEndings, originalLineEnding);
            result = beforeMatch + preservedReplacement + afterMatch;
        }

        return result;
    }

    /**
     * Preserves the indentation from the original content when applying the replacement
     */
    private preserveIndentation(originalContent: string, newContent: string, lineEnding: string): string {
        const originalLines = originalContent.split(/\r?\n/);
        const newLines = newContent.split(/\r?\n/);

        if (originalLines.length === 0 || newLines.length === 0) {
            return newContent;
        }

        // Find first non-empty line in original to get base indentation
        let originalBaseIndent = '';
        let originalUseTabs = false;
        for (const line of originalLines) {
            if (line.trim().length > 0) {
                originalBaseIndent = line.match(/^\s*/)?.[0] || '';
                originalUseTabs = originalBaseIndent.includes('\t');
                break;
            }
        }

        // Find first non-empty line in new content to get base indentation
        let newBaseIndent = '';
        for (const line of newLines) {
            if (line.trim().length > 0) {
                newBaseIndent = line.match(/^\s*/)?.[0] || '';
                break;
            }
        }

        // Apply the indentation to all lines of new content
        const result = newLines.map(line => {
            // Empty lines remain empty
            if (line.trim().length === 0) {
                return '';
            }

            // Get current line's indentation
            const currentIndent = line.match(/^\s*/)?.[0] || '';

            // Calculate relative indentation
            let relativeIndent = currentIndent;
            if (newBaseIndent.length > 0) {
                // If the current line has at least the base indentation, preserve relative indentation
                if (currentIndent.startsWith(newBaseIndent)) {
                    relativeIndent = currentIndent.substring(newBaseIndent.length);
                } else {
                    // If current line has less indentation than base, use it as-is
                    relativeIndent = '';
                }
            }

            // Convert spaces to tabs if original uses tabs
            let convertedIndent = originalBaseIndent + relativeIndent;
            if (originalUseTabs && !relativeIndent.includes('\t')) {
                // Convert 4 spaces to 1 tab (common convention)
                convertedIndent = convertedIndent.replace(/    /g, '\t');
            }

            // Apply converted indentation + trimmed content
            return convertedIndent + line.trim();
        });

        return result.join(lineEnding);
    }

    /**
     * Converts line endings in content to the specified line ending style
     */
    private convertLineEndings(content: string, lineEnding: string): string {
        // First normalize to LF
        const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Then convert to target line ending
        if (lineEnding === '\r\n') {
            return normalized.replace(/\n/g, '\r\n');
        } else if (lineEnding === '\r') {
            return normalized.replace(/\n/g, '\r');
        }
        return normalized;
    }

    /**
     * Truncates content for error messages to avoid overly long error messages
     */
    private truncateForError(content: string, maxLength: number = 100): string {
        if (content.length <= maxLength) {
            return content;
        }

        const half = Math.floor(maxLength / 2) - 3; // -3 for "..."
        return content.substring(0, half) + '...' + content.substring(content.length - half);
    }
}
