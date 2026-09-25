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

    // Network-level failures (no HTTP response was ever received) do not carry a JSON body, so the
    // provider layer only surfaces an opaque string such as "fetch failed" or a bare error code.
    // Turn these into an actionable, human-readable explanation before attempting JSON parsing.
    const network = formatNetworkError(trimmed, safeRaw);
    if (network) { return network; }

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

/**
 * Builds an error message string that also incorporates the `cause` chain.
 *
 * Node's `fetch` (undici) throws `TypeError: fetch failed` while the actionable reason
 * (e.g. `ECONNREFUSED`, `ENOTFOUND`, a TLS error) lives on `error.cause`. Provider SDKs often
 * wrap that again. This walks the chain and appends each distinct cause message/code so that
 * downstream formatting (see {@link formatProviderError}) can recognize the real failure instead
 * of only seeing the opaque top-level "fetch failed".
 */
export function extractErrorMessageWithCause(error: unknown): string {
    const parts: string[] = [];
    const seen = new Set<unknown>();
    let current: unknown = error;
    // Bound the walk to avoid pathological/cyclic cause chains.
    // eslint-disable-next-line no-null/no-null
    for (let depth = 0; current !== undefined && current !== null && depth < 10; depth++) {
        if (seen.has(current)) { break; }
        seen.add(current);

        let segment: string | undefined;
        if (typeof current === 'string') {
            segment = current;
        } else if (typeof current === 'object') {
            const obj = current as { message?: unknown; code?: unknown; cause?: unknown };
            const message = typeof obj.message === 'string' ? obj.message : undefined;
            const code = typeof obj.code === 'string' ? obj.code : undefined;
            // Include the code when it is not already part of the message (undici puts the code on
            // the cause but not always in its message).
            segment = code && (!message || !message.includes(code))
                ? [message, code].filter(Boolean).join(': ')
                : message;
            current = obj.cause;
        }

        if (segment && !parts.includes(segment)) {
            parts.push(segment);
        }
        if (typeof current !== 'object') { break; }
    }

    return parts.join(' | ') || String(error);
}

/**
 * Recognizes network-level failures that occur before any HTTP response is received. Node's
 * `fetch` (undici) reports these as an opaque `TypeError: fetch failed`, stashing the real reason
 * in `error.cause`. Callers should append that cause to the message (see the chat agent's error
 * handling) so the specific code below can be matched. Returns `undefined` when the input does not
 * look like a network error, letting the caller fall through to HTTP/JSON parsing.
 */
export function formatNetworkError(trimmed: string, safeRaw: string): FormattedProviderError | undefined {
    const lower = trimmed.toLowerCase();

    const isFetchFailed = lower.includes('fetch failed');
    const networkCodePattern = new RegExp(
        '\\b(econnrefused|enotfound|eai_again|etimedout|econnreset|ehostunreach|enetunreach|epipe'
        + '|socket hang up|und_err|self[- ]signed certificate|cert_|certificate|unable to verify)\\b',
        'i'
    );
    const hasNetworkCode = networkCodePattern.test(trimmed);
    if (!isFetchFailed && !hasNetworkCode) {
        return undefined;
    }

    // Pick the most specific known cause. Order matters: check the more precise ones first.
    let message: string;
    if (/\benotfound\b|\beai_again\b/i.test(trimmed)) {
        message = 'Could not resolve the AI provider host. Check the model/endpoint URL and your DNS or internet connection.';
    } else if (/\beconnrefused\b/i.test(trimmed)) {
        message = 'Connection refused by the AI provider endpoint. Verify the host and port, and that any local model server (e.g. Ollama) is running.';
    } else if (/\betimedout\b|\bund_err_connect_timeout\b/i.test(trimmed)) {
        message = 'The connection to the AI provider timed out. Check your network, VPN, or proxy settings.';
    } else if (/\beconnreset\b|socket hang up|\bepipe\b/i.test(trimmed)) {
        message = 'The connection to the AI provider was reset before a response was received. This is often transient — please retry.';
    } else if (/\behostunreach\b|\benetunreach\b/i.test(trimmed)) {
        message = 'The AI provider host is unreachable. Check your network connection, VPN, or proxy settings.';
    } else if (/self[- ]signed certificate|cert_|certificate|unable to verify/i.test(trimmed)) {
        message = 'The TLS certificate of the AI provider endpoint could not be verified. If using a custom or self-signed endpoint, check its certificate or proxy configuration.';
    } else {
        // Generic "fetch failed" with no recognizable cause attached.
        message = 'Could not reach the AI provider. Check your internet connection, the configured endpoint URL, and any proxy or firewall settings.';
    }

    return { message, details: safeRaw, raw: safeRaw };
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
