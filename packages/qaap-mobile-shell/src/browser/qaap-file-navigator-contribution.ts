// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { find } from '@lumino/algorithm';
import { FrontendApplication, ViewContainer } from '@theia/core/lib/browser';
import { OpenViewArguments } from '@theia/core/lib/browser/shell/view-contribution';
import {
    MOBILE_ONE_COLUMN_LAYOUT_CLASS,
    matchesMobileOneColumnLayout,
} from '@theia/core/lib/browser/shell/mobile-layout-state';
import { FileNavigatorContribution } from '@theia/navigator/lib/browser/navigator-contribution';
import { EXPLORER_VIEW_CONTAINER_ID } from '@theia/navigator/lib/browser/navigator-widget-factory';
import { FILE_NAVIGATOR_ID, FileNavigatorWidget } from '@theia/navigator/lib/browser/navigator-widget';

/**
 * Ensures the Explorer (file tree) is registered in the left activity strip. On desktop it is
 * opened on startup; on narrow mobile one-column layout the left sheet stays collapsed until the
 * user opens it (swipe / activity tab).
 */
@injectable()
export class QaapFileNavigatorContribution extends FileNavigatorContribution {

    override async initializeLayout(_app: FrontendApplication): Promise<void> {
        await this.ensureExplorerInLeftPanel(this.shouldActivateExplorerOnStartup());
    }

    onDidInitializeLayout(_app: FrontendApplication): void {
        const activate = this.shouldActivateExplorerOnStartup();
        void (async () => {
            if (!matchesMobileOneColumnLayout()) {
                await Promise.race([
                    this.shell.pendingUpdates,
                    new Promise<void>(resolve => window.setTimeout(resolve, 4000)),
                ]);
            }
            await this.ensureExplorerInLeftPanel(activate);
        })();
    }

    /** Register the explorer tab without expanding the mobile side sheet on startup / reload. */
    protected shouldActivateExplorerOnStartup(): boolean {
        return !matchesMobileOneColumnLayout()
            && !this.shell.node.classList.contains(MOBILE_ONE_COLUMN_LAYOUT_CLASS);
    }

    override async openView(args: Partial<OpenViewArguments> = {}): Promise<FileNavigatorWidget> {
        const activate = args.activate !== false;
        const reveal = args.reveal !== false;
        await this.ensureExplorerInLeftPanel(activate || reveal);
        return this.widgetManager.getOrCreateWidget(FILE_NAVIGATOR_ID);
    }

    /**
     * Register the explorer view container on the left activity strip and optionally show the file tree.
     */
    protected async ensureExplorerInLeftPanel(activate: boolean): Promise<void> {
        const viewContainer = await this.widgetManager.getOrCreateWidget<ViewContainer>(EXPLORER_VIEW_CONTAINER_ID);
        const leftHandler = this.shell.leftPanelHandler;
        const tabBar = leftHandler.tabBar;
        const hasTab = tabBar.titles.some(title => title.owner.id === EXPLORER_VIEW_CONTAINER_ID);
        const inDock = find(leftHandler.dockPanel.widgets(), w => w.id === EXPLORER_VIEW_CONTAINER_ID);

        if (!hasTab) {
            if (!inDock) {
                await this.shell.addWidget(viewContainer, {
                    area: 'left',
                    rank: this.defaultViewOptions.rank,
                });
            } else {
                tabBar.insertTab(0, viewContainer.title);
                leftHandler.refresh();
            }
        }

        if (activate) {
            await this.shell.activateWidget(EXPLORER_VIEW_CONTAINER_ID);
            await this.shell.revealWidget(FILE_NAVIGATOR_ID);
        }
    }

}
