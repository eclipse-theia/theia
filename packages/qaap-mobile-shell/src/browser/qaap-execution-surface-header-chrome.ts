// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Header execution tabs (Chat + overflow select) — shared by transcript sheet and project task detail. */
export type ExecutionSurfaceHeaderTabId = 'messages' | 'plan' | 'review' | 'preview' | 'files' | 'terminal';

/**
 * Mutual Chat vs overflow selection — single source of truth for transcript and task headers.
 * Drives `data-active-surface` + `theia-mod-selected` (same model as hub Chat/Task segmented control).
 */
export function applyExecutionSurfaceHeaderChrome(
    strip: HTMLElement,
    activeTab: ExecutionSurfaceHeaderTabId,
): void {
    const chatActive = activeTab === 'messages';
    strip.dataset.activeSurface = chatActive ? 'messages' : 'overflow';

    const chatBtn = strip.querySelector<HTMLButtonElement>('.theia-mobile-transcript-tab[data-tab="messages"]');
    if (chatBtn) {
        chatBtn.classList.remove('theia-mod-active');
        chatBtn.classList.toggle('theia-mod-selected', chatActive);
        chatBtn.dataset.surfaceActive = chatActive ? 'true' : 'false';
        chatBtn.setAttribute('aria-selected', chatActive ? 'true' : 'false');
    }

    const selectBtn = strip.querySelector<HTMLButtonElement>('.theia-mobile-transcript-tab-icon-select');
    if (selectBtn) {
        const selectActive = !chatActive;
        selectBtn.classList.remove('theia-mod-active');
        selectBtn.classList.toggle('theia-mod-selected', selectActive);
        selectBtn.dataset.surfaceActive = selectActive ? 'true' : 'false';
        selectBtn.setAttribute('aria-selected', selectActive ? 'true' : 'false');
    }
}
