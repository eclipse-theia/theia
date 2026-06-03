// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** React mount target; keeps sibling resize handles on the inspector slot intact. */
export const QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS = 'qaap-preview-inspector-panel-root';

export function ensurePreviewInspectorPanelRoot(slot: HTMLElement): HTMLElement {
    const selector = `:scope > .${QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS}`;
    const existing = slot.querySelector(selector);
    if (existing instanceof HTMLElement) {
        return existing;
    }
    const panelRoot = document.createElement('div');
    panelRoot.className = QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS;
    slot.append(panelRoot);
    return panelRoot;
}
