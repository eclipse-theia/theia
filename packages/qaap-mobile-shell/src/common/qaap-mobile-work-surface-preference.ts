// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Legacy key from when the IDE choice survived reloads; kept so stale values can be cleared. */
export const QAAP_MOBILE_PREFER_DESKTOP_IDE_KEY = 'qaap.mobileProjects.preferDesktopIde';

/** Legacy key from when the IDE choice survived reloads; kept so stale values can be cleared. */
export const QAAP_MOBILE_EXPLICIT_DESKTOP_IDE_KEY = 'qaap.mobileProjects.explicitDesktopIde';

/** User is on the Agents / Work Hub workspace surface (not the project list landing). */
export const QAAP_MOBILE_PREFER_AGENTS_SURFACE_KEY = 'qaap.mobileProjects.preferAgentsSurface';

let preferDesktopIdeThisRuntime = false;

export function markPreferDesktopIde(): void {
    preferDesktopIdeThisRuntime = true;
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(QAAP_MOBILE_PREFER_DESKTOP_IDE_KEY);
        sessionStorage.removeItem(QAAP_MOBILE_EXPLICIT_DESKTOP_IDE_KEY);
        sessionStorage.removeItem(QAAP_MOBILE_PREFER_AGENTS_SURFACE_KEY);
    }
}

export function clearPreferDesktopIde(): void {
    preferDesktopIdeThisRuntime = false;
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(QAAP_MOBILE_PREFER_DESKTOP_IDE_KEY);
        sessionStorage.removeItem(QAAP_MOBILE_EXPLICIT_DESKTOP_IDE_KEY);
    }
}

export function peekPreferDesktopIde(): boolean {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(QAAP_MOBILE_PREFER_DESKTOP_IDE_KEY);
        sessionStorage.removeItem(QAAP_MOBILE_EXPLICIT_DESKTOP_IDE_KEY);
    }
    return preferDesktopIdeThisRuntime;
}

export function markPreferAgentsSurface(): void {
    if (typeof sessionStorage !== 'undefined') {
        // Async mobile bootstrap must not clobber an explicit "Open IDE" choice.
        if (peekPreferDesktopIde()) {
            return;
        }
        sessionStorage.setItem(QAAP_MOBILE_PREFER_AGENTS_SURFACE_KEY, '1');
        sessionStorage.removeItem(QAAP_MOBILE_PREFER_DESKTOP_IDE_KEY);
        sessionStorage.removeItem(QAAP_MOBILE_EXPLICIT_DESKTOP_IDE_KEY);
    }
}

export function clearPreferAgentsSurface(): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(QAAP_MOBILE_PREFER_AGENTS_SURFACE_KEY);
    }
}

export function peekPreferAgentsSurface(): boolean {
    return typeof sessionStorage !== 'undefined'
        && sessionStorage.getItem(QAAP_MOBILE_PREFER_AGENTS_SURFACE_KEY) === '1';
}

/** True when the URL already targets a workspace (available before WorkspaceService is ready). */
export function hasWorkspaceRouteInUrl(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, '').trim());
    return hash.length > 0 && hash !== '/';
}
