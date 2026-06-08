// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** HTTP path prefix for proxied dev-server preview (Codespaces-style, same origin as Qaap). */
export const QAAP_DEV_PREVIEW_PREFIX = '/qaap-dev';

export const QAAP_DEV_PREVIEW_PROBE_PATH = `${QAAP_DEV_PREVIEW_PREFIX}/api/probe`;

export interface QaapDevPreviewProbeResponse {
    readonly ready: boolean;
    /** URL the mini-browser should load via the same-origin `/qaap-dev/:port/` proxy. */
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

export function isLocalQaapPreviewOrigin(publicOrigin: string): boolean {
    try {
        const { hostname } = new URL(normalizePublicOrigin(publicOrigin));
        return hostname === 'localhost'
            || hostname === '127.0.0.1'
            || hostname === '0.0.0.0'
            || hostname === '[::1]'
            || hostname === '::1';
    } catch {
        return false;
    }
}

export function buildDirectDevPreviewUrl(publicOrigin: string, port: number): string {
    const url = new URL(normalizePublicOrigin(publicOrigin));
    url.port = String(port);
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString();
}

/**
 * Builds the preview URL served by {@link QAAP_DEV_PREVIEW_PREFIX} on the Qaap backend.
 * Works for localhost, VPS IP (`http://178.x.x.x:3000`), and future custom domains.
 */
export function buildQaapDevPreviewUrl(publicOrigin: string, port: number): string {
    const base = normalizePublicOrigin(publicOrigin);
    return `${base}${QAAP_DEV_PREVIEW_PREFIX}/${port}/`;
}

export function buildQaapDevPreviewOpenUrl(publicOrigin: string, port: number): string {
    // Always use the same-origin proxy so in-IDE preview can run the element picker / inspector.
    return buildQaapDevPreviewUrl(publicOrigin, port);
}

/** Friendly holding page while the dev server is still binding (v0-style auto-retry). */
export function buildDevPreviewWaitingHtml(targetPort: number): string {
    const safePort = String(targetPort);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Starting preview</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0d1117; color: #e6edf3; font-family: system-ui, sans-serif; }
  .card { text-align: center; padding: 2rem; max-width: 24rem; }
  .spinner { width: 2rem; height: 2rem; border: 2px solid #30363d; border-top-color: #58a6ff;
    border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
  @keyframes spin { to { transform: rotate(360deg); } }
  h1 { font-size: 1rem; font-weight: 600; margin: 0 0 0.5rem; }
  p { font-size: 0.875rem; color: #8b949e; margin: 0; line-height: 1.5; }
</style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>Starting dev server</h1>
    <p>Waiting for port ${safePort}… This page refreshes automatically.</p>
  </div>
  <script>
    setTimeout(function () { location.reload(); }, 2000);
  </script>
</body>
</html>`;
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
