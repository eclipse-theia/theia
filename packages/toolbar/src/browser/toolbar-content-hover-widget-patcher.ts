// *****************************************************************************
// Copyright (C) 2025 and others.
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

import { ApplicationShell, FrontendApplication } from '@theia/core/lib/browser';
import { injectable, interfaces } from '@theia/core/shared/inversify';
import { DefaultContentHoverWidgetPatcher } from '@theia/monaco/lib/browser/default-content-hover-widget-patcher';
import { ApplicationShellWithToolbarOverride } from './application-shell-with-toolbar-override';

@injectable()
export class ToolbarContentHoverWidgetPatcher extends DefaultContentHoverWidgetPatcher {

    override onStart(app: FrontendApplication): void {
        super.onStart(app);
        const shell = app.shell;
        if (shell instanceof ApplicationShellWithToolbarOverride) {
            shell['toolbar'].onDidChangeVisibility(() => {
                this.updateContentHoverWidgetHeight({
                    topHeight: this.getTopPanelHeight(shell)
                });
            });
        }
    }

    protected override getTopPanelHeight(shell: ApplicationShell): number {
        const defaultHeight = shell.topPanel.node.getBoundingClientRect().height;
        if (shell instanceof ApplicationShellWithToolbarOverride) {
            const toolbarHeight = shell['toolbar'].node.getBoundingClientRect().height;
            return defaultHeight + toolbarHeight;
        }
        return defaultHeight;
    }
}

export const bindToolbarContentHoverWidgetPatcher = (bind: interfaces.Bind, rebind: interfaces.Rebind, unbind: interfaces.Unbind): void => {
    bind(ToolbarContentHoverWidgetPatcher).toSelf().inSingletonScope();
    rebind(DefaultContentHoverWidgetPatcher).toService(ToolbarContentHoverWidgetPatcher);
};

