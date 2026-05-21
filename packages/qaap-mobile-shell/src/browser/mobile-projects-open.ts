// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Set before navigating to a workspace from the mobile Projects panel. */
export const QAAP_MOBILE_PROJECTS_OPEN_README_KEY = 'qaap.mobileProjects.openReadmeOnReady';

/** Keep the projects sheet closed after a workspace reload (clone / open). */
export const QAAP_MOBILE_PROJECTS_DISMISS_PANEL_KEY = 'qaap.mobileProjects.dismissPanel';

/** Dispatched synchronously so the sheet can close before `workspaceService.open` reloads the page. */
export const QAAP_MOBILE_PROJECTS_DISMISS_PANEL_EVENT = 'qaap-mobile-projects-dismiss-panel';

/** After GitHub OAuth, open the repository picker (or auto-open a single repo). */
export const QAAP_AUTH_OPEN_FIRST_REPO_EVENT = 'qaap-auth-open-first-repo';

export function markMobileProjectsPanelDismiss(): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_KEY, '1');
    }
}

export function consumeMobileProjectsPanelDismiss(): boolean {
    if (typeof sessionStorage === 'undefined') {
        return false;
    }
    if (sessionStorage.getItem(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_KEY) !== '1') {
        return false;
    }
    sessionStorage.removeItem(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_KEY);
    return true;
}

export function requestMobileProjectsPanelDismiss(): void {
    markMobileProjectsPanelDismiss();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(QAAP_MOBILE_PROJECTS_DISMISS_PANEL_EVENT));
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
