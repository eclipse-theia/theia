// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { matchesMobileNarrowViewport } from '@theia/core/lib/browser/shell/mobile-layout-state';

/** Same breakpoint as `MOBILE_NARROW_VIEWPORT_MEDIA_QUERY` / product theme CSS. */
export function isQaapNarrowMobileWorkbench(): boolean {
    return matchesMobileNarrowViewport();
}

/**
 * Remove side-panel widgets from persisted layout on narrow viewports.
 */
export function stripRightPanelWidgetsOnMobile(
    layoutData: ApplicationShell.LayoutData,
    widgetIds: string[]
): void {
    if (!isQaapNarrowMobileWorkbench()) {
        return;
    }
    const right = layoutData.rightPanel;
    if (!right?.items?.length) {
        return;
    }
    const idSet = new Set(widgetIds);
    const toRemove = right.items.filter(item => item.widget?.id && idSet.has(item.widget.id));
    if (!toRemove.length) {
        return;
    }
    right.items = right.items.filter(item => !item.widget?.id || !idSet.has(item.widget.id));
    for (const item of toRemove) {
        const w = item.widget;
        if (w && !w.isDisposed && !w.isAttached) {
            w.close();
        }
    }
}
