// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { Widget } from '@lumino/widgets';
import * as React from 'react';
import { CommandRegistry, Event } from '../../../common';
import { NAVIGATION, RenderedToolbarAction } from './tab-bar-toolbar-types';
import { TabBarToolbar, toAnchor } from './tab-bar-toolbar';
import { ACTION_ITEM, codicon } from '../../widgets';
import { ContextMenuRenderer } from '../../context-menu-renderer';
import { TabBarToolbarItem } from './tab-toolbar-item';
import { ContextKeyService, ContextMatcher } from '../../context-key-service';
import { CommandMenu, CompoundMenuNode, ContextExpressionMatcher, Group, MenuModelRegistry, MenuNode, RenderedMenuNode } from '../../../common/menu';

export const TOOLBAR_WRAPPER_ID_SUFFIX = '-as-tabbar-toolbar-item';

abstract class AbstractToolbarMenuWrapper {

    constructor(
        readonly parentChain: CompoundMenuNode[],
        protected readonly commandRegistry: CommandRegistry,
        protected readonly menuRegistry: MenuModelRegistry,
        protected readonly contextKeyService: ContextKeyService,
        protected readonly contextMenuRenderer: ContextMenuRenderer) {
    }

    protected abstract menuNode?: MenuNode;
    protected abstract id: string;
    protected abstract icon: string | undefined;
    protected abstract tooltip: string | undefined;
    protected abstract text: string | undefined;
    protected abstract executeCommand(e: React.MouseEvent<HTMLDivElement, MouseEvent>): void;

    isEnabled(): boolean {
        if (CommandMenu.is(this.menuNode)) {
            return this.menuNode.isEnabled(this.parentChain);
        }
        return true;
    }
    isToggled(): boolean {
        if (CommandMenu.is(this.menuNode) && this.menuNode.isToggled) {
            return !!this.menuNode.isToggled(this.parentChain);
        }
        return false;
    }
    render(widget: Widget): React.ReactNode {
        return this.renderMenuItem(widget);
    }

    abstract toMenuNode(): MenuNode | undefined;
    /**
     * Presents the menu to popup on the `event` that is the clicking of
     * a menu toolbar item.
     *
     * @param event the mouse event triggering the menu
     */
    showPopupMenu(widget: Widget | undefined, event: React.MouseEvent, contextMatcher: ContextMatcher): void {
        event.stopPropagation();
        event.preventDefault();
        const anchor = toAnchor(event);

        this.contextMenuRenderer.render({
            menu: this.menuNode as CompoundMenuNode,
            args: [widget],
            anchor,
            context: widget?.node || event.target as HTMLElement,
            contextKeyService: contextMatcher,
        });
    }

    /**
     * Renders a toolbar item that is a menu, presenting it as a button with a little
     * chevron decoration that pops up a floating menu when clicked.
     *
     * @param item a toolbar item that is a menu item
     * @returns the rendered toolbar item
     */
    protected renderMenuItem(widget: Widget): React.ReactNode {
        const icon = this.icon || 'ellipsis';
        const contextMatcher: ContextMatcher = this.contextKeyService;
        if (CompoundMenuNode.is(this.menuNode) && !this.menuNode.isEmpty(this.parentChain, this.contextKeyService, widget.node)) {

            return <div key={this.id} className={TabBarToolbar.Styles.TAB_BAR_TOOLBAR_ITEM + ' enabled menu'}>
                <div className={codicon(icon, true)}
                    title={this.text}
                    onClick={e => this.executeCommand(e)}
                />
                <div className={ACTION_ITEM} onClick={event => this.showPopupMenu(widget, event, contextMatcher)} >
                    <div className={codicon('chevron-down') + ' chevron'} />
                </div>
            </div>;
        } else {
            return <div key={this.id} className={TabBarToolbar.Styles.TAB_BAR_TOOLBAR_ITEM + ' enabled menu'}>
                <div className={codicon(icon, true)}
                    title={this.text}
                    onClick={e => this.executeCommand(e)}
                />
            </div>;
        }
    }
}

