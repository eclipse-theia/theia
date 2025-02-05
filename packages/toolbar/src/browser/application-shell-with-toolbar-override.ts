// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    ApplicationShell,
    Layout,
    PreferenceService,
    SplitPanel,
} from '@theia/core/lib/browser';
import { inject, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import { MAXIMIZED_CLASS } from '@theia/core/lib/browser/shell/theia-dock-panel';
import { Toolbar, ToolbarFactory } from './toolbar-interfaces';
import { ToolbarPreferences, TOOLBAR_ENABLE_PREFERENCE_ID } from './toolbar-preference-contribution';

@injectable()
export class ApplicationShellWithToolbarOverride extends ApplicationShell {
    @inject(ToolbarPreferences) protected toolbarPreferences: ToolbarPreferences;
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;
    @inject(ToolbarFactory) protected readonly toolbarFactory: () => Toolbar;

    protected toolbar: Toolbar;

    @postConstruct()
    protected override init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        this.toolbar = this.toolbarFactory();
        this.toolbar.id = 'main-toolbar';
        super.init();
        await this.toolbarPreferences.ready;
        this.tryShowToolbar();
        this.mainPanel.onDidToggleMaximized(() => {
            this.tryShowToolbar();
        });
        this.bottomPanel.onDidToggleMaximized(() => {
            this.tryShowToolbar();
        });
        this.preferenceService.onPreferenceChanged(event => {
            if (event.preferenceName === TOOLBAR_ENABLE_PREFERENCE_ID) {
                this.tryShowToolbar();
            }
        });
    }

    protected tryShowToolbar(): boolean {
        const doShowToolbarFromPreference = this.toolbarPreferences[TOOLBAR_ENABLE_PREFERENCE_ID];
        const isShellMaximized = this.mainPanel.hasClass(MAXIMIZED_CLASS) || this.bottomPanel.hasClass(MAXIMIZED_CLASS);
        if (doShowToolbarFromPreference && !isShellMaximized) {
            this.toolbar.show();
            return true;
        }
        this.toolbar.hide();
        return false;
    }

    protected override createLayout(): Layout {
        const bottomSplitLayout = this.createSplitLayout(
            [this.mainPanel, this.bottomPanel],
            [1, 0],
            { orientation: 'vertical', spacing: 0 },
        );
        const panelForBottomArea = new SplitPanel({ layout: bottomSplitLayout });
        panelForBottomArea.id = 'theia-bottom-split-panel';

        const leftRightSplitLayout = this.createSplitLayout(
            [this.leftPanelHandler.container, panelForBottomArea, this.rightPanelHandler.container],
            [0, 1, 0],
            { orientation: 'horizontal', spacing: 0 },
        );
        const panelForSideAreas = new SplitPanel({ layout: leftRightSplitLayout });
        panelForSideAreas.id = 'theia-left-right-split-panel';
        return this.createBoxLayout(
            [this.topPanel, this.toolbar, panelForSideAreas, this.statusBar],
            [0, 0, 1, 0],
            { direction: 'top-to-bottom', spacing: 0 },
        );
    }
}

export const bindToolbarApplicationShell = (bind: interfaces.Bind, rebind: interfaces.Rebind, unbind: interfaces.Unbind): void => {
    bind(ApplicationShellWithToolbarOverride).toSelf().inSingletonScope();
    rebind(ApplicationShell).toService(ApplicationShellWithToolbarOverride);
};
