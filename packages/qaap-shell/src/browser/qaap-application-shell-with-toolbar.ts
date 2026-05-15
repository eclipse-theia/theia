// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { animationFrame } from '@theia/core/lib/browser';
import { MAXIMIZED_CLASS } from '@theia/core/lib/browser/shell/application-shell';
import { SidePanel } from '@theia/core/lib/browser/shell/side-panel-handler';
import { ApplicationShellWithToolbarOverride } from '@theia/toolbar/lib/browser/application-shell-with-toolbar-override';

const BOTTOM_PANEL_TOGGLE_ID = 'bottom-panel-toggle';

/**
 * Qaap shell overrides on top of {@link ApplicationShellWithToolbarOverride} (browser apps use toolbar).
 */
@injectable()
export class QaapApplicationShellWithToolbar extends ApplicationShellWithToolbarOverride {

    protected override collapseBottomPanel(): Promise<void> {
        const bottomPanel = this.bottomPanel;
        if (bottomPanel.hasClass(MAXIMIZED_CLASS) && this.unmaximize) {
            this.unmaximize();
            this.unmaximize = undefined;
        }
        if (bottomPanel.isHidden) {
            return Promise.resolve();
        }
        if (this.bottomPanelState.expansion === SidePanel.ExpansionState.expanded) {
            const size = this.getBottomPanelSize();
            if (size) {
                this.bottomPanelState.lastPanelSize = size;
            }
        }
        this.bottomPanelState.expansion = SidePanel.ExpansionState.collapsed;
        bottomPanel.hide();
        return animationFrame();
    }

    protected override refreshBottomPanelToggleButton(): void {
        this.statusBar.removeElement(BOTTOM_PANEL_TOGGLE_ID);
    }
}
