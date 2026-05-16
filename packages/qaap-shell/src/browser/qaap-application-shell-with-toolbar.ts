// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { animationFrame, Layout, MAXIMIZED_CLASS, TheiaSplitPanel } from '@theia/core/lib/browser';
import { SidePanel } from '@theia/core/lib/browser/shell/side-panel-handler';
import { ApplicationShellWithToolbarOverride } from '@theia/toolbar/lib/browser/application-shell-with-toolbar-override';
import { QaapShellWithLeftRightSplit } from './qaap-shell-layout';

const BOTTOM_PANEL_TOGGLE_ID = 'bottom-panel-toggle';

/**
 * Qaap shell overrides on top of {@link ApplicationShellWithToolbarOverride} (browser apps use toolbar).
 */
@injectable()
export class QaapApplicationShellWithToolbar extends ApplicationShellWithToolbarOverride implements QaapShellWithLeftRightSplit {

    /**
     * Horizontal split: left sidebar | main + bottom stack | right sidebar.
     * Used by {@link MobileOneColumnShellContribution} for narrow-viewport layout.
     */
    leftRightSplitPanel!: TheiaSplitPanel;

    protected override createLayout(): Layout {
        const bottomSplitLayout = this.createSplitLayout(
            [this.mainPanel, this.bottomPanel],
            [1, 0],
            { orientation: 'vertical', spacing: 0 },
        );
        const panelForBottomArea = new TheiaSplitPanel({ layout: bottomSplitLayout });
        panelForBottomArea.id = 'theia-bottom-split-panel';

        const leftRightSplitLayout = this.createSplitLayout(
            [this.leftPanelHandler.container, panelForBottomArea, this.rightPanelHandler.container],
            [0, 1, 0],
            { orientation: 'horizontal', spacing: 0 },
        );
        const panelForSideAreas = new TheiaSplitPanel({ layout: leftRightSplitLayout });
        panelForSideAreas.id = 'theia-left-right-split-panel';
        this.leftRightSplitPanel = panelForSideAreas;

        return this.createBoxLayout(
            [this.topPanel, this.toolbar, panelForSideAreas, this.statusBar],
            [0, 0, 1, 0],
            { direction: 'top-to-bottom', spacing: 0 },
        );
    }

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
