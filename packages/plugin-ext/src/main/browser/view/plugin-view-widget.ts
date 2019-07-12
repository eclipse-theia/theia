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

import { injectable, inject, postConstruct } from 'inversify';
import { Panel, Widget } from '@phosphor/widgets';
import { MenuModelRegistry, ActionMenuNode, MenuPath, CompositeMenuNode } from '@theia/core/lib/common/menu';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { ViewContainerPart } from '@theia/core/lib/browser/view-container';
import { ViewContextKeyService } from './view-context-key-service';
import { StatefulWidget } from '@theia/core/lib/browser/shell/shell-layout-restorer';
import { Message } from '@phosphor/messaging';

export const PLUGIN_VIEW_TITLE_MENU: MenuPath = ['plugin-view-title-menu'];

@injectable()
export class PluginViewWidgetIdentifier {
    id: string;
    viewId: string;
}

@injectable()
export class PluginViewWidget extends Panel implements ViewContainerPart.ContainedWidget, StatefulWidget {

    @inject(MenuModelRegistry)
    protected readonly menus: MenuModelRegistry;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ViewContextKeyService)
    protected readonly contextKeys: ViewContextKeyService;

    @inject(PluginViewWidgetIdentifier)
    readonly options: PluginViewWidgetIdentifier;

    constructor() {
        super();
        this.node.tabIndex = -1;
        this.node.style.height = '100%';
    }

    @postConstruct()
    protected init(): void {
        this.id = this.options.id;
    }

    get toolbarElements(): ViewContainerPart.ToolbarElement[] {
        return this.contextKeys.with({ view: this.options.viewId }, () => {
            const menu = this.menus.getMenu(PLUGIN_VIEW_TITLE_MENU);
            const elements: ViewContainerPart.ToolbarElement[] = [];
            for (const groupItem of menu.children) {
                if (groupItem instanceof CompositeMenuNode) {
                    const group = groupItem.id;
                    for (const item of groupItem.children) {
                        if (item instanceof ActionMenuNode) {
                            if (this.commands.isVisible(item.action.commandId) && this.contextKeys.match(item.action.when)) {
                                const priority = item.action.order !== undefined && Number(item.action.order) || undefined;
                                elements.push({
                                    className: item.icon,
                                    tooltip: item.label,
                                    group,
                                    priority,
                                    execute: () => this.commands.executeCommand(item.action.commandId)
                                });
                            }
                        }
                    }
                }
            }
            return elements;
        });
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const widget = this.widgets[0];
        if (widget) {
            widget.activate();
        } else {
            this.node.focus();
        }
    }

    storeState(): PluginViewWidget.State {
        return {
            label: this.title.label,
            widgets: this.widgets
        };
    }

    restoreState(state: PluginViewWidget.State): void {
        this.title.label = state.label;
        for (const widget of state.widgets) {
            this.addWidget(widget);
        }
    }

}
export namespace PluginViewWidget {
    export interface State {
        label: string
        widgets: ReadonlyArray<Widget>
    }
}
