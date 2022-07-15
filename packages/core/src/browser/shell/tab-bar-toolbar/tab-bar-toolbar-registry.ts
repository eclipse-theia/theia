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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import debounce = require('lodash.debounce');
import { inject, injectable, named } from 'inversify';
// eslint-disable-next-line max-len
import { CommandMenuNode, CommandRegistry, CompoundMenuNode, ContributionProvider, Disposable, DisposableCollection, Emitter, Event, MenuModelRegistry, MenuPath } from '../../../common';
import { ContextKeyService } from '../../context-key-service';
import { FrontendApplicationContribution } from '../../frontend-application';
import { Widget } from '../../widgets';
import { MenuDelegate, ReactTabBarToolbarItem, TabBarToolbarItem } from './tab-bar-toolbar-types';
import { ToolbarMenuNodeWrapper } from './tab-bar-toolbar-menu-adapters';

/**
 * Clients should implement this interface if they want to contribute to the tab-bar toolbar.
 */
export const TabBarToolbarContribution = Symbol('TabBarToolbarContribution');
/**
 * Representation of a tabbar toolbar contribution.
 */
export interface TabBarToolbarContribution {
    /**
     * Registers toolbar items.
     * @param registry the tabbar toolbar registry.
     */
    registerToolbarItems(registry: TabBarToolbarRegistry): void;
}

function yes(): true { return true; }
const menuDelegateSeparator = '=@=';

/**
 * Main, shared registry for tab-bar toolbar items.
 */
@injectable()
export class TabBarToolbarRegistry implements FrontendApplicationContribution {

    protected items = new Map<string, TabBarToolbarItem | ReactTabBarToolbarItem>();
    protected menuDelegates = new Map<string, MenuDelegate>();

    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;
    @inject(ContextKeyService) protected readonly contextKeyService: ContextKeyService;
    @inject(MenuModelRegistry) protected readonly menuRegistry: MenuModelRegistry;

    @inject(ContributionProvider) @named(TabBarToolbarContribution)
    protected readonly contributionProvider: ContributionProvider<TabBarToolbarContribution>;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    // debounce in order to avoid to fire more than once in the same tick
    protected fireOnDidChange = debounce(() => this.onDidChangeEmitter.fire(undefined), 0);

    onStart(): void {
        const contributions = this.contributionProvider.getContributions();
        for (const contribution of contributions) {
            contribution.registerToolbarItems(this);
        }
    }

    /**
     * Registers the given item. Throws an error, if the corresponding command cannot be found or an item has been already registered for the desired command.
     *
     * @param item the item to register.
     */
    registerItem(item: TabBarToolbarItem | ReactTabBarToolbarItem): Disposable {
        const { id } = item;
        if (this.items.has(id)) {
            throw new Error(`A toolbar item is already registered with the '${id}' ID.`);
        }
        this.items.set(id, item);
        this.fireOnDidChange();
        const toDispose = new DisposableCollection(
            Disposable.create(() => this.fireOnDidChange()),
            Disposable.create(() => this.items.delete(id))
        );
        if (item.onDidChange) {
            toDispose.push(item.onDidChange(() => this.fireOnDidChange()));
        }
        return toDispose;
    }

    /**
     * Returns an array of tab-bar toolbar items which are visible when the `widget` argument is the current one.
     *
     * By default returns with all items where the command is enabled and `item.isVisible` is `true`.
     */
    visibleItems(widget: Widget): Array<TabBarToolbarItem | ReactTabBarToolbarItem> {
        if (widget.isDisposed) {
            return [];
        }
        const result: Array<TabBarToolbarItem | ReactTabBarToolbarItem> = [];
        for (const item of this.items.values()) {
            const visible = TabBarToolbarItem.is(item)
                ? this.commandRegistry.isVisible(item.command, widget)
                : (!item.isVisible || item.isVisible(widget));
            if (visible && (!item.when || this.contextKeyService.match(item.when, widget.node))) {
                result.push(item);
            }
        }
        for (const delegate of this.menuDelegates.values()) {
            if (delegate.isVisible(widget)) {
                const menu = this.menuRegistry.getMenu(delegate.menuPath);
                const children = CompoundMenuNode.getFlatChildren(menu.children);
                for (const child of children) {
                    if (!child.when || this.contextKeyService.match(child.when, widget.node)) {
                        if (child.children) {
                            for (const grandchild of child.children) {
                                if (!grandchild.when || this.contextKeyService.match(grandchild.when, widget.node)) {
                                    if (CommandMenuNode.is(grandchild)) {
                                        result.push(new ToolbarMenuNodeWrapper(grandchild, child.id, delegate.menuPath));
                                    } else if (CompoundMenuNode.is(grandchild)) {
                                        let menuPath;
                                        if (menuPath = this.menuRegistry.getPath(grandchild)) {
                                            result.push(new ToolbarMenuNodeWrapper(grandchild, child.id, menuPath));
                                        }
                                    }
                                }
                            }
                        } else if (child.command) {
                            result.push(new ToolbarMenuNodeWrapper(child, '', delegate.menuPath));
                        }
                    }
                }
            }
        }
        return result;
    }

    unregisterItem(itemOrId: TabBarToolbarItem | ReactTabBarToolbarItem | string): void {
        const id = typeof itemOrId === 'string' ? itemOrId : itemOrId.id;
        if (this.items.delete(id)) {
            this.fireOnDidChange();
        }
    }

    registerMenuDelegate(menuPath: MenuPath, when?: string | ((widget: Widget) => boolean)): Disposable {
        const id = menuPath.join(menuDelegateSeparator);
        if (!this.menuDelegates.has(id)) {
            const isVisible: MenuDelegate['isVisible'] = !when
                ? yes
                : typeof when === 'function'
                    ? when
                    : widget => this.contextKeyService.match(when, widget?.node);
            this.menuDelegates.set(id, { menuPath, isVisible });
            this.fireOnDidChange();
            return { dispose: () => this.unregisterMenuDelegate(menuPath) };
        }
        console.warn('Unable to register menu delegate. Delegate has already been registered', menuPath);
        return Disposable.NULL;
    }

    unregisterMenuDelegate(menuPath: MenuPath): void {
        if (this.menuDelegates.delete(menuPath.join(menuDelegateSeparator))) {
            this.fireOnDidChange();
        }
    }
}
