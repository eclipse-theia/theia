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
import { CommandRegistry, ContributionProvider, Disposable, DisposableCollection, Emitter, Event, MenuModelRegistry, MenuNode, MenuPath } from '../../../common';
import { ContextKeyService } from '../../context-key-service';
import { FrontendApplicationContribution } from '../../frontend-application';
import { Widget } from '../../widgets';
import { MenuDelegate, menuDelegateSeparator, MenuDelegateToolbarItem, ReactTabBarToolbarItem, SubmenuToolbarItem, TabBarToolbarItem } from './tab-bar-toolbar-types';

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
            if (delegate.isEnabled(widget)) {
                const menu = this.menuRegistry.getMenu(delegate.menuPath);
                const menuToTabbarItems = (item: MenuNode, group = '') => {
                    if (Array.isArray(item.children) && (!item.when || this.contextKeyService.match(item.when, widget.node))) {
                        const nextGroup = item === menu
                            ? group
                            : this.formatGroupForSubmenus(group, item.id, item.label);
                        if (group === 'navigation') {
                            const asSubmenuItem: SubmenuToolbarItem = {
                                id: `submenu_as_toolbar_item_${item.id}`,
                                command: '_never_',
                                prefix: item.id,
                                when: item.when,
                                icon: item.icon,
                                group,
                            };
                            if (!asSubmenuItem.when || this.contextKeyService.match(asSubmenuItem.when, widget.node)) {
                                result.push(asSubmenuItem);
                            }
                        }
                        item.children.forEach(child => menuToTabbarItems(child, nextGroup));
                    } else if (!Array.isArray(item.children)) {
                        const asToolbarItem: MenuDelegateToolbarItem = {
                            id: `menu_as_toolbar_item_${item.id}`,
                            command: item.id,
                            when: item.when,
                            icon: item.icon,
                            tooltip: item.label ?? item.id,
                            menuPath: delegate.menuPath,
                            group,
                        };
                        if (!asToolbarItem.when || this.contextKeyService.match(asToolbarItem.when, widget.node)) {
                            result.push(asToolbarItem);
                        }
                    }
                };
                menuToTabbarItems(menu);
            }
        }
        return result;
    }

    protected formatGroupForSubmenus(lastGroup: string, currentId?: string, currentLabel?: string): string {
        const split = lastGroup.length ? lastGroup.split(menuDelegateSeparator) : [];
        // If the submenu is in the 'navigation' group, then it's an item that opens its own context menu, so it should be navigation/id/label...
        const expectedParity = split[0] === 'navigation' ? 1 : 0;
        if (split.length % 2 !== expectedParity && (currentId || currentLabel)) {
            split.push('');
        }
        if (currentId || currentLabel) {
            split.push(currentId || (currentLabel + '_id'));
        }
        if (currentLabel) {
            split.push(currentLabel);
        }
        return split.join(menuDelegateSeparator);
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
            const isEnabled: MenuDelegate['isEnabled'] = !when
                ? yes
                : typeof when === 'function'
                    ? when
                    : widget => this.contextKeyService.match(when, widget.node);
            this.menuDelegates.set(id, { menuPath, isEnabled });
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
