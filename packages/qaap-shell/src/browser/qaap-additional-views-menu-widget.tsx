// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { nls } from '@theia/core/lib/common';
import { codicon, Title, Widget } from '@theia/core/lib/browser/widgets';
import {
    AdditionalViewsMenuWidget
} from '@theia/core/lib/browser/shell/additional-views-menu-widget';
import { SideTabBar } from '@theia/core/lib/browser/shell/tab-bars';

/**
 * Compact activity-row "additional views" menu for narrow viewports.
 * Replaces product behavior formerly in core `AdditionalViewsMenuWidget`.
 */
@injectable()
export class QaapAdditionalViewsMenuWidget extends AdditionalViewsMenuWidget {

    override setHidden(_hidden: boolean): void {
        super.setHidden(false);
    }

    override updateAdditionalViews(sender: SideTabBar, event: { titles: Title<Widget>[]; startIndex: number }): void {
        const titles = event.startIndex === -1 ? sender.titles : event.titles;
        if (!titles.length) {
            this.removeMenu(AdditionalViewsMenuWidget.ID);
            this.menuDisposables.forEach(disposable => disposable.dispose());
            this.menuDisposables = [];
            return;
        }

        this.addMenu({
            title: nls.localizeByDefault('Additional Views'),
            iconClass: `${codicon('chevron-down')} theia-compact-menu`,
            id: AdditionalViewsMenuWidget.ID,
            menuPath: this.menuPath,
            order: 0
        });

        this.menuDisposables.forEach(disposable => disposable.dispose());
        this.menuDisposables = [];
        titles.forEach((title, i) => this.registerMenuAction(sender, title, i));
    }
}
