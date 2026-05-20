// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** HTTP path prefix for proxied dev-server preview (Codespaces-style, same origin as Qaap). */
export const QAAP_DEV_PREVIEW_PREFIX = '/qaap-dev';

export const QAAP_DEV_PREVIEW_PROBE_PATH = `${QAAP_DEV_PREVIEW_PREFIX}/api/probe`;

export interface QaapDevPreviewProbeResponse {
    readonly ready: boolean;
    /** Same-origin URL the mini-browser should load, e.g. `http://178.x.x.x:3000/qaap-dev/3001/`. */
    readonly previewUrl: string;
}

const MIN_DEV_PORT = 1024;
const MAX_DEV_PORT = 65535;

export function isAllowedDevPreviewPort(port: number): boolean {
    return Number.isInteger(port) && port >= MIN_DEV_PORT && port <= MAX_DEV_PORT;
}

export function parseQaapDevPreviewPort(raw: string | number | undefined): number | undefined {
    const port = typeof raw === 'number' ? raw : Number(raw);
    return isAllowedDevPreviewPort(port) ? port : undefined;
}

export function normalizePublicOrigin(origin: string): string {
    return origin.replace(/\/+$/, '');
}

/**
 * Builds the preview URL served by {@link QAAP_DEV_PREVIEW_PREFIX} on the Qaap backend.
 * Works for localhost, VPS IP (`http://178.x.x.x:3000`), and future custom domains.
 */
export function buildQaapDevPreviewUrl(publicOrigin: string, port: number): string {
    const base = normalizePublicOrigin(publicOrigin);
    return `${base}${QAAP_DEV_PREVIEW_PREFIX}/${port}/`;
}

/** Parses `/qaap-dev/5173/...` upgrade or request paths. */
export function parseQaapDevPreviewRequestPath(pathname: string): { port: number; targetPath: string } | undefined {
    const match = /^\/qaap-dev\/(\d+)(\/.*)?$/.exec(pathname);
    if (!match) {
        return undefined;
    }
    const port = parseQaapDevPreviewPort(match[1]);
    if (port === undefined) {
        return undefined;
    }
    const targetPath = match[2] || '/';
    return { port, targetPath };
}
