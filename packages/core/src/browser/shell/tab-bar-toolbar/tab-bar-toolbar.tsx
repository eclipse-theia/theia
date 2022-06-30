// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable } from 'inversify';
import * as React from 'react';
import { CommandRegistry, Disposable, DisposableCollection, MenuCommandExecutor, MenuModelRegistry, nls } from '../../../common';
import { Anchor, ContextMenuAccess, ContextMenuRenderer } from '../../context-menu-renderer';
import { LabelIcon, LabelParser } from '../../label-parser';
import { ACTION_ITEM, codicon, ReactWidget, Widget } from '../../widgets';
import { TabBarToolbarRegistry } from './tab-bar-toolbar-registry';
// eslint-disable-next-line max-len
import { AnyToolbarItem, menuDelegateSeparator, ReactTabBarToolbarItem, submenuItemPrefix, TabBarDelegator, TabBarToolbarItem, TAB_BAR_TOOLBAR_CONTEXT_MENU } from './tab-bar-toolbar-types';

/**
 * Factory for instantiating tab-bar toolbars.
 */
export const TabBarToolbarFactory = Symbol('TabBarToolbarFactory');
export interface TabBarToolbarFactory {
    (): TabBarToolbar;
}

/**
 * Tab-bar toolbar widget representing the active [tab-bar toolbar items](TabBarToolbarItem).
 */
@injectable()
export class TabBarToolbar extends ReactWidget {

    protected current: Widget | undefined;
    protected inline = new Map<string, TabBarToolbarItem | ReactTabBarToolbarItem>();
    protected more = new Map<string, TabBarToolbarItem>();
    protected submenuItems = new Map<string, Map<string, TabBarToolbarItem>>();

    @inject(CommandRegistry) protected readonly commands: CommandRegistry;
    @inject(LabelParser) protected readonly labelParser: LabelParser;
    @inject(MenuModelRegistry) protected readonly menus: MenuModelRegistry;
    @inject(MenuCommandExecutor) protected readonly menuCommandExecutor: MenuCommandExecutor;
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;
    @inject(TabBarToolbarRegistry) protected readonly toolbarRegistry: TabBarToolbarRegistry;

    constructor() {
        super();
        this.addClass(TabBarToolbar.Styles.TAB_BAR_TOOLBAR);
        this.hide();
    }

    updateItems(items: Array<TabBarToolbarItem | ReactTabBarToolbarItem>, current: Widget | undefined): void {
        this.inline.clear();
        this.more.clear();
        this.submenuItems.clear();
        for (const item of items.sort(TabBarToolbarItem.PRIORITY_COMPARATOR).reverse()) {
            if ('render' in item || item.group === undefined || item.group === 'navigation') {
                this.inline.set(item.id, item);
            } else {
                if (item.group?.startsWith(submenuItemPrefix)) {
                    this.addSubmenuItem(item);
                } else {
                    this.more.set(item.id, item);
                }
            }
        }
        this.setCurrent(current);
        if (!items.length) {
            this.hide();
        }
        this.onRender.push(Disposable.create(() => {
            if (items.length) {
                this.show();
            }
        }));
        this.update();
    }

    protected addSubmenuItem(item: TabBarToolbarItem): void {
        if (item.group) {
            let doSet = false;
            const secondElementEndIndex = item.group.indexOf(menuDelegateSeparator, submenuItemPrefix.length);
            const prefix = secondElementEndIndex === -1
                ? item.group.substring(submenuItemPrefix.length)
                : item.group.substring(submenuItemPrefix.length, secondElementEndIndex);
            const prefixItems = this.submenuItems.get(prefix) ?? (doSet = true, new Map());
            prefixItems.set(item.id, item);
            if (doSet) {
                this.submenuItems.set(prefix, prefixItems);
            }
        }
    }

    updateTarget(current?: Widget): void {
        const operativeWidget = TabBarDelegator.is(current) ? current.getTabBarDelegate() : current;
        const items = operativeWidget ? this.toolbarRegistry.visibleItems(operativeWidget) : [];
        this.updateItems(items, operativeWidget);
    }

    protected readonly toDisposeOnSetCurrent = new DisposableCollection();
    protected setCurrent(current: Widget | undefined): void {
        this.toDisposeOnSetCurrent.dispose();
        this.toDispose.push(this.toDisposeOnSetCurrent);
        this.current = current;
        if (current) {
            const resetCurrent = () => {
                this.setCurrent(undefined);
                this.update();
            };
            current.disposed.connect(resetCurrent);
            this.toDisposeOnSetCurrent.push(Disposable.create(() =>
                current.disposed.disconnect(resetCurrent)
            ));
        }
    }

    protected render(): React.ReactNode {
        return <React.Fragment>
            {this.renderMore()}
            {[...this.inline.values()].map(item => TabBarToolbarItem.is(item) ? this.renderItem(item) : item.render(this.current))}
        </React.Fragment>;
    }

