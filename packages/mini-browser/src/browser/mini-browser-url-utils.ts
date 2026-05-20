// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Normalizes URL / quick-input strings (NBSP, trim, common `http ://` typos). */
export function normalizeMiniBrowserOpenUrl(url: string): string {
    let normalized = url.replace(/\u00a0/g, ' ').trim();
    normalized = normalized.replace(/^([a-z][a-z0-9+.-]*)\s+:\s*\/+\s*/i, '$1://');
    return normalized;
}

export function isMiniBrowserUriParseError(err: unknown): boolean {
    const raw = err instanceof Error ? err.message : String(err);
    return raw.includes('UriError') || raw.includes('Scheme contains illegal characters');
}

/** User-facing message when navigation or URL mapping fails. */
export function formatMiniBrowserNavigateError(err: unknown): string {
    if (isMiniBrowserUriParseError(err)) {
        return 'Invalid URL. Remove extra spaces or fix the address, then try again.';
    }
    return err instanceof Error ? err.message : String(err);
}
