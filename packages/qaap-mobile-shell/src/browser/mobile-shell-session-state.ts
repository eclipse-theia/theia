// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Memory-only flags for the current browser runtime.
 * Nothing here may be written to sessionStorage, localStorage, URL state, or restored layout.
 */
export class MobileShellSessionState {

    /**
     * True once the user has actively left the mobile landing (Projects panel) in this session,
     * either by opening a workspace from the dashboard or by tapping Focus on the active project.
     */
    landingLeftThisSession = false;

    /** True when the current transcript was opened from the Work Hub Agents landing overlay. */
    transcriptOpenedFromWorkHubLanding = false;

    /** Prevents duplicate `restoreAgentsSurfaceAfterReload` calls during mobile layout bootstrap. */
    agentsBootstrapStarted = false;

    /** Bumped to cancel in-flight Agents bootstrap when the user opens the desktop IDE. */
    agentsBootstrapEpoch = 0;

    cancelAgentsBootstrap(): void {
        this.agentsBootstrapEpoch++;
        this.agentsBootstrapStarted = false;
    }

}
