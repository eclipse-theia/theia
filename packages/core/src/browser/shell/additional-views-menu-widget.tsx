// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

import { inject, injectable } from '../../../shared/inversify';
import { Command, CommandRegistry, Disposable, MenuModelRegistry, MenuPath, nls } from '../../common';
import { Title, Widget, codicon } from '../widgets';
import { SidebarMenuWidget } from './sidebar-menu-widget';
import { SideTabBar } from './tab-bars';

export const AdditionalViewsMenuWidgetFactory = Symbol('AdditionalViewsMenuWidgetFactory');
export type AdditionalViewsMenuWidgetFactory = (side: 'left' | 'right') => AdditionalViewsMenuWidget;

export const AdditionalViewsMenuPath = Symbol('AdditionalViewsMenuPath');
@injectable()
export class AdditionalViewsMenuWidget extends SidebarMenuWidget {
    static readonly ID = 'sidebar.additional.views';

    @inject(AdditionalViewsMenuPath)
    protected menuPath: MenuPath;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(MenuModelRegistry)
    protected readonly menuModelRegistry: MenuModelRegistry;

    protected menuDisposables: Disposable[] = [];

    updateAdditionalViews(sender: SideTabBar, event: { titles: Title<Widget>[], startIndex: number }): void {
        if (event.startIndex === -1) {
            this.removeMenu(AdditionalViewsMenuWidget.ID);
        } else {
            this.addMenu({
                title: nls.localizeByDefault('Additional Views'),
                iconClass: codicon('ellipsis'),
                id: AdditionalViewsMenuWidget.ID,
                menuPath: this.menuPath,
                order: 0
            });
        }

        this.menuDisposables.forEach(disposable => disposable.dispose());
        this.menuDisposables = [];
        event.titles.forEach((title, i) => this.registerMenuAction(sender, title, i));
    }

    protected registerMenuAction(sender: SideTabBar, title: Title<Widget>, index: number): void {
        const command: Command = { id: `reveal.${title.label}.${index}`, label: title.label };
        this.menuDisposables.push(this.commandRegistry.registerCommand(command, {
            execute: () => {
                window.requestAnimationFrame(() => {
                    sender.currentIndex = sender.titles.indexOf(title);
                });
            }
        }));
        this.menuDisposables.push(this.menuModelRegistry.registerMenuAction(this.menuPath, { commandId: command.id, order: index.toString() }));
    }
}