export class ToolbarMenuNodeWrapper extends AbstractToolbarMenuWrapper implements TabBarToolbarItem {
    constructor(
        parentChain: CompoundMenuNode[],
        commandRegistry: CommandRegistry,
        menuRegistry: MenuModelRegistry,
        contextKeyService: ContextKeyService,
        contextMenuRenderer: ContextMenuRenderer,
        protected readonly menuNode: MenuNode & RenderedMenuNode,
        readonly group: string | undefined) {
        super(parentChain, commandRegistry, menuRegistry, contextKeyService, contextMenuRenderer);
    }

    executeCommand(e: React.MouseEvent<HTMLDivElement, MouseEvent>): void {
        if (CommandMenu.is(this.menuNode)) {
            this.menuNode.run(this.parentChain);
        }
    }

    isVisible(widget: Widget): boolean {
        const menuNodeVisible = this.menuNode.isVisible(this.parentChain, this.contextKeyService, widget.node);
        if (CommandMenu.is(this.menuNode)) {
            return menuNodeVisible;
        } else if (CompoundMenuNode.is(this.menuNode)) {
            return menuNodeVisible && !MenuModelRegistry.isEmpty(this.menuNode);
        } else {
            return menuNodeVisible;
        }
    }

    get id(): string { return this.menuNode.id + TOOLBAR_WRAPPER_ID_SUFFIX; }
    get icon(): string | undefined { return this.menuNode.icon; }
    get tooltip(): string | undefined { return this.menuNode.label; }
    get text(): string | undefined {
        return (this.group === NAVIGATION || this.group === undefined) ? undefined : this.menuNode.label;
    }
    get onDidChange(): Event<void> | undefined {
        return this.menuNode.onDidChange;
    }

    override toMenuNode(): MenuNode | undefined {
        if (CompoundMenuNode.is(this.menuNode)) {
            return new ToolbarItemAsSubmenuWrapper(this.menuNode, [...this.parentChain]);
        } else if (CommandMenu.is(this.menuNode)) {
            return new ToolbarItemAsCommandMenuWrapper(this.menuNode, this.parentChain);
        } else {
            throw new Error('should not happen');
        }
    }
}

export class ToolbarSubmenuWrapper extends AbstractToolbarMenuWrapper implements TabBarToolbarItem {
    constructor(
        parentChain: CompoundMenuNode[],
        commandRegistry: CommandRegistry,
        menuRegistry: MenuModelRegistry,
        contextKeyService: ContextKeyService,
        contextMenuRenderer: ContextMenuRenderer,
        protected readonly toolbarItem: RenderedToolbarAction
    ) {
        super(parentChain, commandRegistry, menuRegistry, contextKeyService, contextMenuRenderer);
    }

    override isEnabled(widget?: Widget): boolean {
        return this.toolbarItem.command ? this.commandRegistry.isEnabled(this.toolbarItem.command, widget) : !!this.toolbarItem.menuPath;
    }

    protected executeCommand(e: React.MouseEvent<HTMLElement>, widget?: Widget): void {
        e.preventDefault();
        e.stopPropagation();

        if (!this.isEnabled(widget)) {
            return;
        }

        if (this.toolbarItem.command) {
            this.commandRegistry.executeCommand(this.toolbarItem.command, widget);
        }
    };

    isVisible(widget: Widget): boolean {
        const menuNode = this.menuNode;
        if (this.toolbarItem.isVisible && !this.toolbarItem.isVisible(widget)) {
            return false;
        }
        if (!menuNode?.isVisible(this.parentChain, this.contextKeyService, widget.node, widget)) {
            return false;
        }
        if (this.toolbarItem.command) {
            return true;
        }
        if (CompoundMenuNode.is(menuNode)) {
            return !menuNode.isEmpty(this.parentChain, this.contextKeyService, widget.node, widget);
        }
        return true;
    }
    group?: string | undefined;
    priority?: number | undefined;

