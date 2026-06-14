// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import {
    clearMobileProjectsHomeVisible,
    clearMobileWorkHubBootGuard,
    consumeMobileProjectsPanelDismiss,
    markMobileProjectsLeftLanding,
    markMobileProjectsPanelDismiss,
    markPreferAgentsSurface,
    QAAP_AUTH_OPEN_FIRST_REPO_EVENT,
    setMobileLandingHubListChrome,
    shouldSkipMobileProjectsLanding,
} from './mobile-projects-open';
import {
    peekHasPendingHubAction,
    shouldMarkLandingLeftFromStorage,
} from './mobile-shell-landing-state';
import { MobileShellSessionState } from './mobile-shell-session-state';
import type { MobileProjectsPanel } from './mobile-projects-panel';
import type { MobileProjectsService } from './mobile-projects-service';

export interface MobileShellLandingHost {
    getProjectsPanel(): MobileProjectsPanel | undefined;
    setProjectsPanel(panel: MobileProjectsPanel | undefined): void;
    ensureProjectsPanel(forceHomeMode?: boolean): void;
    hideProjectsPanel(): void;
    tryBootstrapMobileAgentsChat(): boolean;
    ensureMainContentAfterWorkspaceReload(): Promise<void>;
    refreshProjectBootstrapFromWorkspace(): void;
    ensureDesktopWorkHubSessionsSidebarOpen(): void;
    syncMobileHubPrimaryBottomChrome(): void;
    refreshBottomBar(): void;
    refreshWorkbenchTopBar(): void;
    scheduleSnapAndUiRefresh(): void;
}

export interface MobileShellLandingControllerOptions {
    host: MobileShellLandingHost;
    projectsService: MobileProjectsService;
    sessionState: MobileShellSessionState;
    mobileMq?: MediaQueryList;
}

/**
 * Landing dismiss, OAuth repo picker, sessionStorage sync, and Work Hub boot-guard release.
 * DOM side effects stay synchronous where the shell relies on anti-flash ordering.
 */
export class MobileShellLandingController {

    protected authListenerInstalled = false;

    protected readonly host: MobileShellLandingHost;
    protected readonly projectsService: MobileProjectsService;
    protected readonly sessionState: MobileShellSessionState;
    protected readonly mobileMq: MediaQueryList | undefined;

    get landingLeftThisSession(): boolean {
        return this.sessionState.landingLeftThisSession;
    }

    constructor(options: MobileShellLandingControllerOptions) {
        this.host = options.host;
        this.projectsService = options.projectsService;
        this.sessionState = options.sessionState;
        this.mobileMq = options.mobileMq;
    }

    installAuthListener(dispose: DisposableCollection): void {
        if (this.authListenerInstalled) {
            return;
        }
        this.authListenerInstalled = true;
        window.addEventListener(QAAP_AUTH_OPEN_FIRST_REPO_EVENT, this.onAuthOpenFirstRepo);
        dispose.push(Disposable.create(() => {
            window.removeEventListener(QAAP_AUTH_OPEN_FIRST_REPO_EVENT, this.onAuthOpenFirstRepo);
        }));
    }

    protected readonly onAuthOpenFirstRepo = (): void => {
        // Defer until the shell is ready — avoids racing OAuth return with layout init (mobile OOM).
        window.setTimeout(() => { void this.openFirstRepoAfterAuth(); }, 1500);
    };

    /** Post-OAuth: open the only repo automatically, otherwise show the clone picker. */
    async openFirstRepoAfterAuth(): Promise<void> {
        if (!this.mobileMq?.matches) {
            return;
        }
        try {
            const repos = await this.projectsService.listGithubRepositories();
            if (repos.length === 1 && repos[0].github) {
                this.projectsService.openInCurrentWindow(repos[0]);
                return;
            }
        } catch {
            /* fall through to picker */
        }
        this.host.ensureProjectsPanel();
        const panel = this.host.getProjectsPanel();
        if (panel) {
            await panel.showOpenRepositoryDialog();
        }
    }

    /**
     * After a workspace open the page reloads; the dismiss flag survives in sessionStorage.
     * Restore in-memory state before any async panel.show() so the landing cannot flash back.
     */
    syncFromStorage(): void {
        if (shouldMarkLandingLeftFromStorage()) {
            this.sessionState.landingLeftThisSession = true;
            document.body.classList.remove('theia-mobile-mod-landing');
        }
    }

