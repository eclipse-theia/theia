// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** User explicitly chose the classic IDE layout (explorer + editor tabs). Survives reload in sessionStorage. */
export const QAAP_MOBILE_PREFER_DESKTOP_IDE_KEY = 'qaap.mobileProjects.preferDesktopIde';

/** User is on the Agents / Work Hub workspace surface (not the project list landing). */
export const QAAP_MOBILE_PREFER_AGENTS_SURFACE_KEY = 'qaap.mobileProjects.preferAgentsSurface';

export function markPreferDesktopIde(): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(QAAP_MOBILE_PREFER_DESKTOP_IDE_KEY, '1');
        sessionStorage.removeItem(QAAP_MOBILE_PREFER_AGENTS_SURFACE_KEY);
    }
}

export function clearPreferDesktopIde(): void {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(QAAP_MOBILE_PREFER_DESKTOP_IDE_KEY);
    }
}

export function peekPreferDesktopIde(): boolean {
    return typeof sessionStorage !== 'undefined'
        && sessionStorage.getItem(QAAP_MOBILE_PREFER_DESKTOP_IDE_KEY) === '1';
}

export function markPreferAgentsSurface(): void {
    if (typeof sessionStorage !== 'undefined') {
        // Async mobile bootstrap must not clobber an explicit "Open IDE" choice.
        if (sessionStorage.getItem(QAAP_MOBILE_PREFER_DESKTOP_IDE_KEY) === '1') {
            return;
        }
        sessionStorage.setItem(QAAP_MOBILE_PREFER_AGENTS_SURFACE_KEY, '1');
        sessionStorage.removeItem(QAAP_MOBILE_PREFER_DESKTOP_IDE_KEY);
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

