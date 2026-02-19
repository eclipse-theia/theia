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

import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';

const SHORT_STRING_THRESHOLD = 50;
const MAX_CONDENSED_LENGTH = 80;
const MAX_CONDENSED_VALUE_LENGTH = 30;

// --- Helpers ---

function escapeInline(value: string): string {
    return value.replace(/`/g, '\\`');
}

function truncateString(value: string, maxLength: number): string {
    return value.length > maxLength ? value.substring(0, maxLength) + '\u2026' : value;
}

function isShortString(value: string): boolean {
    return value.length <= SHORT_STRING_THRESHOLD && !value.includes('\n');
}

function isOneLineString(value: string): boolean {
    return !value.includes('\n');
}

/** Render a value as inline code: `value` */
function appendInline(md: MarkdownStringImpl, value: unknown): void {
    const text = typeof value === 'string' ? escapeInline(value) : String(value);
    md.appendMarkdown(`\`${text}\`\n\n`);
}

// eslint-disable-next-line no-null/no-null
type Primitive = string | number | boolean | null;

function isPrimitive(value: unknown): value is Primitive {
    const t = typeof value;
    // eslint-disable-next-line no-null/no-null
    return t === 'string' || t === 'number' || t === 'boolean' || value === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && !!value && !Array.isArray(value);
}

/**
 * Whether an object contains string values that benefit from code-block rendering
 * (i.e. long/multiline strings).
 */
function shouldExpandEntries(obj: Record<string, unknown>): boolean {
    return Object.values(obj).some(v => typeof v === 'string' && !isShortString(v));
}

/** Whether a value should be rendered as inline code rather than a code block. */
function shouldRenderInline(value: unknown): boolean {
    return isPrimitive(value) && (typeof value !== 'string' || isOneLineString(value));
}

// --- Markdown rendering ---

/**
 * Render a value to markdown.
 */
function formatValue(value: unknown, md: MarkdownStringImpl): void {
    if (typeof value === 'string') {
        if (isShortString(value)) {
            appendInline(md, value);
        } else {
            md.appendCodeblock('', value);
        }
    } else if (Array.isArray(value)) {
        formatArray(value, md);
    } else if (isRecord(value)) {
        if (shouldExpandEntries(value)) {
            formatEntries(Object.entries(value), md);
        } else {
            md.appendCodeblock('json', JSON.stringify(value, undefined, 2));
        }
    } else {
        appendInline(md, value);
    }
}

function formatArray(arr: unknown[], md: MarkdownStringImpl): void {
    if (arr.length === 0) {
        appendInline(md, '[]');
        return;
    }
    // Array of primitives — render as JSON array
    if (arr.every(item => isPrimitive(item))) {
        md.appendCodeblock('json', JSON.stringify(arr, undefined, 2));
        return;
    }
    // Array of objects with expandable string values — render each item's entries
    if (arr.every(item => isRecord(item))) {
        for (let i = 0; i < arr.length; i++) {
            if (arr.length > 1) {
                md.appendMarkdown(`**\\[${i}\\]**\n\n`);
            }
            formatEntries(Object.entries(arr[i] as Record<string, unknown>), md, undefined, true);
            if (i < arr.length - 1) {
                md.appendMarkdown('---\n\n');
            }
        }
        return;
    }
    // Fallback: dump as JSON
    md.appendCodeblock('json', JSON.stringify(arr, undefined, 2));
}

/** Render key-value entries with bold keys, optionally separated by horizontal rules. */
function formatEntries(entries: [string, unknown][], md: MarkdownStringImpl, separator?: string, stringCodeBlocks?: boolean): void {
    for (let i = 0; i < entries.length; i++) {
        if (separator && i > 0) {
            md.appendMarkdown(separator);
        }
        const [key, value] = entries[i];
        md.appendMarkdown(`**${key}:** `);
        if (stringCodeBlocks && typeof value === 'string') {
            md.appendMarkdown('\n\n');
            md.appendCodeblock('', value);
        } else if (!shouldRenderInline(value)) {
            md.appendMarkdown('\n\n');
            formatValue(value, md);
        } else {
            appendInline(md, value);
        }
    }
}

// --- Public API ---

export function formatArgsForTooltip(args: string): MarkdownStringImpl {
    const md = new MarkdownStringImpl();
    let parsed: unknown;
    try {
        parsed = JSON.parse(args);
    } catch {
        md.appendCodeblock('', args);
        return md;
    }
    if (!isRecord(parsed)) {
        formatValue(parsed, md);
        return md;
    }
    const entries = Object.entries(parsed);
    formatEntries(entries, md, '---\n\n');
    return md;
}

export function condenseArguments(args: string): string | undefined {
    if (!args || !args.trim() || args.trim() === '{}') {
        return undefined;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(args);
    } catch {
        return truncateString(args, MAX_CONDENSED_LENGTH);
    }
    if (!isRecord(parsed)) {
        const str = JSON.stringify(parsed);
        return truncateString(str, MAX_CONDENSED_LENGTH);
    }
    const entries = Object.entries(parsed);
    if (entries.length === 0) {
        return undefined;
    }
    const formatVal = (value: unknown): string => {
        if (typeof value === 'string') {
            return truncateString(value, MAX_CONDENSED_VALUE_LENGTH);
        } else if (Array.isArray(value)) {
            return '[\u2026]';
        } else if (typeof value === 'object' && !!value) {
            return '{\u2026}';
        }
        return String(value);
    };
    if (entries.length === 1) {
        return truncateString(formatVal(entries[0][1]), MAX_CONDENSED_LENGTH);
    }
    const joined = entries.map(([key, value]) => `${key}: ${formatVal(value)}`).join(', ');
    return truncateString(joined, MAX_CONDENSED_LENGTH);
}
