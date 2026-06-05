// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { matchesMobileOneColumnLayout } from '@theia/core/lib/browser/shell/mobile-layout-state';
import {
    clearPreferAgentsSurface,
    clearPreferDesktopIde,
    hasWorkspaceRouteInUrl,
    markPreferAgentsSurface,
    markPreferDesktopIde,
    peekPreferAgentsSurface,
    peekPreferDesktopIde,
} from '../common/qaap-mobile-work-surface-preference';

export {
    clearPreferAgentsSurface,
    clearPreferDesktopIde,
    hasWorkspaceRouteInUrl,
    markPreferAgentsSurface,
    markPreferDesktopIde,
    peekPreferAgentsSurface,
    peekPreferDesktopIde,
    QAAP_MOBILE_PREFER_AGENTS_SURFACE_KEY,
    QAAP_MOBILE_PREFER_DESKTOP_IDE_KEY,
} from '../common/qaap-mobile-work-surface-preference';

/** Set before navigating to a workspace from the mobile Projects panel. */
export const QAAP_MOBILE_PROJECTS_OPEN_README_KEY = 'qaap.mobileProjects.openReadmeOnReady';

/** Keep the projects sheet closed after a workspace reload (clone / open). */
export const QAAP_MOBILE_PROJECTS_DISMISS_PANEL_KEY = 'qaap.mobileProjects.dismissPanel';

/** User is currently on the mobile Projects home. Reload should restore Projects, not workspace. */
export const QAAP_MOBILE_PROJECTS_HOME_VISIBLE_KEY = 'qaap.mobileProjects.homeVisible';

/** @deprecated Landing state is in-memory only; reloads should return mobile users to Projects. */
export const QAAP_MOBILE_PROJECTS_LEFT_LANDING_KEY = 'qaap.mobileProjects.leftLanding';

/** Dispatched synchronously so the sheet can close before `workspaceService.open` reloads the page. */
export const QAAP_MOBILE_PROJECTS_DISMISS_PANEL_EVENT = 'qaap-mobile-projects-dismiss-panel';

/** After GitHub OAuth, open the repository picker (or auto-open a single repo). */
export const QAAP_AUTH_OPEN_FIRST_REPO_EVENT = 'qaap-auth-open-first-repo';

const QAAP_MOBILE_WORK_HUB_BOOT_CLASS = 'theia-mobile-workhub-boot';

/** One-shot gate so `consumeMobileProjectsPanelDismiss()` fires its idempotent cleanup once per page load. */
let mobileProjectsPanelDismissConsumed = false;

installMobileWorkHubBootGuard();

export function markMobileProjectsLeftLanding(): void {
    /* Intentionally no-op. The shell keeps this state in memory for the current runtime only. */
}

export function hasMobileProjectsLeftLanding(): boolean {
    return false;
}

export function markMobileProjectsPanelDismiss(): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_KEY, '1');
        sessionStorage.removeItem(QAAP_MOBILE_PROJECTS_HOME_VISIBLE_KEY);
        if (!peekPreferDesktopIde()) {
            clearPreferDesktopIde();
            markPreferAgentsSurface();
        }
        mobileProjectsPanelDismissConsumed = false;
        markMobileProjectsLeftLanding();
    }
}

export function peekMobileProjectsPanelDismiss(): boolean {
    if (typeof sessionStorage === 'undefined') {
        return false;
    }
    return isFreshMobileProjectsPanelDismiss(sessionStorage.getItem(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_KEY));
}

/**
 * Fires the idempotent post-reload cleanup at most once per page load. The dismiss flag itself
 * persists in sessionStorage so future reloads keep skipping the landing — it is cleared only
 * when the user explicitly returns to the Work Hub via `markMobileProjectsHomeVisible()`.
 */
export function consumeMobileProjectsPanelDismiss(): boolean {
    if (mobileProjectsPanelDismissConsumed) {
        return false;
    }
    if (!peekMobileProjectsPanelDismiss()) {
        return false;
    }
    mobileProjectsPanelDismissConsumed = true;
    return true;
}

export function requestMobileProjectsPanelDismiss(): void {
    markMobileProjectsPanelDismiss();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_EVENT));
    }
}

/** True when the user already chose to enter a workspace (survives reload via sessionStorage). */
export function shouldSkipMobileProjectsLanding(): boolean {
    return peekMobileProjectsPanelDismiss() && !peekMobileProjectsHomeVisible();
}

/**
 * Keep the Agents / Work Hub surface after reload and viewport resize until the user explicitly
 * opens the classic IDE ({@link markPreferDesktopIde}).
 */
export function shouldPreferWorkHubAgentsLayout(): boolean {
    if (peekPreferDesktopIde()) {
        return false;
    }
    return peekPreferAgentsSurface() || shouldSkipMobileProjectsLanding();
}

/**
 * Mobile sessions with a workspace already targeted should boot straight into the Agents
 * execution shell (inline agentic chat), not the IDE main area or the project-list landing.
 */
export function shouldBootstrapMobileAgentsChat(): boolean {
    if (peekPreferDesktopIde() || peekMobileProjectsHomeVisible()) {
        return false;
    }
    return hasWorkspaceRouteInUrl() || shouldPreferWorkHubAgentsLayout();
}

function isFreshMobileProjectsPanelDismiss(raw: string | null): boolean {
    return raw === '1';
}

