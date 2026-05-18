// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { matchesMobileNarrowViewport } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { ShellLayoutTransformer } from '@theia/core/lib/browser/shell/shell-layout-restorer';
import { SidePanel } from '@theia/core/lib/browser/shell/side-panel-handler';

/** Minimum restored side panel width on desktop (mobile sessions often persist ~0). */
const MIN_DESKTOP_SIDE_PANEL_SIZE = 280;

/**
 * Clears corrupt side-panel sizes saved while the one-column mobile layout had split slots at width 0.
 */
@injectable()
export class QaapShellLayoutRestoreContribution implements ShellLayoutTransformer {

    transformLayoutOnRestore(layoutData: ApplicationShell.LayoutData): void {
        if (matchesMobileNarrowViewport()) {
            return;
        }
        this.fixSidePanelLayout(layoutData.leftPanel);
        this.fixSidePanelLayout(layoutData.rightPanel);
    }

    protected fixSidePanelLayout(panel: SidePanel.LayoutData | undefined): void {
        if (!panel?.size || panel.size >= MIN_DESKTOP_SIDE_PANEL_SIZE) {
            return;
        }
        panel.size = undefined;
    }
}
