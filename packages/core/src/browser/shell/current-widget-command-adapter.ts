// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { CommandHandler } from '../../common';
import { TabBar, Title, Widget } from '../widgets';
import { ApplicationShell } from './application-shell';

type CurrentWidgetCommandAdapterBooleanCheck = (event: Event) => boolean;
type CurrentWidgetCommandHandlerBooleanCheck = (title: Title<Widget> | undefined, tabbar: TabBar<Widget> | undefined, event: Event) => boolean;

export interface TabBarContextMenuCommandHandler extends CommandHandler {
    execute(title: Title<Widget> | undefined, tabbar: TabBar<Widget> | undefined, event: Event): unknown;
    isEnabled?: CurrentWidgetCommandHandlerBooleanCheck;
    isVisible?: CurrentWidgetCommandHandlerBooleanCheck;
    isToggled?: CurrentWidgetCommandHandlerBooleanCheck;
}

/**
 * Creates a command handler that acts on either the widget targeted by a DOM event or the current widget.
 */
export class CurrentWidgetCommandAdapter implements CommandHandler {
    execute: (event: Event) => unknown;
    isEnabled?: CurrentWidgetCommandAdapterBooleanCheck;
    isVisible?: CurrentWidgetCommandAdapterBooleanCheck;
    isToggled?: CurrentWidgetCommandAdapterBooleanCheck;
    constructor(shell: ApplicationShell, handler: TabBarContextMenuCommandHandler) {
        this.execute = (event: Event) => handler.execute(...this.transformArguments(shell, event));
        if (handler.isEnabled) {
            this.isEnabled = (event: Event) => !!handler.isEnabled?.(...this.transformArguments(shell, event));
        }
        if (handler.isVisible) {
            this.isVisible = (event: Event) => !!handler.isVisible?.(...this.transformArguments(shell, event));
        }
        if (handler.isToggled) {
            this.isToggled = (event: Event) => !!handler.isToggled?.(...this.transformArguments(shell, event));
        }
    }

    protected transformArguments(shell: ApplicationShell, event: Event): [Title<Widget> | undefined, TabBar<Widget> | undefined, Event] {
        const tabBar = shell.findTabBar(event);
        const title = tabBar && shell.findTitle(tabBar, event);
        return [title, tabBar, event];
    }
}