export function markMobileProjectsHomeVisible(): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(QAAP_MOBILE_PROJECTS_HOME_VISIBLE_KEY, '1');
        sessionStorage.removeItem(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_KEY);
        clearPreferAgentsSurface();
    }
    installMobileWorkHubBootGuard();
}

export function clearMobileProjectsHomeVisible(): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(QAAP_MOBILE_PROJECTS_HOME_VISIBLE_KEY);
    }
}

export function peekMobileProjectsHomeVisible(): boolean {
    return typeof sessionStorage !== 'undefined'
        && sessionStorage.getItem(QAAP_MOBILE_PROJECTS_HOME_VISIBLE_KEY) === '1';
}

/** Hide the IDE shell until Work Hub or Agents chat is mounted (also runs from qaap-login-gate.js). */
export function installMobileWorkHubBootGuard(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return;
    }
    const mobile = matchesMobileOneColumnLayout();
    const hasPendingHubAction = typeof sessionStorage !== 'undefined'
        && sessionStorage.getItem('qaap.hub.pendingAction') !== null;
    if (!mobile || peekPreferDesktopIde() || peekMobileProjectsHomeVisible() || hasPendingHubAction) {
        return;
    }
    document.documentElement.classList.add(QAAP_MOBILE_WORK_HUB_BOOT_CLASS);
}

export function clearMobileWorkHubBootGuard(): void {
    if (typeof document !== 'undefined') {
        document.documentElement.classList.remove(QAAP_MOBILE_WORK_HUB_BOOT_CLASS);
    }
}

/** Work Hub landing list (all projects collapsed): show bottom navigation like the hub mock. */
export const QAAP_MOBILE_LANDING_HUB_LIST_BODY_CLASS = 'theia-mobile-mod-landing-hub-list';

export const QAAP_MOBILE_LANDING_HUB_LIST_CHANGED_EVENT = 'qaap-mobile-landing-hub-list-changed';

export function setMobileLandingHubListChrome(visible: boolean): void {
    if (typeof document === 'undefined') {
        return;
    }
    const alreadyVisible = document.body.classList.contains(QAAP_MOBILE_LANDING_HUB_LIST_BODY_CLASS);
    if (alreadyVisible === visible) {
        return;
    }
    document.body.classList.toggle(QAAP_MOBILE_LANDING_HUB_LIST_BODY_CLASS, visible);
    window.dispatchEvent(new CustomEvent(QAAP_MOBILE_LANDING_HUB_LIST_CHANGED_EVENT, { detail: { visible } }));
}

/**
 * Work Hub primary surface (Agents landing, hub list, empty workspace chat): navigation lives in
 * the sessions sidebar — hide the legacy bottom activity bar and status strip.
 */
export const QAAP_MOBILE_WORKHUB_HIDE_BOTTOM_CHROME_BODY_CLASS = 'theia-mobile-mod-workhub-no-bottom-chrome';

export function setMobileWorkHubHideBottomChrome(hidden: boolean): void {
    if (typeof document === 'undefined') {
        return;
    }
    document.body.classList.toggle(QAAP_MOBILE_WORKHUB_HIDE_BOTTOM_CHROME_BODY_CLASS, hidden);
}

/** Tasks/Chat hub header with composer surface toggle — hide duplicate account control in top bars. */
export const QAAP_MOBILE_WORKHUB_COMPOSER_HEADER_BODY_CLASS = 'theia-mobile-mod-workhub-composer-header';

export function setMobileWorkHubComposerHeaderChrome(visible: boolean): void {
    if (typeof document === 'undefined') {
        return;
    }
    document.body.classList.toggle(QAAP_MOBILE_WORKHUB_COMPOSER_HEADER_BODY_CLASS, visible);
}

/** Full-screen agent transcript (mockup chat-active): hide hub landing chrome and hub bottom bar. */
export const QAAP_MOBILE_ACTIVE_TRANSCRIPT_BODY_CLASS = 'theia-mobile-mod-active-transcript';

export function setMobileActiveTranscriptChrome(active: boolean): void {
    if (typeof document === 'undefined') {
        return;
    }
    document.body.classList.toggle(QAAP_MOBILE_ACTIVE_TRANSCRIPT_BODY_CLASS, active);
}

export function markMobileProjectReadmeForOpen(): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(QAAP_MOBILE_PROJECTS_OPEN_README_KEY, '1');
    }
}

/** Check the README-open request without consuming it; survives premature workspace events. */
export function peekMobileProjectReadmeOpenRequest(): boolean {
    if (typeof sessionStorage === 'undefined') {
        return false;
    }
    return sessionStorage.getItem(QAAP_MOBILE_PROJECTS_OPEN_README_KEY) === '1';
}

export function consumeMobileProjectReadmeOpenRequest(): boolean {
    if (typeof sessionStorage === 'undefined') {
        return false;
    }
    if (sessionStorage.getItem(QAAP_MOBILE_PROJECTS_OPEN_README_KEY) !== '1') {
        return false;
    }
    sessionStorage.removeItem(QAAP_MOBILE_PROJECTS_OPEN_README_KEY);
    return true;
}

export function clearMobileProjectReadmeOpenRequest(): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(QAAP_MOBILE_PROJECTS_OPEN_README_KEY);
    }
}
