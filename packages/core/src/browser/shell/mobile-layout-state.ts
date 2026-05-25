// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Widget } from '../widgets/widget';
import { ApplicationShell } from './application-shell';

/**
 * DOM class applied to `#theia-app-shell` when the narrow-viewport (one-column) mobile layout is active.
 * Kept in `@theia/core` so packages such as the navigator can detect the mode without depending on
 * a concrete mobile-shell implementation.
 *
 * **Upstream / fork note:** this file (and call sites in `browser-menu-plugin.ts`, `tab-bars.ts`) are
 * intentional minimal hooks so multiple `@theia/*` features share one breakpoint.
 */
export const MOBILE_ONE_COLUMN_LAYOUT_CLASS = 'theia-mod-mobile-one-column';

/**
 * Breakpoint for narrow mobile layout. TypeScript should use this constant; CSS must duplicate the
 * value. Search the repo for `767px` when changing it.
 */
export const MOBILE_NARROW_VIEWPORT_MEDIA_QUERY = '(max-width: 767px)';

/** `true` when the viewport matches {@link MOBILE_NARROW_VIEWPORT_MEDIA_QUERY} (safe without `window`). */
export function matchesMobileNarrowViewport(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia(MOBILE_NARROW_VIEWPORT_MEDIA_QUERY).matches;
}

/** Collapse the left explorer sheet after navigation on one-column mobile layout. */
export function collapseLeftPanelIfMobileOneColumn(shell: ApplicationShell): void {
    if (!shell.node.classList.contains(MOBILE_ONE_COLUMN_LAYOUT_CLASS)) {
        return;
    }
    if (shell.isExpanded('left')) {
        void shell.collapsePanel('left');
    }
}

/** Collapse a side panel overlay after activating a widget on one-column mobile layout. */
export function collapseSidePanelForWidgetIfMobileOneColumn(shell: ApplicationShell, widget: Widget): void {
    if (!shell.node.classList.contains(MOBILE_ONE_COLUMN_LAYOUT_CLASS)) {
        return;
    }
    const area = shell.getAreaFor(widget);
    if (area && ApplicationShell.isSideArea(area) && shell.isExpanded(area)) {
        void shell.collapsePanel(area);
    }
}
