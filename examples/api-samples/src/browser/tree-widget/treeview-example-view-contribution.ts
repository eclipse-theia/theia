// *****************************************************************************
// Copyright (C) 2025 Stefan Winkler and others.
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

import { Command, CommandRegistry, MenuModelRegistry } from '@theia/core';
import { AbstractViewContribution } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';
import { ExampleTreeNode } from './treeview-example-model';
import { TREEVIEW_EXAMPLE_CONTEXT_MENU, TreeViewExampleWidget } from './treeview-example-widget';

/** Definition of a command to show the TreeView Example View */
export const OpenTreeviewExampleView: Command = {
    id: 'theia-examples:treeview-example-view-command-id'
};

/** Definition of a command to add a new child (to demonstrate context menus) */
export const TreeviewExampleTreeAddItem: Command = {
    id: 'theia-examples:treeview-example-tree-add-item-command-id',
    label: 'Example Tree View: Add New Child'
};

/**
 * Contribution of the `TreeViewExampleWidget`
 */
@injectable()
export class TreeviewExampleViewContribution extends AbstractViewContribution<TreeViewExampleWidget> {
    constructor() {
        super({
            widgetId: TreeViewExampleWidget.ID,
            widgetName: TreeViewExampleWidget.LABEL,
            defaultWidgetOptions: {
                area: 'right' // Can be 'left', 'right', 'bottom', 'main'
            },
            toggleCommandId: OpenTreeviewExampleView.id
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);

        // register the "Open View" command
        commands.registerCommand(OpenTreeviewExampleView, {
            execute: () => super.openView({ activate: false, reveal: true })
        });

        // register the "Add child item" command
        commands.registerCommand(TreeviewExampleTreeAddItem, {
            execute: () => {
                // get the TreeViewExampleWidget
                const widget = this.tryGetWidget();
                if (widget) {
                    // get the selected item
                    const parent = widget.model.selectedNodes[0];
                    if (parent) {
                        // call the addItem logic
                        widget.model.addItem(parent);
                    }
                }
            },
            isVisible: () => {
                // access the TreeViewExampleWidget
                const widget = this.tryGetWidget();
                // only show the command if an ExampleTreeNode is selected
                return !!(widget && widget.model.selectedNodes.length > 0 && ExampleTreeNode.is(widget.model.selectedNodes[0]));
            }
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);

        // add the "Add Child" menu item to the context menu
        menus.registerMenuAction([...TREEVIEW_EXAMPLE_CONTEXT_MENU, '_1'],
            {
                commandId: TreeviewExampleTreeAddItem.id,
                label: 'Add Child'
            });
    }
}
