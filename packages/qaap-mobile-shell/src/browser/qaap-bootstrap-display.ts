// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapBootstrapStateChange } from './qaap-project-bootstrap-service';
import type { QaapProjectDescriptor, QaapProjectKind } from './qaap-project-bootstrap-types';

/** Short framework label for chips and variables (e.g. "Vite"). */
export function qaapFrameworkLabel(kind: QaapProjectKind | undefined): string {
    switch (kind) {
        case 'node-vite': return 'Vite';
        case 'node-next': return 'Next.js';
        case 'node-cra': return 'CRA';
        case 'node-astro': return 'Astro';
        case 'node-remix': return 'Remix';
        case 'node-svelte': return 'SvelteKit';
        case 'node-nuxt': return 'Nuxt';
        case 'node-generic': return 'Node';
        default: return 'App';
    }
}

/** Human phase label for chat chip and variables. */
export function qaapBootstrapPhaseLabel(phase: QaapBootstrapStateChange['phase']): string {
    switch (phase) {
        case 'installing': return 'Installing';
        case 'starting': return 'Starting';
        case 'running': return 'Running';
        case 'ready-to-run': return 'Ready';
        case 'install-failed': return 'Install failed';
        case 'run-failed': return 'Stopped';
        case 'detected': return 'Detected';
        case 'dismissed': return 'Dismissed';
        default: return 'Idle';
    }
}

function portFromPreviewUrl(previewUrl: string | undefined): number | undefined {
    if (!previewUrl) {
        return undefined;
    }
    try {
        const port = new URL(previewUrl).port;
        return port ? Number(port) : undefined;
    } catch {
        return undefined;
    }
}

/** Mobile chat chip, e.g. `Vite · :5173 · Running`. */
export function formatQaapBootstrapChipLabel(state: QaapBootstrapStateChange): string | undefined {
    const descriptor = state.descriptor;
    if (!descriptor) {
        return undefined;
    }
    const kind = state.selectedApp?.kind ?? descriptor.kind;
    const framework = qaapFrameworkLabel(kind);
    const port = state.lastPort
        ?? state.existingServerPort
        ?? portFromPreviewUrl(state.previewUrl);
    const portPart = port ? `:${port}` : undefined;
    const phase = qaapBootstrapPhaseLabel(state.phase);
    return [framework, portPart, phase].filter(part => part !== undefined).join(' · ');
}

/** Compact JSON-ish summary for the `qaap.bootstrap` AI variable. */
export function formatQaapBootstrapVariableValue(
    state: QaapBootstrapStateChange,
    extras?: { terminalFailure?: string }
): string {
    const descriptor = state.descriptor;
    const lines: string[] = [];
    if (descriptor) {
        lines.push(`framework: ${qaapFrameworkLabel(state.selectedApp?.kind ?? descriptor.kind)}`);
        lines.push(`project: ${descriptor.name}`);
        if (state.selectedApp) {
            lines.push(`app: ${state.selectedApp.relativePath}`);
        }
    }
    lines.push(`phase: ${state.phase} (${qaapBootstrapPhaseLabel(state.phase)})`);
    if (state.previewUrl) {
        lines.push(`previewUrl: ${state.previewUrl}`);
    }
    if (state.needsInstall) {
        lines.push('needsInstall: true');
    }
    if (state.error) {
        lines.push(`error: ${state.error}`);
    }
    if (extras?.terminalFailure) {
        lines.push(`terminalFailure: ${extras.terminalFailure}`);
    }
    return lines.join('\n');
}

export function resolveActiveFrameworkKind(
    state: QaapBootstrapStateChange,
    descriptor: QaapProjectDescriptor
): QaapProjectKind {
    return state.selectedApp?.kind ?? descriptor.kind;
}
