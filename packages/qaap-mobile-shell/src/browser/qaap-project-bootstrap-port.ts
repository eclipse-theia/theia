// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { QAAP_THEIA_DEV_PORT, QaapProjectKind } from './qaap-project-bootstrap-types';

/** Default dev port per framework when `package.json` does not imply one. */
export function getImplicitDevPort(kind: QaapProjectKind): number | undefined {
    switch (kind) {
        case 'node-vite':
        case 'node-svelte':
            return 5173;
        case 'node-astro':
            return 4321;
        case 'node-next':
        case 'node-cra':
        case 'node-nuxt':
        case 'node-remix':
            return QAAP_THEIA_DEV_PORT;
        case 'node-generic':
            return QAAP_THEIA_DEV_PORT;
        default:
            return undefined;
    }
}

/**
 * Port the Qaap IDE is served on in the current browser session (localhost, VPS IP, or domain).
 */
export function getQaapIdeListenPort(): number | undefined {
    if (typeof window === 'undefined' || !window.location?.hostname) {
        return undefined;
    }
    const parsed = Number(window.location.port);
    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
    }
    if (window.location.protocol === 'https:') {
        return 443;
    }
    if (window.location.protocol === 'http:') {
        return 80;
    }
    return undefined;
}

/** True when `port` is where the IDE itself is listening. */
export function isReservedIdePort(port: number, idePort: number | undefined = getQaapIdeListenPort()): boolean {
    return idePort !== undefined && port === idePort;
}

/**
 * Picks a dev-server port that does not collide with the IDE listener inside the workspace host.
 */
export function pickAlternateDevPort(
    frameworkPort: number,
    idePort: number | undefined = getQaapIdeListenPort(),
): number {
    const reserved = new Set<number>();
    if (idePort !== undefined) {
        reserved.add(idePort);
    }
    reserved.add(frameworkPort);
    let candidate = frameworkPort === QAAP_THEIA_DEV_PORT ? QAAP_THEIA_DEV_PORT + 1 : frameworkPort + 1;
    while (reserved.has(candidate) || candidate >= 65536) {
        candidate += 1;
    }
    return candidate;
}

/**
 * Resolves the port the dev process should bind to inside the VPS/container.
 */
export function resolveBootstrapDevPort(
    frameworkPort: number | undefined,
    idePort: number | undefined = getQaapIdeListenPort(),
): number | undefined {
    if (frameworkPort === undefined) {
        return undefined;
    }
    if (!isReservedIdePort(frameworkPort, idePort)) {
        return frameworkPort;
    }
    return pickAlternateDevPort(frameworkPort, idePort);
}

/**
 * Prefixes / suffixes the dev command so the child process binds to `port` inside the host.
 */
export function wrapDevCommandForPort(command: string, port: number, kind: QaapProjectKind): string {
    const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.platform);
    switch (kind) {
        case 'node-vite':
        case 'node-astro':
        case 'node-svelte':
            return appendCliPortFlag(command, port, isWindows);
        case 'node-next':
        case 'node-remix':
            return appendCliPortFlag(prefixPortEnv(command, port, isWindows), port, isWindows);
        default:
            return prefixPortEnv(command, port, isWindows);
    }
}

function prefixPortEnv(command: string, port: number, isWindows: boolean): string {
    if (isWindows) {
        return `set "PORT=${port}"&& ${command}`;
    }
    return `PORT=${port} ${command}`;
}

function appendCliPortFlag(command: string, port: number, isWindows: boolean): string {
    if (isWindows) {
        return `${command} -- --port ${port}`;
    }
    return `${command} -- --port ${port}`;
}
