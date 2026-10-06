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

import { nls } from '@theia/core';
import { extractErrorMessageWithCause } from '@theia/ai-core';

// Re-exported for backwards compatibility: the flattening helper now lives in `@theia/ai-core` so
// backend provider packages can share it (they must flatten the cause chain before it crosses the
// RPC boundary, which drops `cause`).
export { extractErrorMessageWithCause };

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
        // No HTTP status prefix and no parseable JSON body: this is where opaque network-level
        // failures ("fetch failed", bare error codes) surface. Only attempt the network-error
        // explanation here, so a real provider body that merely mentions a network keyword (e.g.
        // `403 {"error":{"message":"Client certificate required"}}`) keeps its original message.
        if (!match) {
            const network = formatNetworkError(trimmed, safeRaw);
            if (network) { return network; }
        }
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
 * Recognizes network-level failures that occur before any HTTP response is received. Node's
 * `fetch` (undici) reports these as an opaque `TypeError: fetch failed`, stashing the real reason
 * in `error.cause`. Callers should append that cause to the message (see the chat agent's error
 * handling) so the specific code below can be matched. Returns `undefined` when the input does not
 * look like a network error, letting the caller fall through to HTTP/JSON parsing.
 *
 * Kept module-private on purpose: this is an internal detail of {@link formatProviderError} with no
 * external caller, so it must not leak into the public API of `@theia/ai-chat`.
 */
function formatNetworkError(trimmed: string, safeRaw: string): FormattedProviderError | undefined {
    // Error codes such as ECONNREFUSED or UND_ERR_CONNECT_TIMEOUT contain underscores, and `_` is a
    // word character, so `\b` would not sit at the boundary of `und_err`/`cert_`. Match these
    // fragments as plain substrings instead of word-bounded tokens.
    const networkCodePattern = new RegExp(
        '\\b(econnrefused|enotfound|eai_again|etimedout|econnreset|ehostunreach|enetunreach|epipe'
        + '|socket hang up|self[- ]signed certificate|certificate|unable to verify)\\b'
        + '|und_err|cert_|depth_zero_self_signed_cert',
        'i'
    );
    const isFetchFailed = trimmed.toLowerCase().includes('fetch failed');
    const hasNetworkCode = networkCodePattern.test(trimmed);
    if (!isFetchFailed && !hasNetworkCode) {
        return undefined;
    }

    // Pick the most specific known cause. Order matters: check the more precise ones first.
    let message: string;
    if (/\benotfound\b|\beai_again\b/i.test(trimmed)) {
        message = nls.localize(
            'theia/ai/chat/networkError/dns',
            'Could not resolve the AI provider host. Check the model/endpoint URL and your DNS or internet connection.'
        );
    } else if (/\beconnrefused\b/i.test(trimmed)) {
        message = nls.localize(
            'theia/ai/chat/networkError/refused',
            'Connection refused by the AI provider endpoint. Verify the host and port, and that any local model server (e.g. Ollama) is running.'
        );
    } else if (/\betimedout\b/i.test(trimmed) || /und_err_connect_timeout/i.test(trimmed)) {
        message = nls.localize(
            'theia/ai/chat/networkError/timeout',
            'The connection to the AI provider timed out. Check your network, VPN, or proxy settings.'
        );
    } else if (/\beconnreset\b|socket hang up|\bepipe\b/i.test(trimmed)) {
        message = nls.localize(
            'theia/ai/chat/networkError/reset',
            'The connection to the AI provider was reset before a response was received. This is often transient — please retry.'
        );
    } else if (/\behostunreach\b|\benetunreach\b/i.test(trimmed)) {
        message = nls.localize(
            'theia/ai/chat/networkError/unreachable',
            'The AI provider host is unreachable. Check your network connection, VPN, or proxy settings.'
        );
    } else if (/self[- ]signed certificate|certificate|unable to verify/i.test(trimmed) || /cert_|depth_zero_self_signed_cert/i.test(trimmed)) {
        message = nls.localize(
            'theia/ai/chat/networkError/tls',
            'The TLS certificate of the AI provider endpoint could not be verified. '
            + 'If using a custom or self-signed endpoint, check its certificate or proxy configuration.'
        );
    } else {
        // Generic "fetch failed" with no recognizable cause attached.
        message = nls.localize(
            'theia/ai/chat/networkError/generic',
            'Could not reach the AI provider. Check your internet connection, the configured endpoint URL, and any proxy or firewall settings.'
        );
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
