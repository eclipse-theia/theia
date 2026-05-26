// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

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

const QAAP_MOBILE_PROJECTS_DISMISS_PANEL_TTL_MS = 8_000;
const QAAP_MOBILE_WORK_HUB_BOOT_CLASS = 'theia-mobile-workhub-boot';

installMobileWorkHubBootGuard();

export function markMobileProjectsLeftLanding(): void {
    /* Intentionally no-op. The shell keeps this state in memory for the current runtime only. */
}

export function hasMobileProjectsLeftLanding(): boolean {
    return false;
}

export function markMobileProjectsPanelDismiss(): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_KEY, String(Date.now()));
        sessionStorage.removeItem(QAAP_MOBILE_PROJECTS_HOME_VISIBLE_KEY);
        markMobileProjectsLeftLanding();
    }
}

export function peekMobileProjectsPanelDismiss(): boolean {
    if (typeof sessionStorage === 'undefined') {
        return false;
    }
    return isFreshMobileProjectsPanelDismiss(sessionStorage.getItem(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_KEY));
}

export function consumeMobileProjectsPanelDismiss(): boolean {
    if (typeof sessionStorage === 'undefined') {
        return false;
    }
    if (!isFreshMobileProjectsPanelDismiss(sessionStorage.getItem(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_KEY))) {
        sessionStorage.removeItem(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_KEY);
        return false;
    }
    sessionStorage.removeItem(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_KEY);
    return true;
}

export function requestMobileProjectsPanelDismiss(): void {
    markMobileProjectsPanelDismiss();
    clearMobileWorkHubBootGuard();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_EVENT));
    }
}

/** True when the user already chose to enter a workspace (survives reload via sessionStorage). */
export function shouldSkipMobileProjectsLanding(): boolean {
    return peekMobileProjectsPanelDismiss() && !peekMobileProjectsHomeVisible();
}

function isFreshMobileProjectsPanelDismiss(raw: string | null): boolean {
    if (!raw || raw === '1') {
        return false;
    }
    const timestamp = Number(raw);
    return Number.isFinite(timestamp) && Date.now() - timestamp <= QAAP_MOBILE_PROJECTS_DISMISS_PANEL_TTL_MS;
}

export function markMobileProjectsHomeVisible(): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(QAAP_MOBILE_PROJECTS_HOME_VISIBLE_KEY, '1');
        sessionStorage.removeItem(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_KEY);
    }
    installMobileWorkHubBootGuard();
}

export function clearMobileProjectsHomeVisible(): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(QAAP_MOBILE_PROJECTS_HOME_VISIBLE_KEY);
    }
    clearMobileWorkHubBootGuard();
}

export function peekMobileProjectsHomeVisible(): boolean {
    return typeof sessionStorage !== 'undefined'
        && sessionStorage.getItem(QAAP_MOBILE_PROJECTS_HOME_VISIBLE_KEY) === '1';
}

function installMobileWorkHubBootGuard(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return;
    }
    const mobile = typeof window.matchMedia === 'function'
        && window.matchMedia('(max-width: 767px)').matches;
    const hasPendingHubAction = typeof sessionStorage !== 'undefined'
        && sessionStorage.getItem('qaap.hub.pendingAction') !== null;
    if (mobile && !shouldSkipMobileProjectsLanding() && !hasPendingHubAction) {
        document.documentElement.classList.add(QAAP_MOBILE_WORK_HUB_BOOT_CLASS);
    }
}

export function clearMobileWorkHubBootGuard(): void {
    if (typeof document !== 'undefined') {
        document.documentElement.classList.remove(QAAP_MOBILE_WORK_HUB_BOOT_CLASS);
    }
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
