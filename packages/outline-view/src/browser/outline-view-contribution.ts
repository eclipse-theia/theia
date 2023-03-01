// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { Command, CommandRegistry } from '@theia/core/lib/common/command';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { codicon, Widget } from '@theia/core/lib/browser/widgets';
import { OutlineViewWidget } from './outline-view-widget';
import { CompositeTreeNode } from '@theia/core/lib/browser/tree';
import { OS } from '@theia/core/lib/common/os';
import { nls } from '@theia/core/lib/common/nls';

export const OUTLINE_WIDGET_FACTORY_ID = 'outline-view';

/**
 * Collection of `outline-view` commands.
 */
export namespace OutlineViewCommands {
    /**
     * Command which collapses all nodes from the `outline-view` tree.
     */
    export const COLLAPSE_ALL: Command = {
        id: 'outlineView.collapse.all',
        iconClass: codicon('collapse-all')
    };

    /**
     * Command which expands all nodes from the `outline-view` tree.
     */
    export const EXPAND_ALL: Command = {
        id: 'outlineView.expand.all',
        iconClass: codicon('expand-all')
    };
}

@injectable()
export class OutlineViewContribution extends AbstractViewContribution<OutlineViewWidget> implements FrontendApplicationContribution, TabBarToolbarContribution {

    constructor() {
        super({
            widgetId: OUTLINE_WIDGET_FACTORY_ID,
            widgetName: OutlineViewWidget.LABEL,
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

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(OutlineViewCommands.COLLAPSE_ALL, {
            isEnabled: w => this.withWidget(w, () => true),
            isVisible: w => this.withWidget(w, widget => !widget.model.areNodesCollapsed()),
            execute: () => this.collapseAllItems()
        });
        commands.registerCommand(OutlineViewCommands.EXPAND_ALL, {
            isEnabled: w => this.withWidget(w, () => true),
            isVisible: w => this.withWidget(w, widget => widget.model.areNodesCollapsed()),
            execute: () => this.expandAllItems()
        });
    }

    async registerToolbarItems(toolbar: TabBarToolbarRegistry): Promise<void> {
        const widget = await this.widget;
        const onDidChange = widget.onDidUpdate;
        toolbar.registerItem({
            id: OutlineViewCommands.COLLAPSE_ALL.id,
            command: OutlineViewCommands.COLLAPSE_ALL.id,
            tooltip: nls.localizeByDefault('Collapse All'),
            priority: 0,
            onDidChange
        });
        toolbar.registerItem({
            id: OutlineViewCommands.EXPAND_ALL.id,
            command: OutlineViewCommands.EXPAND_ALL.id,
            tooltip: nls.localizeByDefault('Expand All'),
            priority: 0,
            onDidChange
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

    protected async expandAllItems(): Promise<void> {
        const { model } = await this.widget;
        model.expandAll(model.root);
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
