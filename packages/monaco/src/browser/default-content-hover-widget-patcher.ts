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

import { injectable } from '@theia/core/shared/inversify';
import { ApplicationShell, FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { SetActualHeightForContentHoverWidgetParams } from './content-hover-widget-patcher';
import { contentHoverWidgetPatcher } from './monaco-init';

@injectable()
export class DefaultContentHoverWidgetPatcher implements FrontendApplicationContribution {
    onStart(app: FrontendApplication): void {
        const shell = app.shell;

        this.updateContentHoverWidgetHeight({
            topHeight: this.getTopPanelHeight(shell),
            bottomHeight: this.getStatusBarHeight(shell)
        });

        shell['statusBar'].onDidChangeVisibility(() => {
            this.updateContentHoverWidgetHeight({
                bottomHeight: this.getStatusBarHeight(shell)
            });
        });
    }

    protected updateContentHoverWidgetHeight(params: SetActualHeightForContentHoverWidgetParams): void {
        contentHoverWidgetPatcher.setActualHeightForContentHoverWidget(params);
    }

    protected getTopPanelHeight(shell: ApplicationShell): number {
        return shell.topPanel.node.getBoundingClientRect().height;
    }

    protected getStatusBarHeight(shell: ApplicationShell): number {
        return shell['statusBar'].node.getBoundingClientRect().height;
    }
}
