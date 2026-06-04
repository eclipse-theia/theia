// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Same prefix as {@link QAAP_DEV_PREVIEW_PREFIX} in qaap-mobile-shell (keep in sync). */
export const QAAP_DEV_PREVIEW_PATH_PREFIX = '/qaap-dev';

const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);
const BARE_LOCAL_DEV_URL_PATTERN = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?):(\d{2,5})(\/.*)?$/i;

function normalizeBareLocalDevUrl(url: string): string {
    const match = BARE_LOCAL_DEV_URL_PATTERN.exec(url.trim());
    if (!match) {
        return url;
    }
    const host = match[1].replace(/^\[?::1\]?$/i, '[::1]');
    return `http://${host}:${match[2]}${match[3] ?? '/'}`;
}

function parseDevPort(raw: string | undefined): number | undefined {
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        return undefined;
    }
    return port;
}

function ideOrigin(): string | undefined {
    if (typeof window === 'undefined' || !window.location?.origin) {
        return undefined;
    }
    return window.location.origin.replace(/\/+$/, '');
}

/**
 * Rewrites direct `http://localhost:5173/...` dev-server URLs to the same-origin
 * `/qaap-dev/:port/...` proxy so the element picker and inspector can access the iframe DOM.
 */
export function normalizePreviewUrlForSameOrigin(url: string, publicOrigin?: string): string {
    const trimmed = normalizeBareLocalDevUrl(url.trim());
    if (!trimmed) {
        return trimmed;
    }
    const origin = (publicOrigin ?? ideOrigin())?.replace(/\/+$/, '');
    if (!origin) {
        return trimmed;
    }
    try {
        const parsed = new URL(trimmed, origin);
        const ide = new URL(origin);

        if (parsed.origin === ide.origin && parsed.pathname.startsWith(`${QAAP_DEV_PREVIEW_PATH_PREFIX}/`)) {
            return parsed.toString();
        }

        if (!LOCAL_DEV_HOSTS.has(parsed.hostname)) {
            return trimmed;
        }

        const devPort = parseDevPort(parsed.port || undefined);
        const idePort = parseDevPort(ide.port || (ide.protocol === 'https:' ? '443' : '80'));
        if (devPort === undefined || devPort === idePort) {
            return trimmed;
        }

        const suffix = `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
        const path = suffix.startsWith('/') ? suffix : `/${suffix}`;
        return `${origin}${QAAP_DEV_PREVIEW_PATH_PREFIX}/${devPort}${path}`;
    } catch {
        return trimmed;
    }
}

export function buildSameOriginDevPreviewUrl(port: number, publicOrigin?: string): string {
    const origin = (publicOrigin ?? ideOrigin())?.replace(/\/+$/, '');
    if (!origin) {
        return `http://127.0.0.1:${port}/`;
    }
    return `${origin}${QAAP_DEV_PREVIEW_PATH_PREFIX}/${port}/`;
}

export interface QaapPreviewProxyPath {
    readonly port: number;
    readonly targetPath: string;
}

/** Parses `/qaap-dev/5173/...` paths on the IDE origin. */
export function parsePreviewProxyPath(pathname: string): QaapPreviewProxyPath | undefined {
    const match = /^\/qaap-dev\/(\d+)(\/.*)?$/.exec(pathname);
    if (!match) {
        return undefined;
    }
    const port = parseDevPort(match[1]);
    if (port === undefined) {
        return undefined;
    }
    return { port, targetPath: match[2] || '/' };
}

/**
 * User-facing URL for browsing history (direct `localhost:PORT` instead of `/qaap-dev/:port/`).
 */
function stripPreviewHistoryCacheBust(url: URL): void {
    url.searchParams.delete('_qaap_cache_bust');
    if (!url.searchParams.toString()) {
        url.search = '';
    }
}

export function toPreviewHistoryDisplayUrl(url: string, publicOrigin?: string): string {
    const trimmed = url.trim();
    if (!trimmed) {
        return trimmed;
    }
    const origin = (publicOrigin ?? ideOrigin())?.replace(/\/+$/, '');
    try {
        const parsed = new URL(trimmed, origin);
        stripPreviewHistoryCacheBust(parsed);
        const proxy = parsePreviewProxyPath(parsed.pathname);
        if (proxy) {
            const suffix = `${proxy.targetPath}${parsed.search}${parsed.hash}` || '/';
            const path = suffix.startsWith('/') ? suffix : `/${suffix}`;
            return `http://localhost:${proxy.port}${path}`;
        }
        if (origin) {
            const ide = new URL(origin);
            if (parsed.origin !== ide.origin) {
                return parsed.toString();
            }
        }
        if (LOCAL_DEV_HOSTS.has(parsed.hostname)) {
            const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
            const suffix = `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
            const path = suffix.startsWith('/') ? suffix : `/${suffix}`;
            return `http://localhost:${port}${path}`;
        }
        return parsed.toString();
    } catch {
        return trimmed;
    }
}

/** Stable key so proxy and direct dev URLs dedupe to one history row. */
export function canonicalPreviewHistoryKey(url: string, publicOrigin?: string): string {
    const display = toPreviewHistoryDisplayUrl(url, publicOrigin);
    if (!display) {
        return '';
    }
    try {
        const parsed = new URL(display);
        const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
        const path = parsed.pathname.replace(/\/+$/, '') || '/';
        return `${parsed.protocol}//${parsed.hostname}:${port}${path}${parsed.search}`;
    } catch {
        return display.toLowerCase();
    }
}