    protected renderItem(item: TabBarToolbarItem): React.ReactNode {
        let innerText = '';
        const classNames = [];
        if (item.text) {
            for (const labelPart of this.labelParser.parse(item.text)) {
                if (typeof labelPart !== 'string' && LabelIcon.is(labelPart)) {
                    const className = `fa fa-${labelPart.name}${labelPart.animation ? ' fa-' + labelPart.animation : ''}`;
                    classNames.push(...className.split(' '));
                } else {
                    innerText = labelPart;
                }
            }
        }
        const command = this.commands.getCommand(item.command);
        let iconClass = (typeof item.icon === 'function' && item.icon()) || item.icon as string || (command && command.iconClass);
        if (iconClass) {
            iconClass += ` ${ACTION_ITEM}`;
            classNames.push(iconClass);
        }
        const tooltip = item.tooltip || (command && command.label);
        const toolbarItemClassNames = this.getToolbarItemClassNames(command?.id ?? item.command);
        return <div key={item.id}
            className={toolbarItemClassNames}
            onMouseDown={this.onMouseDownEvent}
            onMouseUp={this.onMouseUpEvent}
            onMouseOut={this.onMouseUpEvent} >
            <div id={item.id} className={classNames.join(' ')}
                onClick={this.executeCommand}
                title={tooltip}>{innerText}
            </div>
        </div>;
    }

    protected getToolbarItemClassNames(commandId: string | undefined): string {
        const classNames = [TabBarToolbar.Styles.TAB_BAR_TOOLBAR_ITEM];
        if (commandId) {
            if (commandId === '_never_' || this.commandIsEnabled(commandId)) {
                classNames.push('enabled');
            }
            if (this.commandIsToggled(commandId)) {
                classNames.push('toggled');
            }
        }
        return classNames.join(' ');
    }

    protected renderMore(): React.ReactNode {
        return !!this.more.size && <div key='__more__' className={TabBarToolbar.Styles.TAB_BAR_TOOLBAR_ITEM + ' enabled'}>
            <div id='__more__' className={codicon('ellipsis', true)} onClick={this.showMoreContextMenu}
                title={nls.localizeByDefault('More Actions...')} />
        </div>;
    }

    protected showMoreContextMenu = (event: React.MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();
        const anchor = this.toAnchor(event);
        this.renderMoreContextMenu(anchor);
    };

    protected toAnchor(event: React.MouseEvent): Anchor {
        const itemBox = event.currentTarget.closest('.' + TabBarToolbar.Styles.TAB_BAR_TOOLBAR_ITEM)?.getBoundingClientRect();
        return itemBox ? { y: itemBox.bottom, x: itemBox.left } : event.nativeEvent;
    }

    renderMoreContextMenu(anchor: Anchor, prefix?: string): ContextMenuAccess {
        const toDisposeOnHide = new DisposableCollection();
        this.addClass('menu-open');
        toDisposeOnHide.push(Disposable.create(() => this.removeClass('menu-open')));
        const items = (prefix ? this.submenuItems.get(prefix) ?? new Map() : this.more);
        for (const item of items.values()) {
            const separator = item.group && [menuDelegateSeparator, '/'].find(candidate => item.group?.includes(candidate));
            if (prefix && !item.group?.startsWith(`navigation${separator}${prefix}`) || !prefix && item.group?.startsWith(`navigation${separator}`)) {
                continue;
            }
            // Register a submenu for the item, if the group is in format `<submenu group>/<submenu name>/.../<item group>`
            if (separator) {
                const split = item.group.split(separator);
                const paths: string[] = [];
                for (let i = 0; i < split.length - 1; i += 2) {
                    paths.push(split[i], split[i + 1]);
                    // TODO order is missing, items sorting will be alphabetic
                    if (split[i + 1]) {
                        console.log('SENTINEL FOR REGISTERING A SUBMENU...', { group: item.group, paths, split, label: split[i + 1] });
                        toDisposeOnHide.push(this.menus.registerSubmenu([...TAB_BAR_TOOLBAR_CONTEXT_MENU, ...paths], split[i + 1]));
                    }
                }
            }
            // TODO order is missing, items sorting will be alphabetic
            toDisposeOnHide.push(this.menus.registerMenuAction([...TAB_BAR_TOOLBAR_CONTEXT_MENU, ...item.group!.split(separator)], {
                label: item.tooltip,
                commandId: item.command,
                when: item.when
            }));
        }
        return this.contextMenuRenderer.render({
            menuPath: TAB_BAR_TOOLBAR_CONTEXT_MENU,
            args: [this.current],
            anchor,
            context: this.current?.node,
            onHide: () => toDisposeOnHide.dispose()
        });
    }

    shouldHandleMouseEvent(event: MouseEvent): boolean {
        return event.target instanceof Element && this.node.contains(event.target);
    }

    protected commandIsEnabled(command: string): boolean {
        return this.commands.isEnabled(command, this.current);
    }

    protected commandIsToggled(command: string): boolean {
        return this.commands.isToggled(command, this.current);
    }

    protected executeCommand = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();

        const item: AnyToolbarItem | undefined = this.inline.get(e.currentTarget.id);
        if (item?.command && item.menuPath) {
            this.menuCommandExecutor.executeCommand(item.menuPath, item.command, this.current);
        } else if (item?.command) {
            this.commands.executeCommand(item.command, this.current);
        } else if (item?.menuPath) {
            // TODO @CJG - this isn't the final plan!
            this.renderMoreContextMenu(this.toAnchor(e), item.menuPath.join(''))
        }
        this.update();
    };

    protected onMouseDownEvent = (e: React.MouseEvent<HTMLElement>) => {
        if (e.button === 0) {
            e.currentTarget.classList.add('active');
        }
    };

    protected onMouseUpEvent = (e: React.MouseEvent<HTMLElement>) => {
        e.currentTarget.classList.remove('active');
    };

}

export namespace TabBarToolbar {

    export namespace Styles {

        export const TAB_BAR_TOOLBAR = 'p-TabBar-toolbar';
        export const TAB_BAR_TOOLBAR_ITEM = 'item';

    }

}
