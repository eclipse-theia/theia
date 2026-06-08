// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    QAAP_DEV_PREVIEW_PROBE_PATH,
    buildQaapDevPreviewOpenUrl,
    type QaapDevPreviewProbeResponse,
} from '../common/qaap-dev-preview';

const PROBE_TIMEOUT_MS = 2500;

/** Origin of the Qaap IDE (e.g. `http://178.105.136.93:3000` on a Hetzner VPS). */
export function getQaapPublicOrigin(): string {
    if (typeof window === 'undefined' || !window.location?.origin) {
        return '';
    }
    return window.location.origin.replace(/\/+$/, '');
}

/** Preview URL for the current host via the same-origin `/qaap-dev/:port/` proxy. */
export function toDevPreviewUrl(port: number, origin: string = getQaapPublicOrigin()): string {
    if (!origin) {
        return buildQaapDevPreviewOpenUrl(`http://127.0.0.1:${port}`, port);
    }
    return buildQaapDevPreviewOpenUrl(origin, port);
}

/**
 * Asks the Qaap backend whether a dev server is listening inside the workspace host.
 * Never uses `127.0.0.1` from the browser (that would target the user's device, not the VPS).
 */
export interface WaitForDevPreviewOptions {
    readonly maxAttempts?: number;
    readonly intervalMs?: number;
}

/** Polls the backend probe until the dev server responds or attempts are exhausted. */
export async function waitForQaapDevPreviewPort(
    port: number,
    options: WaitForDevPreviewOptions = {},
): Promise<QaapDevPreviewProbeResponse | undefined> {
    const maxAttempts = options.maxAttempts ?? 30;
    const intervalMs = options.intervalMs ?? 500;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const probe = await probeQaapDevPreviewPort(port);
        if (probe.ready) {
            return probe;
        }
        if (attempt < maxAttempts - 1) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    }
    return undefined;
}

export async function probeQaapDevPreviewPort(port: number): Promise<QaapDevPreviewProbeResponse> {
    const origin = getQaapPublicOrigin();
    const fallback: QaapDevPreviewProbeResponse = {
        ready: false,
        previewUrl: toDevPreviewUrl(port, origin),
    };
    if (!origin) {
        return fallback;
    }
    try {
        const response = await fetch(`${origin}${QAAP_DEV_PREVIEW_PROBE_PATH}/${port}`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        if (!response.ok) {
            return fallback;
        }
        const body = await response.json() as QaapDevPreviewProbeResponse;
        return {
            ready: !!body.ready,
            previewUrl: body.previewUrl || fallback.previewUrl,
        };
    } catch {
        return fallback;
    }
}
