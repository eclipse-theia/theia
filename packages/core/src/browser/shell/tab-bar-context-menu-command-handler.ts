/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { CommandHandler } from '../../common';
import { TabBar, Title, Widget } from '../widgets';
import { ApplicationShell } from './application-shell';

type TabBarContextMenuCommandAdapterBooleanCheck = undefined | ((event: Event) => boolean);
type TabBarContextMenuCommandHandlerBooleanCheck = undefined | ((widget: Title<Widget> | undefined, tabbar: TabBar<Widget> | undefined, event: Event) => boolean);

export interface TabBarContextMenuCommandHandler extends CommandHandler {
    execute(widget: Title<Widget> | undefined, tabbar: TabBar<Widget> | undefined, event: Event): unknown;
    isEnabled: TabBarContextMenuCommandHandlerBooleanCheck;
    isVisible: TabBarContextMenuCommandHandlerBooleanCheck;
    isToggled: TabBarContextMenuCommandHandlerBooleanCheck;
}

export class TabBarContextMenuCommandAdapter implements CommandHandler {
    execute: (event: Event) => unknown;
    isEnabled: TabBarContextMenuCommandAdapterBooleanCheck;
    isVisible: TabBarContextMenuCommandAdapterBooleanCheck;
    isToggled: TabBarContextMenuCommandAdapterBooleanCheck;
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
        const tabBar = shell.findTabBarForEvent(event);
        if (tabBar) {
            const title = shell.findTitleForEvent(tabBar, event);
            if (title) {
                return [title, tabBar, event];
            }
        }
        return [undefined, tabBar, event];
    }
}
