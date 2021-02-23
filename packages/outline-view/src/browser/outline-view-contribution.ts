/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { Command, CommandRegistry } from '@theia/core/lib/common/command';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { Widget } from '@theia/core/lib/browser/widgets';
import { OutlineViewWidget } from './outline-view-widget';
import { CompositeTreeNode } from '@theia/core/lib/browser/tree';
import { OS } from '@theia/core/lib/common/os';

export const OUTLINE_WIDGET_FACTORY_ID = 'outline-view';

/**
 * Collection of `outline-view` commands.
 */
export namespace OutlineViewCommands {
    /**
     * Command which collapses all nodes
     * from the `outline-view` tree.
     */
    export const COLLAPSE_ALL: Command = {
        id: 'outlineView.collapse.all',
        iconClass: 'collapse-all'
    };
}

@injectable()
export class OutlineViewContribution extends AbstractViewContribution<OutlineViewWidget> implements FrontendApplicationContribution, TabBarToolbarContribution {

    constructor() {
        super({
            widgetId: OUTLINE_WIDGET_FACTORY_ID,
            widgetName: 'Outline',
            defaultWidgetOptions: {
                area: 'right',
                rank: 500
            },
            toggleCommandId: 'outlineView:toggle',
            toggleKeybinding: OS.type() !== OS.Type.Linux
                ? 'ctrlcmd+shift+i'
                : undefined
        });
    }

    async initializeLayout(app: FrontendApplication): Promise<void> {
        await this.openView();
    }

    registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(OutlineViewCommands.COLLAPSE_ALL, {
            isEnabled: widget => this.withWidget(widget, () => true),
            isVisible: widget => this.withWidget(widget, () => true),
            execute: () => this.collapseAllItems()
        });
    }

    registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
        toolbar.registerItem({
            id: OutlineViewCommands.COLLAPSE_ALL.id,
            command: OutlineViewCommands.COLLAPSE_ALL.id,
            tooltip: 'Collapse All',
            priority: 0
        });
    }

    /**
     * Collapse all nodes in the outline view tree.
     */
    protected async collapseAllItems(): Promise<void> {
        const { model } = await this.widget;
        const root = model.root;
        if (CompositeTreeNode.is(root)) {
            model.collapseAll(root);
        }
    }

    /**
     * Determine if the current widget is the `outline-view`.
     */
    protected withWidget<T>(widget: Widget | undefined = this.tryGetWidget(), cb: (widget: OutlineViewWidget) => T): T | false {
        if (widget instanceof OutlineViewWidget && widget.id === OUTLINE_WIDGET_FACTORY_ID) {
            return cb(widget);
        }
        return false;
    }
}
