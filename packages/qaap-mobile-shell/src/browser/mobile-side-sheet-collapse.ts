// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ApplicationShell, Widget } from '@theia/core/lib/browser';
import { MOBILE_ONE_COLUMN_LAYOUT_CLASS } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { SCM_VIEW_CONTAINER_ID } from '@theia/scm/lib/browser/scm-contribution';

export type MobileShellSide = 'left' | 'right';

/** Mobile one-column sheets stay visible until these classes are applied on the content panel. */
export function markMobileSidePanelCollapsed(side: MobileShellSide): void {
    const id = side === 'left' ? 'theia-left-content-panel' : 'theia-right-content-panel';
    document.getElementById(id)?.classList.add('theia-mod-collapsed', 'lm-mod-hidden');
}

export function isMobileOneColumnLayout(shell: ApplicationShell): boolean {
    return shell.node.classList.contains(MOBILE_ONE_COLUMN_LAYOUT_CLASS);
}

export async function collapseShellSidePanel(shell: ApplicationShell, side: MobileShellSide): Promise<void> {
    if (shell.isExpanded(side)) {
        await shell.collapsePanel(side);
    }
    if (isMobileOneColumnLayout(shell)) {
        markMobileSidePanelCollapsed(side);
    }
}

/**
 * Collapse the left/right shell area that contains {@link widget}, so the main editor column is visible
 * after opening a file from a side view (SCM, explorer, …).
 */
export async function collapseShellSidePanelContainingWidget(shell: ApplicationShell, widget: Widget): Promise<void> {
    const directArea = shell.getAreaFor(widget);
    if (directArea === 'left' || directArea === 'right') {
        await collapseShellSidePanel(shell, directArea);
        return;
    }
    let current: Widget | null = widget.parent;
    while (current) {
        const area = shell.getAreaFor(current);
        if (area === 'left' || area === 'right') {
            await collapseShellSidePanel(shell, area);
            return;
        }
        current = current.parent;
    }
    const leftTabIds = shell.leftPanelHandler.tabBar.titles.map(title => title.owner.id);
    if (leftTabIds.includes(SCM_VIEW_CONTAINER_ID) && shell.isExpanded('left')) {
        await collapseShellSidePanel(shell, 'left');
    }
}