    get id(): string { return this.toolbarItem.id; }
    get icon(): string | undefined {
        if (typeof this.toolbarItem.icon === 'function') {
            return this.toolbarItem.icon();
        }
        if (this.toolbarItem.icon) {
            return this.toolbarItem.icon;
        }
        if (this.toolbarItem.command) {
            const command = this.commandRegistry.getCommand(this.toolbarItem.command);
            return command?.iconClass;
        }
        return undefined;
    }
    get tooltip(): string | undefined { return this.toolbarItem.tooltip; }
    get text(): string | undefined { return (this.toolbarItem.group === NAVIGATION || this.toolbarItem.group === undefined) ? undefined : this.toolbarItem.text; }
    get onDidChange(): Event<void> | undefined {
        return this.menuNode?.onDidChange;
    }

    get menuNode(): MenuNode | undefined {
        return this.toolbarItem.menuPath ? this.menuRegistry.getMenu(this.toolbarItem.menuPath) : undefined;
    }

    override toMenuNode(): MenuNode | undefined {
        return this.menuNode;
    }
}

/**
 * This class wraps a menu node, but replaces the effective menu path. Command parameters need to be mapped
 * for commands contributed by extension and this mapping is keyed by the menu path
 */
abstract class AbstractMenuNodeAsToolbarItemWrapper<T extends MenuNode> {
    constructor(protected readonly menuNode: T, readonly parentChain: CompoundMenuNode[]) { }

    get label(): string | undefined {
        if (RenderedMenuNode.is(this.menuNode)) {
            return this.menuNode.label;
        }
    };
    /**
     * Icon classes for the menu node. If present, these will produce an icon to the left of the label in browser-style menus.
     */
    get icon(): string | undefined {
        if (RenderedMenuNode.is(this.menuNode)) {
            return this.menuNode.label;
        }
    }
    get id(): string {
        return this.menuNode.id;
    }
    get sortString(): string {
        return this.menuNode.sortString;
    }

    isVisible<K>(parentChain: CompoundMenuNode[], contextMatcher: ContextExpressionMatcher<K>, context: K | undefined, ...args: unknown[]): boolean {
        return this.menuNode!.isVisible(this.parentChain, contextMatcher, context, args);
    }
}

/**
 * Wrapper form submenu nodes
 */
class ToolbarItemAsSubmenuWrapper extends AbstractMenuNodeAsToolbarItemWrapper<CompoundMenuNode> implements Group {

    get contextKeyOverlays(): Record<string, string> | undefined {
        return this.menuNode.contextKeyOverlays;
    }
    isEmpty<T>(parentChain: CompoundMenuNode[], contextMatcher: ContextExpressionMatcher<T>, context: T | undefined, ...args: unknown[]): boolean {
        return this.menuNode.isEmpty(this.parentChain, contextMatcher, context, args);
    }
    get children(): MenuNode[] {
        return this.menuNode.children.map(child => {
            if (CompoundMenuNode.is(child)) {
                return new ToolbarItemAsSubmenuWrapper(child, [...this.parentChain, this.menuNode]);
            } else if (CommandMenu.is(child)) {
                return new ToolbarItemAsCommandMenuWrapper(child, this.parentChain);
            } else {
                throw new Error('should not happen');
            }
        }).filter(node => node !== undefined).filter(node => node as MenuNode);
    }

}
/**
 * Wrapper for command menus
 */
class ToolbarItemAsCommandMenuWrapper extends AbstractMenuNodeAsToolbarItemWrapper<CommandMenu> implements CommandMenu {

    isEnabled(parentChain: CompoundMenuNode[], ...args: unknown[]): boolean {
        return this.menuNode.isEnabled(this.parentChain, ...args);
    }
    isToggled(parentChain: CompoundMenuNode[], ...args: unknown[]): boolean {
        return this.menuNode.isToggled(this.parentChain, ...args);
    }
    run(parentChain: CompoundMenuNode[], ...args: unknown[]): Promise<void> {
        return this.menuNode.run(this.parentChain, args);
    }

    override get label(): string {
        return super.label!;
    }

}
