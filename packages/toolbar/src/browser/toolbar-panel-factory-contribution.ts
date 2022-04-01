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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import {
    ApplicationShell,
    ShellLayoutContribution,
    Widget,
} from '@theia/core/lib/browser';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { MAXIMIZED_CLASS } from '@theia/core/lib/browser/shell/theia-dock-panel';
import { Toolbar, ToolbarFactory } from './toolbar-interfaces';
import { ToolbarPreferences, TOOLBAR_ENABLE_PREFERENCE_ID } from './toolbar-preference-contribution';

export function bindToolbarPanelFactory(bind: interfaces.Bind): void {
    bind(ToolbarPanelFactoryContribution).toSelf().inSingletonScope();
    bind(ShellLayoutContribution).toService(ToolbarPanelFactoryContribution);
}

@injectable()
export class ToolbarPanelFactoryContribution implements ShellLayoutContribution {

    priority = 500;

    @inject(ToolbarPreferences) protected readonly toolbarPreferences: ToolbarPreferences;
    @inject(ToolbarFactory) protected readonly toolbarFactory: () => Toolbar;

    createPanel(applicationShell: ApplicationShell): Widget {
        const toolbar = this.toolbarFactory();
        toolbar.id = 'main-toolbar';
        const toggleToolbar = this.toggleToolbar(applicationShell, toolbar);
        toggleToolbar();
        applicationShell.mainPanel.onDidToggleMaximized(() => toggleToolbar());
        applicationShell.bottomPanel.onDidToggleMaximized(() => toggleToolbar());
        this.toolbarPreferences.ready.then(() => toggleToolbar());
        this.toolbarPreferences.onPreferenceChanged(e => {
            if (e.preferenceName === TOOLBAR_ENABLE_PREFERENCE_ID) {
                toggleToolbar();
            }
        });
        return toolbar;
    }

    protected toggleToolbar(applicationShell: ApplicationShell, toolbar: Toolbar): () => void {
        return () => {
            const doShowToolbarFromPreference = this.toolbarPreferences[TOOLBAR_ENABLE_PREFERENCE_ID];
            const isShellMaximized = applicationShell.mainPanel.hasClass(MAXIMIZED_CLASS) || applicationShell.bottomPanel.hasClass(MAXIMIZED_CLASS);
            if (doShowToolbarFromPreference && !isShellMaximized) {
                toolbar.show();
            } else {
                toolbar.hide();
            }
        };
    }
}
