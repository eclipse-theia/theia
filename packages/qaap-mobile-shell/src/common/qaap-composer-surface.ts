// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Composer target: local Theia chat vs VPS background task. */
export type QaapComposerSurface = 'chat' | 'task';

const COMPOSER_SURFACE_STORAGE_KEY = 'qaap.composerSurface';

export function scopedComposerSurfaceStorageKey(cwd: string | undefined): string {
    const scope = cwd?.trim() || 'global';
    return `${COMPOSER_SURFACE_STORAGE_KEY}:${scope}`;
}

export function readStoredComposerSurface(cwd: string | undefined): QaapComposerSurface | undefined {
    // The mobile shell only exposes the agentic Task surface; the local Chat surface was removed,
    // so legacy stored 'chat' values are ignored and callers fall back to 'task'.
    void cwd;
    return undefined;
}

export function writeStoredComposerSurface(cwd: string | undefined, surface: QaapComposerSurface): void {
    try {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(scopedComposerSurfaceStorageKey(cwd), surface);
            window.localStorage.setItem(COMPOSER_SURFACE_STORAGE_KEY, surface);
        }
    } catch {
        /* session-only */
    }
}

export function composerSurfaceHint(surface: QaapComposerSurface): { readonly key: string; readonly defaultLabel: string } {
    return surface === 'chat'
        ? { key: 'qaap/composerSurface/chatHint', defaultLabel: 'Local Coder chat — saved on this device' }
        : { key: 'qaap/composerSurface/taskHint', defaultLabel: 'Runs on the VPS — keeps going when you close the app' };
}
