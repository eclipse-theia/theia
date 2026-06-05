// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Header execution tabs (overflow select) — shared by transcript sheet and project task detail. */
export type ExecutionSurfaceHeaderTabId = 'messages' | 'plan' | 'review' | 'preview' | 'files' | 'terminal';

/** Keeps the header view picker in sync with the active execution surface tab. */
export function applyExecutionSurfaceHeaderChrome(
    strip: HTMLElement,
    _activeTab: ExecutionSurfaceHeaderTabId,
): void {
    const selectBtn = strip.querySelector<HTMLButtonElement>('.theia-mobile-transcript-tab-icon-select');
    if (selectBtn) {
        selectBtn.classList.remove('theia-mod-active');
        selectBtn.classList.add('theia-mod-selected');
        selectBtn.dataset.surfaceActive = 'true';
        selectBtn.setAttribute('aria-selected', 'true');
    }
}
