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
import { CommandMenu, CompoundMenuNode, ContextExpressionMatcher, Group, MenuModelRegistry, MenuNode, MenuPath, RenderedMenuNode, Submenu } from '../../../common/menu';

export const TOOLBAR_WRAPPER_ID_SUFFIX = '-as-tabbar-toolbar-item';

abstract class AbstractToolbarMenuWrapper {

    constructor(
        readonly effectiveMenuPath: MenuPath,
        protected readonly commandRegistry: CommandRegistry,
        protected readonly menuRegistry: MenuModelRegistry,
        protected readonly contextKeyService: ContextKeyService,
        protected readonly contextMenuRenderer: ContextMenuRenderer) {
    }

    protected abstract menuNode: MenuNode | undefined;
    protected abstract id: string;
    protected abstract icon: string | undefined;
    protected abstract tooltip: string | undefined;
    protected abstract text: string | undefined;
    protected abstract executeCommand(widget: Widget, e: React.MouseEvent<HTMLDivElement, MouseEvent>): void;

    isEnabled(widget: Widget): boolean {
        if (CommandMenu.is(this.menuNode)) {
            return this.menuNode.isEnabled(this.effectiveMenuPath, widget);
        }
        return true;
    }
    isToggled(widget: Widget): boolean {
        if (CommandMenu.is(this.menuNode) && this.menuNode.isToggled) {
            return !!this.menuNode.isToggled(this.effectiveMenuPath, widget);
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
     * @param menuPath the path of the registered menu to show
     * @param event the mouse event triggering the menu
     */
    showPopupMenu(widget: Widget | undefined, menuPath: MenuPath, event: React.MouseEvent, contextMatcher: ContextMatcher): void {
        event.stopPropagation();
        event.preventDefault();
        const anchor = toAnchor(event);

        this.contextMenuRenderer.render({
            menuPath: this.effectiveMenuPath,
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
        const className = `${icon} ${ACTION_ITEM}`;
        if (CompoundMenuNode.is(this.menuNode) && !this.menuNode.isEmpty(this.effectiveMenuPath, this.contextKeyService, widget.node)) {
            return <div key={this.id} className={TabBarToolbar.Styles.TAB_BAR_TOOLBAR_ITEM + ' enabled menu'}>
                <div className={className}
                    title={this.tooltip || this.text}
                    onClick={e => this.executeCommand(widget, e)}
                />
                <div className={ACTION_ITEM} onClick={event => this.showPopupMenu(widget, this.effectiveMenuPath!, event, contextMatcher)} >
                    <div className={codicon('chevron-down') + ' chevron'} />
                </div>
            </div>;
        } else {
            return <div key={this.id} className={TabBarToolbar.Styles.TAB_BAR_TOOLBAR_ITEM + ' enabled menu'}>
                <div className={className}
                    title={this.tooltip || this.text}
                    onClick={e => this.executeCommand(widget, e)}
                />
            </div>;
        }
    }
}

export class SubmenuAsToolbarItemWrapper extends AbstractToolbarMenuWrapper implements TabBarToolbarItem {
    constructor(
        effectiveMenuPath: MenuPath,
        commandRegistry: CommandRegistry,
        menuRegistry: MenuModelRegistry,
        contextKeyService: ContextKeyService,
        contextMenuRenderer: ContextMenuRenderer,
        protected readonly menuNode: Submenu,
        readonly group: string | undefined) {
        super(effectiveMenuPath, commandRegistry, menuRegistry, contextKeyService, contextMenuRenderer);
    }
    priority?: number | undefined;

    executeCommand(widget: Widget, e: React.MouseEvent<HTMLDivElement, MouseEvent>): void {
    }

    isVisible(widget: Widget): boolean {
        const menuNodeVisible = this.menuNode.isVisible(this.effectiveMenuPath, this.contextKeyService, widget.node, widget);
        return menuNodeVisible && !MenuModelRegistry.isEmpty(this.menuNode);
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

    override toMenuNode(): Group | undefined {
        return new ToolbarItemAsSubmenuWrapper(this.menuNode!, this.effectiveMenuPath);
    };
}

export class CommandMenuAsToolbarItemWrapper extends AbstractToolbarMenuWrapper implements TabBarToolbarItem {
    constructor(
        effectiveMenuPath: MenuPath,
        commandRegistry: CommandRegistry,
        menuRegistry: MenuModelRegistry,
        contextKeyService: ContextKeyService,
        contextMenuRenderer: ContextMenuRenderer,
        protected readonly menuNode: CommandMenu,
        readonly group: string | undefined) {
        super(effectiveMenuPath, commandRegistry, menuRegistry, contextKeyService, contextMenuRenderer);
    }

    isVisible(widget: Widget): boolean {
        return this.menuNode.isVisible(this.effectiveMenuPath, this.contextKeyService, widget.node, widget);
    }

    executeCommand(widget: Widget, e: React.MouseEvent<HTMLDivElement, MouseEvent>): void {
        this.menuNode.run(this.effectiveMenuPath, widget);
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
        return new ToolbarItemAsCommandMenuWrapper(this.menuNode, this.effectiveMenuPath);
    }
}

export class ToolbarActionWrapper extends AbstractToolbarMenuWrapper implements TabBarToolbarItem {
    constructor(
        effectiveMenuPath: MenuPath,
        commandRegistry: CommandRegistry,
        menuRegistry: MenuModelRegistry,
        contextKeyService: ContextKeyService,
        contextMenuRenderer: ContextMenuRenderer,
        protected readonly toolbarItem: RenderedToolbarAction
    ) {
        super(effectiveMenuPath, commandRegistry, menuRegistry, contextKeyService, contextMenuRenderer);
    }

    override isEnabled(widget?: Widget): boolean {
        return this.toolbarItem.command ? this.commandRegistry.isEnabled(this.toolbarItem.command, widget) : !!this.toolbarItem.menuPath;
    }

    protected executeCommand(widget: Widget, e: React.MouseEvent<HTMLElement>): void {
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
        if (!menuNode?.isVisible(this.effectiveMenuPath, this.contextKeyService, widget.node, widget)) {
            return false;
        }
        if (this.toolbarItem.command) {
            return true;
        }
        if (CompoundMenuNode.is(menuNode)) {
            return !menuNode.isEmpty(this.effectiveMenuPath, this.contextKeyService, widget.node, widget);
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

    get menuPath(): MenuPath {
        return this.toolbarItem.menuPath!;
    }

    get menuNode(): CompoundMenuNode | undefined {
        return this.menuRegistry.getMenu(this.menuPath);
    }

    override toMenuNode(): MenuNode | undefined {
        return new ToolbarItemAsSubmenuWrapper(this.menuNode!, this.effectiveMenuPath);
    }
}

/**
 * This class wraps a menu node, but replaces the effective menu path. Command parameters need to be mapped
 * for commands contributed by extension and this mapping is keyed by the menu path
 */
abstract class AbstractMenuNodeAsToolbarItemWrapper<T extends MenuNode> {
    constructor(protected readonly menuNode: T, readonly effectiveMenuPath: MenuPath) { }

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

    isVisible<K>(effectiveMenuPath: MenuPath, contextMatcher: ContextExpressionMatcher<K>, context: K | undefined, ...args: unknown[]): boolean {
        return this.menuNode!.isVisible(this.effectiveMenuPath, contextMatcher, context, args);
    }
}

/**
 * Wrapper form submenu nodes
 */
class ToolbarItemAsSubmenuWrapper extends AbstractMenuNodeAsToolbarItemWrapper<CompoundMenuNode> implements Group {

    get contextKeyOverlays(): Record<string, string> | undefined {
        return this.menuNode.contextKeyOverlays;
    }
    isEmpty<T>(effectiveMenuPath: MenuPath, contextMatcher: ContextExpressionMatcher<T>, context: T | undefined, ...args: unknown[]): boolean {
        return this.menuNode.isEmpty(this.effectiveMenuPath, contextMatcher, context, args);
    }
    get children(): MenuNode[] {
        return this.menuNode.children;
    }

}
/**
 * Wrapper for command menus
 */
class ToolbarItemAsCommandMenuWrapper extends AbstractMenuNodeAsToolbarItemWrapper<CommandMenu> implements CommandMenu {

    isEnabled(effectiveMenuPath: MenuPath, ...args: unknown[]): boolean {
        return this.menuNode.isEnabled(this.effectiveMenuPath, ...args);
    }
    isToggled(effectiveMenuPath: MenuPath, ...args: unknown[]): boolean {
        return this.menuNode.isToggled(this.effectiveMenuPath, ...args);
    }
    run(effectiveMenuPath: MenuPath, ...args: unknown[]): Promise<void> {
        return this.menuNode.run(this.effectiveMenuPath, args);
    }

    override get label(): string {
        return super.label!;
    }

}
