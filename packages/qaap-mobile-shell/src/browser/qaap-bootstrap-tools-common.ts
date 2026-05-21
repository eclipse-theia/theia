// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapBootstrapStateChange } from './qaap-project-bootstrap-service';
import type { QaapForwardedPort } from './qaap-project-bootstrap-types';

export const QAAP_BOOTSTRAP_STATUS_TOOL_ID = 'qaap_bootstrap_status';
export const QAAP_BOOTSTRAP_INSTALL_TOOL_ID = 'qaap_bootstrap_install';
export const QAAP_BOOTSTRAP_RUN_DEV_TOOL_ID = 'qaap_bootstrap_run_dev';
export const QAAP_BOOTSTRAP_OPEN_PREVIEW_TOOL_ID = 'qaap_bootstrap_open_preview';

/** JSON-safe snapshot for AI tool responses. */
export interface QaapBootstrapToolSnapshot {
    readonly phase: QaapBootstrapStateChange['phase'];
    readonly projectName?: string;
    readonly kind?: string;
    readonly packageManager?: string;
    readonly nodeModulesPresent?: boolean;
    readonly needsInstall?: boolean;
    readonly devCommand?: string;
    readonly previewUrl?: string;
    readonly error?: string;
    readonly portInUse?: boolean;
    readonly existingServerPort?: number;
    readonly lastPort?: number;
    readonly selectedAppPath?: string;
    readonly forwardedPorts?: ReadonlyArray<{ readonly port: number; readonly url: string; readonly opened: boolean }>;
    /** Best single-line failure from install/dev terminal output (install-failed / run-failed). */
    readonly terminalFailure?: string;
    /** Tail of terminal output when bootstrap failed (truncated for agents). */
    readonly terminalTail?: string;
}

export function serializeQaapBootstrapState(
    state: QaapBootstrapStateChange,
    forwardedPorts: readonly QaapForwardedPort[] = [],
    failureDetail?: { terminalFailure: string; terminalTail?: string }
): QaapBootstrapToolSnapshot {
    const descriptor = state.descriptor;
    const needsInstall = state.needsInstall
        ?? (descriptor !== undefined && !descriptor.nodeModulesPresent);
    return {
        phase: state.phase,
        projectName: descriptor?.name,
        kind: descriptor?.kind,
        packageManager: descriptor?.packageManager,
        nodeModulesPresent: descriptor?.nodeModulesPresent,
        needsInstall: needsInstall || undefined,
        devCommand: descriptor?.devCommandLabel ?? descriptor?.devCommand,
        previewUrl: state.previewUrl,
        error: state.error,
        portInUse: state.portInUse,
        existingServerPort: state.existingServerPort,
        lastPort: state.lastPort,
        selectedAppPath: state.selectedApp?.relativePath,
        forwardedPorts: forwardedPorts.length > 0
            ? forwardedPorts.map(p => ({ port: p.port, url: p.url, opened: p.previewOpen }))
            : undefined,
        terminalFailure: failureDetail?.terminalFailure,
        terminalTail: failureDetail?.terminalTail,
    };
}

export function formatBootstrapToolResult(snapshot: QaapBootstrapToolSnapshot, message?: string): string {
    return JSON.stringify(message ? { message, ...snapshot } : snapshot);
}
