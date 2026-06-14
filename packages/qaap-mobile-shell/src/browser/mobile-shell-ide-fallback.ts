// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    clearMobileWorkHubBootGuard,
    clearPreferAgentsSurface,
    clearPreferDesktopIde,
    markPreferDesktopIde,
    setMobileActiveTranscriptChrome,
    setMobileWorkHubComposerHeaderChrome,
    setMobileWorkHubHideBottomChrome,
} from './mobile-projects-open';
import type { MobileProjectsPanel } from './mobile-projects-panel';
import { MobileShellSessionState } from './mobile-shell-session-state';

export interface MobileShellIdeFallbackHost {
    isMobileActive(): boolean;
    shouldActivateMobileLayout(): boolean;
    enterMobileLayout(): void;
    leaveMobileLayout(): void;
    onMediaChange(): void;
    cancelAgentsBootstrap(): void;
    getProjectsPanel(): MobileProjectsPanel | undefined;
    setProjectsPanel(panel: MobileProjectsPanel | undefined): void;
    tryBootstrapMobileAgentsChat(): boolean;
    restoreAgentsSurfaceAfterReload(): Promise<void>;
    syncMobileHubPrimaryBottomChrome(): void;
    refreshBottomBar(): void;
    refreshWorkbenchTopBar(): void;
    forceCenterColumnFullWidth(): void;
    scheduleSnapAndUiRefresh(): void;
    ensureDesktopSidePanelSizes(): Promise<void>;
    requestFullShellRelayout(): void;
}

export interface MobileShellIdeFallbackOptions {
    host: MobileShellIdeFallbackHost;
    sessionState: MobileShellSessionState;
}

/** Classic IDE entry/exit while Work Hub remains the reload default (memory-only IDE preference). */
export class MobileShellIdeFallbackController {

    protected readonly host: MobileShellIdeFallbackHost;
    protected readonly sessionState: MobileShellSessionState;

    constructor(options: MobileShellIdeFallbackOptions) {
        this.host = options.host;
        this.sessionState = options.sessionState;
    }

    disposeProjectsPanelForDesktopIde(): void {
        const panel = this.host.getProjectsPanel();
        if (!panel) {
            return;
        }
        panel.hide();
        panel.dispose();
        if (panel.node.parentElement) {
            panel.node.parentElement.removeChild(panel.node);
        }
        this.host.setProjectsPanel(undefined);
    }

    openDesktopIde(): void {
        this.host.cancelAgentsBootstrap();
        clearPreferAgentsSurface();
        markPreferDesktopIde();
        setMobileWorkHubComposerHeaderChrome(false);
        setMobileWorkHubHideBottomChrome(false);
        setMobileActiveTranscriptChrome(false);
        document.body.classList.remove('theia-mobile-mod-landing');
        clearMobileWorkHubBootGuard();
        this.disposeProjectsPanelForDesktopIde();
        if (this.host.shouldActivateMobileLayout()) {
            if (!this.host.isMobileActive()) {
                this.host.enterMobileLayout();
            } else {
                this.host.syncMobileHubPrimaryBottomChrome();
                this.host.refreshBottomBar();
                this.host.refreshWorkbenchTopBar();
                this.host.forceCenterColumnFullWidth();
                this.host.scheduleSnapAndUiRefresh();
            }
        } else {
            this.host.leaveMobileLayout();
        }
        this.host.onMediaChange();
        window.requestAnimationFrame(() => {
            if (!this.host.shouldActivateMobileLayout()) {
                void this.host.ensureDesktopSidePanelSizes();
            }
            this.host.requestFullShellRelayout();
        });
    }

    /** Top-bar «Back to Work Hub» from mobile desktop-IDE mode — restore the Agents execution shell. */
    returnToAgentsFromDesktopIde(): void {
        this.host.cancelAgentsBootstrap();
        clearPreferDesktopIde();
        this.sessionState.landingLeftThisSession = true;
        document.body.classList.remove('theia-mobile-mod-landing');
        if (!this.host.isMobileActive() && this.host.shouldActivateMobileLayout()) {
            this.host.enterMobileLayout();
        }
        if (!this.host.tryBootstrapMobileAgentsChat()) {
            void this.host.restoreAgentsSurfaceAfterReload();
        }
        this.host.refreshBottomBar();
        this.host.refreshWorkbenchTopBar();
    }
}
