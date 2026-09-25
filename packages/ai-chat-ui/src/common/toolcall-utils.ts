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
 * Tells whether `json` may already be complete, i.e. whether handing it to `JSON.parse` can succeed at all.
 *
 * Tool call arguments are rendered repeatedly while they stream in, and the arguments object is truncated
 * until the last delta arrives: `JSON.parse` would scan the whole string only to throw, which gets quadratic
 * as the arguments grow (noticeable with large payloads such as whole-file writes). An arguments object can
 * only be complete once it ends with `}`, so callers skip the parse until then. Text that does not start
 * with `{` is not a streaming arguments object and is always considered worth parsing.
 */
export function mayBeCompleteJson(json: string): boolean {
    const trimmed = json.trim();
    return !trimmed.startsWith('{') || trimmed.endsWith('}');
}

/**
 * Extracts a string field value from potentially incomplete JSON.
 * Uses JSON.parse for complete JSON, and a scan of the top-level entries for streaming scenarios.
 */
export function extractJsonStringField(json: string | undefined, fieldName: string): string | undefined {
    if (!json) {
        return undefined;
    }
    if (mayBeCompleteJson(json)) {
        try {
            const parsed = JSON.parse(json);
            if (parsed && typeof parsed === 'object' && fieldName in parsed && typeof parsed[fieldName] === 'string') {
                return parsed[fieldName];
            }
            return undefined;
        } catch {
            // fall through to the streaming extraction
        }
    }
    return extractTopLevelStringField(json, fieldName);
}

const BACKSLASH = 92;

/** A JSON string token, which may be cut off by the end of a streaming payload. */
interface ScannedString {
    /** The index right after the last character of the body, i.e. the end of the still escaped contents. */
    bodyEnd: number;
    /** The index right after the closing quote, or the end of the input if there is none yet. */
    end: number;
    /** Whether the closing quote was found. */
    terminated: boolean;
}

/**
 * Extracts a top-level string field from a truncated JSON object by walking its entries.
 *
 * A regex over the whole payload cannot tell nesting apart, so it reports the first `"<field>": "..."` anywhere,
 * including one inside a nested object or array - a `{"edits": [{"path": "a"}], "path": "b"` argument object would
 * be labelled with `a`. Walking the entries skips over nested values and over string contents, so only the keys of
 * the arguments object itself can match, and escapes within the value are resolved instead of ending it early.
 *
 * Values are skipped with `indexOf`, which keeps large payloads (e.g. whole-file writes) a native scan.
 */
function extractTopLevelStringField(json: string, fieldName: string): string | undefined {
    let index = skipWhitespace(json, 0);
    if (json[index] !== '{') {
        // tool call arguments are always an object; anything else has no top-level field to report
        return undefined;
    }
    index = skipWhitespace(json, index + 1);
    while (index < json.length && json[index] !== '}') {
        if (json[index] !== '"') {
            return undefined;
        }
        const keyStart = index;
        const key = readString(json, index);
        if (!key.terminated) {
            return undefined;
        }
        index = skipWhitespace(json, key.end);
        if (json[index] !== ':') {
            return undefined;
        }
        index = skipWhitespace(json, index + 1);
        if (index >= json.length) {
            return undefined;
        }
        const matches = matchesKey(json, keyStart, key, fieldName);
        if (json[index] === '"') {
            const value = readString(json, index);
            if (matches) {
                return unescapeJsonStringContent(json.substring(index + 1, value.bodyEnd), value.terminated);
            }
            if (!value.terminated) {
                return undefined;
            }
            index = value.end;
        } else {
            if (matches) {
                // the field is present, but not a string - same as what the JSON.parse branch reports
                return undefined;
            }
            const end = skipValue(json, index);
            if (end < 0) {
                return undefined;
            }
            index = end;
        }
        index = skipWhitespace(json, index);
        if (json[index] === ',') {
            index = skipWhitespace(json, index + 1);
        }
    }
    return undefined;
}

/**
 * Reads the string token starting at `start`, which must be a quote.
 *
 * The closing quote is searched with `indexOf`, so the body - up to megabytes of file content - is skipped by a native
 * scan rather than a per-character loop, and only escaped quotes cost an iteration. Only the bounds are reported: the
 * body of a value that is merely skipped over is never materialized.
 */
function readString(json: string, start: number): ScannedString {
    let index = start + 1;
    for (;;) {
        const quote = json.indexOf('"', index);
        if (quote < 0) {
            return { bodyEnd: json.length, end: json.length, terminated: false };
        }
        if (!isEscaped(json, quote)) {
            return { bodyEnd: quote, end: quote + 1, terminated: true };
        }
        index = quote + 1;
    }
}

/** Skips the non-string value starting at `start`, returning the index right after it, or `-1` if it is still streaming. */
function skipValue(json: string, start: number): number {
    let index = start;
    if (json[index] === '{' || json[index] === '[') {
        let depth = 0;
        while (index < json.length) {
            const character = json[index];
            if (character === '"') {
                const contained = readString(json, index);
                if (!contained.terminated) {
                    return -1;
                }
                index = contained.end;
                continue;
            }
            if (character === '{' || character === '[') {
                depth++;
            } else if (character === '}' || character === ']') {
                depth--;
                if (depth === 0) {
                    return index + 1;
                }
            }
            index++;
        }
        return -1;
    }
    while (index < json.length && json[index] !== ',' && json[index] !== '}') {
        index++;
    }
    return index < json.length ? index : -1;
}

function skipWhitespace(json: string, start: number): number {
    let index = start;
    while (index < json.length) {
        const character = json[index];
        if (character !== ' ' && character !== '\n' && character !== '\r' && character !== '\t') {
            break;
        }
        index++;
    }
    return index;
}

/** Tells whether the character at `index` is preceded by an odd number of backslashes, i.e. whether it is escaped. */
function isEscaped(text: string, index: number): boolean {
    let backslashes = 0;
    while (index - backslashes > 0 && text.charCodeAt(index - backslashes - 1) === BACKSLASH) {
        backslashes++;
    }
    return backslashes % 2 === 1;
}

/** Compares a scanned key against the wanted field name, resolving escapes only in the rare case that the key has any. */
function matchesKey(json: string, keyStart: number, key: ScannedString, fieldName: string): boolean {
    const raw = json.substring(keyStart + 1, key.bodyEnd);
    return (raw.indexOf('\\') < 0 ? raw : unescapeJsonStringContent(raw, true)) === fieldName;
}

/** Resolves the escapes of a JSON string body, dropping the escape the stream was cut off in the middle of. */
function unescapeJsonStringContent(raw: string, terminated: boolean): string {
    const content = terminated ? raw : dropIncompleteEscape(raw);
    try {
        return JSON.parse('"' + content + '"');
    } catch {
        // control characters and other invalid contents: the raw text is still the best label we have
        return content;
    }
}

/** Drops a trailing escape sequence that has not fully arrived yet, so that the value can be unescaped. */
function dropIncompleteEscape(raw: string): string {
    let backslashes = 0;
    while (backslashes < raw.length && raw.charCodeAt(raw.length - backslashes - 1) === BACKSLASH) {
        backslashes++;
    }
    if (backslashes % 2 === 1) {
        return raw.substring(0, raw.length - 1);
    }
    const unicodeEscape = /\\u[0-9a-fA-F]{0,3}$/.exec(raw);
    if (unicodeEscape && !isEscaped(raw, unicodeEscape.index)) {
        return raw.substring(0, unicodeEscape.index);
    }
    return raw;
}
