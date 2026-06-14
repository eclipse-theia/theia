// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import {
    clearPreferDesktopIde,
    installMobileWorkHubBootGuard,
    markMobileProjectsHomeVisible,
    markPreferAgentsSurface,
    setMobileLandingHubListChrome,
} from './mobile-projects-open';
import type { MobileProjectsHubView } from './mobile-projects-types';
import type { MobileProjectsPanel } from './mobile-projects-panel';
import type { MobileProjectsService } from './mobile-projects-service';
import { dismissQaapAccountMenu } from './qaap-workbench-account-menu';
import { MobileShellSessionState } from './mobile-shell-session-state';

export interface MobileShellHubNavigationHost {
    isMobileActive(): boolean;
    enterMobileLayout(): void;
    getProjectsPanel(): MobileProjectsPanel | undefined;
    applyLandingChrome(): void;
    warmLiveTransport(): void;
    startActiveTasks(): void;
    syncMobileHubPrimaryBottomChrome(): void;
    refreshBottomBar(): void;
    refreshWorkbenchTopBar(): void;
    ensureDesktopWorkHubSessionsSidebarOpen(): void;
    hidePullRequestPanel(): void;
    dismissSheetsAsync(): Promise<void>;
    collapseMobileSidePanels(): Promise<void>;
    showMobileProjectsHome(view: MobileProjectsHubView): Promise<void>;
}

export interface MobileShellHubNavigationOptions {
    host: MobileShellHubNavigationHost;
    shell: ApplicationShell;
    projectsService: MobileProjectsService;
    sessionState: MobileShellSessionState;
}

/** Work Hub landing tab navigation and transcript overlay cleanup. */
export class MobileShellHubNavigationController {

    protected readonly host: MobileShellHubNavigationHost;
    protected readonly shell: ApplicationShell;
    protected readonly projectsService: MobileProjectsService;
    protected readonly sessionState: MobileShellSessionState;

    constructor(options: MobileShellHubNavigationOptions) {
        this.host = options.host;
        this.shell = options.shell;
        this.projectsService = options.projectsService;
        this.sessionState = options.sessionState;
    }

    /** Quita overlays de transcript/agente en `body` que quedan por encima del Work Hub (z-index 12950). */
    dismissMobileAgentTranscriptOverlays(): void {
        document.body.querySelectorAll('.theia-mobile-agent-transcript-root').forEach(node => {
            node.remove();
        });
    }

    isMobileWorkHubLandingVisible(): boolean {
        const panel = this.host.getProjectsPanel();
        return document.body.classList.contains('theia-mobile-mod-landing')
            && panel?.isVisible() === true
            && panel.isHomeMode() === true;
    }

    /**
     * Cambia la pestaña del Work Hub de forma síncrona (sin esperar a cerrar sheets).
     * Devuelve true si el panel landing ya estaba visible y la vista se aplicó al instante.
     */
    syncHubLandingNavigation(view: MobileProjectsHubView): boolean {
        this.sessionState.landingLeftThisSession = false;
        markMobileProjectsHomeVisible();
        if (view !== 'home') {
            this.projectsService.setHubView(view);
        }
        document.body.classList.add('theia-mobile-mod-landing');
        setMobileLandingHubListChrome(true);
        const panel = this.host.getProjectsPanel();
        if (!(panel?.isHomeMode() === true && panel.isVisible())) {
            return false;
        }
        if (panel.isProjectDetailView()) {
            panel.closeProjectDetail();
        }
        if (view === 'tasks') {
            this.host.warmLiveTransport();
            this.host.startActiveTasks();
            panel.preferComposerSurface('task');
        } else if (view === 'chat' || view === 'review') {
            this.host.warmLiveTransport();
        }
        panel.navigateHubTab(view);
        this.host.applyLandingChrome();
        this.host.syncMobileHubPrimaryBottomChrome();
        this.host.refreshBottomBar();
        this.host.refreshWorkbenchTopBar();
        this.host.ensureDesktopWorkHubSessionsSidebarOpen();
        return true;
    }

    /** Cierra overlays que no deben bloquear la navegación entre pestañas del hub. */
    async finalizeHubLandingNavigation(): Promise<void> {
        this.host.hidePullRequestPanel();
        try {
            await this.host.dismissSheetsAsync();
            if (this.shell.isExpanded('bottom')) {
                await this.shell.collapsePanel('bottom');
            }
            await this.host.collapseMobileSidePanels();
        } catch (e) {
            console.error('[qaap-mobile-shell] finalizeHubLandingNavigation failed', e);
        }
    }

    /** Abre el Work Hub a pantalla completa y selecciona una pestaña del landing (Home, Agents, Routines). */
    async openMobileWorkHubLanding(view: MobileProjectsHubView): Promise<void> {
        dismissQaapAccountMenu();
        clearPreferDesktopIde();
        installMobileWorkHubBootGuard();
        if (!this.host.isMobileActive()) {
            this.host.enterMobileLayout();
        }
        this.dismissMobileAgentTranscriptOverlays();
        if (this.syncHubLandingNavigation(view)) {
            void this.finalizeHubLandingNavigation();
            return;
        }
        void this.finalizeHubLandingNavigation();
        await this.host.showMobileProjectsHome(view);
        const resolved = this.host.getProjectsPanel();
        if (!resolved) {
            return;
        }
        if (resolved.isProjectDetailView()) {
            resolved.closeProjectDetail();
        }
        if (view === 'tasks') {
            this.host.warmLiveTransport();
            this.host.startActiveTasks();
            resolved.preferComposerSurface('task');
        } else if (view === 'chat' || view === 'review') {
            this.host.warmLiveTransport();
        }
        resolved.navigateHubTab(view);
        if (view !== 'home') {
            markPreferAgentsSurface();
        }
        this.host.syncMobileHubPrimaryBottomChrome();
        this.host.refreshBottomBar();
        this.host.refreshWorkbenchTopBar();
        this.host.ensureDesktopWorkHubSessionsSidebarOpen();
    }
}
