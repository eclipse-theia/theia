// *****************************************************************************
// Copyright (C) 2025 TypeFox and others.
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
 * Lightweight ANSI escape code parser for the Output view.
 *
 * Parses ANSI SGR (Select Graphic Rendition) sequences from text,
 * strips them, and returns decoration segments with CSS class names
 * matching the existing `ansi.css` classes from `@theia/core`.
 */

const FOREGROUND_COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const;

export interface AnsiState {
    foreground?: string;
    background?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
}

export interface AnsiSegment {
    start: number;
    end: number;
    cssClasses: string;
}

export interface AnsiParseResult {
    strippedText: string;
    segments: AnsiSegment[];
    state: AnsiState;
}

// Matches ANSI escape sequences: ESC[ ... m (SGR) and other CSI sequences
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

function getCssClasses(state: AnsiState): string {
    const classes: string[] = [];
    if (state.foreground) {
        classes.push(state.foreground);
    }
    if (state.background) {
        classes.push(state.background);
    }
    if (state.bold) {
        classes.push('ansi-bold');
    }
    if (state.italic) {
        classes.push('ansi-italic');
    }
    if (state.underline) {
        classes.push('ansi-underline');
    }
    return classes.join(' ');
}

function applyAnsiCode(code: number, state: AnsiState): void {
    if (code === 0) {
        // Reset all
        state.foreground = undefined;
        state.background = undefined;
        state.bold = undefined;
        state.italic = undefined;
        state.underline = undefined;
    } else if (code === 1) {
        state.bold = true;
    } else if (code === 3) {
        state.italic = true;
    } else if (code === 4) {
        state.underline = true;
    } else if (code === 22) {
        state.bold = undefined;
    } else if (code === 23) {
        state.italic = undefined;
    } else if (code === 24) {
        state.underline = undefined;
    } else if (code >= 30 && code <= 37) {
        state.foreground = `ansi-${FOREGROUND_COLORS[code - 30]}-fg`;
    } else if (code === 39) {
        state.foreground = undefined;
    } else if (code >= 40 && code <= 47) {
        state.background = `ansi-${FOREGROUND_COLORS[code - 40]}-bg`;
    } else if (code === 49) {
        state.background = undefined;
    } else if (code >= 90 && code <= 97) {
        state.foreground = `ansi-bright-${FOREGROUND_COLORS[code - 90]}-fg`;
    } else if (code >= 100 && code <= 107) {
        state.background = `ansi-bright-${FOREGROUND_COLORS[code - 100]}-bg`;
    }
}

/**
 * Parse ANSI escape codes from text, strip them, and return decoration segments.
 *
 * @param text The raw text potentially containing ANSI escape codes
 * @param initialState The ANSI state carried over from a previous parse call
 * @returns The stripped text, decoration segments, and the final ANSI state
 */
export function parseAnsi(text: string, initialState: AnsiState = {}): AnsiParseResult {
    const state: AnsiState = { ...initialState };
    const segments: AnsiSegment[] = [];
    let strippedText = '';
    let lastIndex = 0;
    let currentSegmentStart = 0;
    let currentClasses = getCssClasses(state);

    ANSI_ESCAPE_RE.lastIndex = 0;
    let match: RegExpExecArray | undefined;
    while ((match = ANSI_ESCAPE_RE.exec(text) ?? undefined) !== undefined) {
        // Append text before this escape sequence
        const textBefore = text.substring(lastIndex, match.index);
        strippedText += textBefore;

        // If we had an active style and there's text, the segment continues
        // Now process the escape sequence to potentially change state
        const escapeContent = match[0].slice(2, -1); // Strip ESC[ and m
        const codes = escapeContent.length === 0 ? [0] : escapeContent.split(';').map(Number);

        // Before changing state, close current segment if there's styled text
        const newOffset = strippedText.length;
        if (currentClasses && newOffset > currentSegmentStart) {
            segments.push({ start: currentSegmentStart, end: newOffset, cssClasses: currentClasses });
        }

        for (const code of codes) {
            applyAnsiCode(code, state);
        }

        currentClasses = getCssClasses(state);
        currentSegmentStart = newOffset;
        lastIndex = match.index + match[0].length;
    }

    // Append remaining text after last escape sequence
    strippedText += text.substring(lastIndex);

    // Close final segment if there's styled text remaining
    if (currentClasses && strippedText.length > currentSegmentStart) {
        segments.push({ start: currentSegmentStart, end: strippedText.length, cssClasses: currentClasses });
    }

    return { strippedText, segments, state };
}
