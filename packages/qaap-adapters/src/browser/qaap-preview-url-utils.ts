// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Same prefix as {@link QAAP_DEV_PREVIEW_PREFIX} in qaap-mobile-shell (keep in sync). */
export const QAAP_DEV_PREVIEW_PATH_PREFIX = '/qaap-dev';

const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);

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
    const trimmed = url.trim();
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
