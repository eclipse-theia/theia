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
 * Structured form of a provider error string. Provider errors look something
 * like `<httpStatus> <jsonBody>` (Anthropic, OpenAI) or `<jsonBody>` (Gemini).
 * This helper makes a best-effort guess: walk the JSON, grab the deepest
 * `message` string and the first 3-digit `code`/`status` field.
 */
export interface FormattedProviderError {
    status?: string;
    message: string;
    details?: string;
    raw: string;
}

export function formatProviderError(raw: string | undefined): FormattedProviderError {
    const safeRaw = (raw ?? '').toString();
    const trimmed = safeRaw.trim();
    if (!trimmed) { return { message: safeRaw, raw: safeRaw }; }

    // Optional leading HTTP status followed by a JSON body, e.g. "401 {...}".
    // The JSON-body anchor avoids misreading arbitrary text that happens to
    // start with 3 digits (e.g. "404 routes were processed") as a status.
    // Real provider errors (Anthropic, OpenAI) always carry a JSON body here.
    const match = trimmed.match(/^(\d{3})\b[\s:-]*(?=[{[])/);
    const remainder = match ? trimmed.slice(match[0].length).trim() : trimmed;

    const body = parseJson(remainder);
    if (!body || typeof body !== 'object') {
        return { status: match?.[1], message: remainder || safeRaw, raw: safeRaw };
    }

    let message: string | undefined;
    let code: string | undefined;
    const walk = (node: unknown): void => {
        if (typeof node === 'string') {
            const inner = parseJson(node);
            if (inner && typeof inner === 'object') { walk(inner); }
            return;
        }
        if (!node || typeof node !== 'object') { return; }
        for (const [k, v] of Object.entries(node)) {
            if (k === 'message' && typeof v === 'string' && !looksLikeJson(v)) {
                message = v;
            } else if (!code && (k === 'code' || k === 'status')) {
                code = asStatus(v);
            }
            walk(v);
        }
    };
    walk(body);

    return {
        status: match?.[1] ?? code,
        message: message ?? remainder,
        details: stringifyUnwrapped(body),
        raw: safeRaw
    };
}

/** Compact one-liner suitable for notification toasts. */
export function formattedProviderErrorToShortString(e: FormattedProviderError): string {
    return e.status ? `${e.status}: ${e.message}` : e.message;
}

function parseJson(text: string): unknown {
    const start = text.search(/[{[]/);
    if (start < 0) { return undefined; }
    try { return JSON.parse(text.slice(start)); } catch { return undefined; }
}

function looksLikeJson(text: string): boolean {
    const t = text.trimStart();
    return t.startsWith('{') || t.startsWith('[');
}

function asStatus(value: unknown): string | undefined {
    if (typeof value === 'number' && Number.isInteger(value)) {
        const s = String(value);
        return /^\d{3}$/.test(s) ? s : undefined;
    }
    return typeof value === 'string' ? value.match(/^(\d{3})\b/)?.[1] : undefined;
}

/** Pretty-print JSON, transparently parsing any string field that itself contains JSON. */
function stringifyUnwrapped(value: unknown): string | undefined {
    try {
        return JSON.stringify(value, (_, v) => {
            if (typeof v === 'string' && looksLikeJson(v)) {
                const inner = parseJson(v);
                if (inner && typeof inner === 'object') { return inner; }
            }
            return v;
        }, 2);
    } catch { return undefined; }
}
