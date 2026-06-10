// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { normalizePreviewUrlForSameOrigin, parsePreviewProxyPath } from '@theia/qaap-adapters/lib/browser/qaap-preview-url-utils';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { probeQaapDevPreviewPort, waitForQaapDevPreviewPort } from './qaap-dev-preview-client';
import { QaapProjectBootstrapService } from './qaap-project-bootstrap-service';

const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);
const BOOTSTRAP_PREVIEW_WAIT_MS = 180_000;
const PROBE_POLL_ATTEMPTS = 90;
const PROBE_POLL_INTERVAL_MS = 500;

export interface EnsureTranscriptDevPreviewOptions {
    readonly portHint?: number;
    readonly previewUrlHint?: string;
}

/** Parses a proxied or direct localhost preview URL into a dev-server port. */
export function extractDevPreviewPortFromUrl(url: string | undefined): number | undefined {
    if (!url?.trim()) {
        return undefined;
    }
    try {
        const parsed = new URL(url.trim(), typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
        const proxy = parsePreviewProxyPath(parsed.pathname);
        if (proxy) {
            return proxy.port;
        }
        if (LOCAL_DEV_HOSTS.has(parsed.hostname)) {
            const port = Number(parsed.port);
            return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : undefined;
        }
    } catch {
        return undefined;
    }
    return undefined;
}

async function probeReadyPreviewUrl(port: number): Promise<string | undefined> {
    const probe = await probeQaapDevPreviewPort(port);
    if (!probe.ready) {
        return undefined;
    }
    return normalizePreviewUrlForSameOrigin(probe.previewUrl);
}

function waitForBootstrapPreviewUrl(
    bootstrap: QaapProjectBootstrapService,
    timeoutMs: number,
): Promise<string | undefined> {
    const snapshot = bootstrap.getStateSnapshot();
    if (snapshot.previewUrl && snapshot.phase === 'running') {
        return Promise.resolve(snapshot.previewUrl);
    }
    return new Promise(resolve => {
        const toDispose = new DisposableCollection();
        const finish = (url: string | undefined): void => {
            toDispose.dispose();
            resolve(url);
        };
        toDispose.push(Disposable.create(() => window.clearTimeout(timerId)));
        toDispose.push(bootstrap.onStateChange(state => {
            if (state.previewUrl && state.phase === 'running') {
                finish(state.previewUrl);
            }
        }));
        const timerId = window.setTimeout(() => finish(undefined), timeoutMs);
    });
}

/**
 * Keeps the dev server alive via {@link QaapProjectBootstrapService} (persistent terminal) instead
 * of agent shell commands that time out after ~30s. Returns a same-origin preview URL when ready.
 */
export async function ensureTranscriptDevPreview(
    bootstrap: QaapProjectBootstrapService,
    options: EnsureTranscriptDevPreviewOptions = {},
): Promise<string | undefined> {
    const portHint = options.portHint ?? extractDevPreviewPortFromUrl(options.previewUrlHint);

    if (portHint !== undefined) {
        const readyUrl = await probeReadyPreviewUrl(portHint);
        if (readyUrl) {
            return readyUrl;
        }
    }

    let snapshot = bootstrap.getStateSnapshot();
    if (!snapshot.descriptor) {
        await bootstrap.refreshFromCurrentWorkspace();
        snapshot = bootstrap.getStateSnapshot();
    }
    if (!snapshot.descriptor) {
        return undefined;
    }

    if (snapshot.previewUrl && snapshot.phase === 'running') {
        const runningPort = extractDevPreviewPortFromUrl(snapshot.previewUrl);
        if (runningPort !== undefined) {
            const readyUrl = await probeReadyPreviewUrl(runningPort);
            if (readyUrl) {
                return readyUrl;
            }
        }
    }

    const needsInstall = snapshot.needsInstall === true
        || !snapshot.descriptor.nodeModulesPresent
        || snapshot.phase === 'install-failed';
    const canStartDev = snapshot.phase !== 'installing'
        && snapshot.phase !== 'starting'
        && snapshot.phase !== 'running';

    if (needsInstall) {
        await bootstrap.runInstall();
    } else if (canStartDev) {
        await bootstrap.runDevServer();
    }

    const waitPort = portHint ?? bootstrap.lastPort;
    if (waitPort !== undefined) {
        const ready = await waitForQaapDevPreviewPort(waitPort, {
            maxAttempts: PROBE_POLL_ATTEMPTS,
            intervalMs: PROBE_POLL_INTERVAL_MS,
        });
        if (ready?.ready) {
            return normalizePreviewUrlForSameOrigin(ready.previewUrl);
        }
    }

    const fromBootstrap = await waitForBootstrapPreviewUrl(bootstrap, BOOTSTRAP_PREVIEW_WAIT_MS);
    if (!fromBootstrap) {
        return undefined;
    }
    const finalPort = extractDevPreviewPortFromUrl(fromBootstrap);
    if (finalPort === undefined) {
        return normalizePreviewUrlForSameOrigin(fromBootstrap);
    }
    const verified = await probeReadyPreviewUrl(finalPort);
    return verified ?? normalizePreviewUrlForSameOrigin(fromBootstrap);
}
