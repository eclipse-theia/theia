// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { WidgetManager, WidgetOpenerOptions } from '@theia/core/lib/browser';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalCreationHandler } from '@theia/terminal/lib/browser/terminal-creation-handler';
import { TerminalManagerWidget } from './terminal-manager-widget';
import { TerminalManagerFrontendViewContribution } from './terminal-manager-frontend-view-contribution';
import { TerminalManagerPreferences } from './terminal-manager-preferences';

/**
 * A {@link TerminalCreationHandler} that routes terminals into the terminal
 * manager widget when tree grouping mode is active.
 *
 * This hooks into {@link TerminalFrontendContribution.open} so that terminals
 * created by any caller (plugins, tasks, debug, etc.) are routed into
 * the manager at the point of placement, rather than being intercepted
 * after the fact via `onDidCreateTerminal` events.
 *
 * Task and debug terminals are routed to dedicated pages in the tree;
 * regular user terminals get their own numbered pages.
 */
@injectable()
export class TerminalManagerCreationHandler implements TerminalCreationHandler {

    get priority(): number {
        return this.preferences.get('terminal.grouping.mode') === 'tree' ? 100 : -200;
    }

    @inject(TerminalManagerFrontendViewContribution)
    protected readonly terminalManagerViewContribution: TerminalManagerFrontendViewContribution;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(TerminalManagerPreferences)
    protected readonly preferences: TerminalManagerPreferences;

    async onWillOpenTerminal(terminal: TerminalWidget, _options?: WidgetOpenerOptions): Promise<boolean | undefined> {
        if (this.preferences.get('terminal.grouping.mode') !== 'tree') {
            return false;
        }

        if (terminal.hiddenFromUser) {
            return false;
        }

        const resolvedWidget = this.terminalManagerViewContribution.tryGetWidget()
            ?? await this.widgetManager.getOrCreateWidget<TerminalManagerWidget>(TerminalManagerWidget.ID);
        if (!(resolvedWidget instanceof TerminalManagerWidget)) {
            return false;
        }

        if (!resolvedWidget.terminalWidgetIdsToNodeIds.has(terminal.id)) {
            const specialConfig = resolvedWidget.treeWidget.model.getSpecialPageConfig(terminal.kind);
            resolvedWidget.addTerminalPage(terminal, specialConfig?.pageId);
            await this.terminalManagerViewContribution.openView({ reveal: true });
        }

        return true;
    }
}
