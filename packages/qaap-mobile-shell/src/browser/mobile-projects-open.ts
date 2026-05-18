// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Set before navigating to a workspace from the mobile Projects panel. */
export const QAAP_MOBILE_PROJECTS_OPEN_README_KEY = 'qaap.mobileProjects.openReadmeOnReady';

export function markMobileProjectReadmeForOpen(): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(QAAP_MOBILE_PROJECTS_OPEN_README_KEY, '1');
    }
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