    /** After clone/open the page reloads; keep the projects sheet closed on the new workspace. */
    applyMobileProjectsPanelDismissAfterReload(): void {
        const dismissed = consumeMobileProjectsPanelDismiss();
        if (dismissed) {
            this.sessionState.landingLeftThisSession = true;
            this.host.hideProjectsPanel();
            document.body.classList.remove('theia-mobile-mod-landing');
        }
        if (this.host.tryBootstrapMobileAgentsChat()) {
            return;
        }
        if (!dismissed) {
            return;
        }
        void this.host.ensureMainContentAfterWorkspaceReload();
        this.host.refreshProjectBootstrapFromWorkspace();
    }

    /** Work Hub landing is active — user has not opened/focused a project in this session yet. */
    isProjectsLandingSession(): boolean {
        return !this.sessionState.landingLeftThisSession && !shouldSkipMobileProjectsLanding();
    }

    hasPendingHubAction(): boolean {
        return peekHasPendingHubAction();
    }

    /** Add/remove the body class that lets CSS hide the bottom nav while the landing is up. */
    applyLandingChrome(): void {
        const panel = this.host.getProjectsPanel();
        const isLanding = !!(panel?.isHomeMode() && panel?.isVisible());
        document.body.classList.toggle('theia-mobile-mod-landing', isLanding);
        if (isLanding) {
            this.host.ensureDesktopWorkHubSessionsSidebarOpen();
            this.releaseMobileWorkHubBootGuard();
        }
    }

    /** Lift the boot guard only once Work Hub landing or the Agents chat shell is actually visible. */
    releaseMobileWorkHubBootGuard(): void {
        const panel = this.host.getProjectsPanel();
        const agentsReady = panel?.isVisible() === true
            && panel.isHomeMode()
            && panel.getHubView() === 'tasks'
            && (panel.isAgentsHubShellActive() || panel.node.classList.contains('theia-mod-agents-hub-landing'));
        const landingReady = panel?.isHomeMode() === true && panel.isVisible();
        if (agentsReady || landingReady) {
            clearMobileWorkHubBootGuard();
        }
    }

    /** Wait for composer-header CSS + panel paint before revealing the shell (avoids IDE stacking). */
    async releaseMobileWorkHubBootGuardWhenReady(): Promise<void> {
        if (typeof window !== 'undefined') {
            await new Promise<void>(resolve => {
                window.requestAnimationFrame(() => {
                    window.requestAnimationFrame(() => resolve());
                });
            });
        }
        this.releaseMobileWorkHubBootGuard();
    }

    /**
     * The user dismissed the landing — by opening a project or focusing the active workspace.
     * Drop the landing-mode panel so the next Projects open creates a sheet variant, and lift the
     * landing chrome lock so the bottom nav comes back.
     */
    onLandingDismissed(): void {
        markMobileProjectsLeftLanding();
        markMobileProjectsPanelDismiss();
        markPreferAgentsSurface();
        clearMobileProjectsHomeVisible();
        this.sessionState.landingLeftThisSession = true;
        const panel = this.host.getProjectsPanel();
        if (panel?.isHomeMode()) {
            panel.dispose();
            if (panel.node.parentElement) {
                panel.node.parentElement.removeChild(panel.node);
            }
            this.host.setProjectsPanel(undefined);
        }
        document.body.classList.remove('theia-mobile-mod-landing');
        setMobileLandingHubListChrome(false);
        this.host.refreshProjectBootstrapFromWorkspace();
        this.host.tryBootstrapMobileAgentsChat();
    }

    /** Hide the full-screen landing the moment the user picks a project. */
    leaveMobileProjectsLandingNow(): void {
        markMobileProjectsLeftLanding();
        markMobileProjectsPanelDismiss();
        markPreferAgentsSurface();
        clearMobileProjectsHomeVisible();
        this.sessionState.landingLeftThisSession = true;
        document.body.classList.remove('theia-mobile-mod-landing');
        setMobileLandingHubListChrome(false);
        const panel = this.host.getProjectsPanel();
        if (panel?.isHomeMode()) {
            panel.hide();
            this.onLandingDismissed();
            return;
        }
        panel?.hide();
        this.applyLandingChrome();
        this.host.refreshBottomBar();
        this.host.refreshWorkbenchTopBar();
    }

}