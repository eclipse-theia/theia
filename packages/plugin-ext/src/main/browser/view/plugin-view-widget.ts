/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { Panel } from '@phosphor/widgets';
import { MenuModelRegistry, ActionMenuNode, MenuPath } from '@theia/core/lib/common/menu';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { ViewContainerPart } from '@theia/core/lib/browser/view-container';
import { View } from '../../../common';
import { ViewContextKeyService } from './view-context-key-service';

export const PLUGIN_VIEW_TITLE_MENU: MenuPath = ['plugin-view-title-menu'];

export const PluginViewWidgetFactory = Symbol('PluginViewWidgetFactory');
export type PluginViewWidgetFactory = (options: PluginViewWidgetOptions) => PluginViewWidget;

@injectable()
export class PluginViewWidgetOptions {
    view: View;
}

@injectable()
export class PluginViewWidget extends Panel implements ViewContainerPart.ContainedWidget {

    @inject(MenuModelRegistry)
    protected readonly menus: MenuModelRegistry;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ViewContextKeyService)
    protected readonly contextKeys: ViewContextKeyService;

    @inject(PluginViewWidgetOptions)
    protected readonly options: PluginViewWidgetOptions;

    get toolbarElements(): ViewContainerPart.ToolbarElement[] {
        return this.contextKeys.with({ view: this.options.view.id }, () => {
            const menu = this.menus.getMenu(PLUGIN_VIEW_TITLE_MENU);
            const elements: ViewContainerPart.ToolbarElement[] = [];
            for (const item of menu.children) {
                if (item instanceof ActionMenuNode) {
                    const { icon } = item;
                    if (icon && this.commands.isVisible(item.action.commandId) && this.contextKeys.match(item.action.when)) {
                        elements.push({
                            className: icon,
                            tooltip: item.label,
                            execute: () => this.commands.executeCommand(item.action.commandId)
                        });
                    }
                }
            }
            return elements;
        });
    }

}
