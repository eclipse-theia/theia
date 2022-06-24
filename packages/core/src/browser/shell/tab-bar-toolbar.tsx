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

import debounce = require('lodash.debounce');
import * as React from 'react';
import { inject, injectable, named } from 'inversify';
import { Widget, ReactWidget, codicon, ACTION_ITEM } from '../widgets';
import { LabelParser, LabelIcon } from '../label-parser';
import { ContributionProvider } from '../../common/contribution-provider';
import { FrontendApplicationContribution } from '../frontend-application';
import { CommandRegistry } from '../../common/command';
import { Disposable, DisposableCollection } from '../../common/disposable';
import { ContextKeyService } from '../context-key-service';
import { Event, Emitter } from '../../common/event';
import { ContextMenuRenderer, Anchor } from '../context-menu-renderer';
import { MenuModelRegistry } from '../../common/menu';
import { nls } from '../../common/nls';

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

export interface TabBarDelegator extends Widget {
    getTabBarDelegate(): Widget | undefined;
}

export namespace TabBarDelegator {
    export const is = (candidate?: Widget): candidate is TabBarDelegator => {
        if (candidate) {
            const asDelegator = candidate as TabBarDelegator;
            return typeof asDelegator.getTabBarDelegate === 'function';
        }
        return false;
    };
}

/**
 * Representation of an item in the tab
 */
export interface TabBarToolbarItem {

    /**
     * The unique ID of the toolbar item.
     */
    readonly id: string;

    /**
     * The command to execute.
     */
    readonly command: string;

    /**
     * Optional text of the item.
     *
     * Shamelessly copied and reused from `status-bar`:
     *
     * More details about the available `fontawesome` icons and CSS class names can be hound [here](http://fontawesome.io/icons/).
     * To set a text with icon use the following pattern in text string:
     * ```typescript
     * $(fontawesomeClassName)
     * ```
     *
     * To use animated icons use the following pattern:
     * ```typescript
     * $(fontawesomeClassName~typeOfAnimation)
     * ````
     * The type of animation can be either `spin` or `pulse`.
     * Look [here](http://fontawesome.io/examples/#animated) for more information to animated icons.
     */
    readonly text?: string;

    /**
     * Priority among the items. Can be negative. The smaller the number the left-most the item will be placed in the toolbar. It is `0` by default.
     */
    readonly priority?: number;

    /**
     * Optional group for the item. Default `navigation`.
     * `navigation` group will be inlined, while all the others will be within the `...` dropdown.
     * A group in format `submenu_group_1/submenu 1/.../submenu_group_n/ submenu n/item_group` means that the item will be located in a submenu(s) of the `...` dropdown.
     * The submenu's title is named by the submenu section name, e.g. `group/<submenu name>/subgroup`.
     */
    readonly group?: string;

    /**
     * Optional tooltip for the item.
     */
    readonly tooltip?: string;

    /**
     * Optional icon for the item.
     */
    readonly icon?: string | (() => string);

    /**
     * https://code.visualstudio.com/docs/getstarted/keybindings#_when-clause-contexts
     */
    readonly when?: string;

    /**
     * When defined, the container tool-bar will be updated if this event is fired.
     *
     * Note: currently, each item of the container toolbar will be re-rendered if any of the items have changed.
     */
    readonly onDidChange?: Event<void>;

}

/**
 * Tab-bar toolbar item backed by a `React.ReactNode`.
 * Unlike the `TabBarToolbarItem`, this item is not connected to the command service.
 */
export interface ReactTabBarToolbarItem {
    readonly id: string;
    render(widget?: Widget): React.ReactNode;

    readonly onDidChange?: Event<void>;

    // For the rest, see `TabBarToolbarItem`.
    // For conditional visibility.
    isVisible?(widget: Widget): boolean;
    readonly when?: string;

    // Ordering and grouping.
    readonly priority?: number;
    /**
     * Optional group for the item. Default `navigation`. Always inlined.
     */
    readonly group?: string;
}

export namespace TabBarToolbarItem {

    /**
     * Compares the items by `priority` in ascending. Undefined priorities will be treated as `0`.
     */
    export const PRIORITY_COMPARATOR = (left: TabBarToolbarItem, right: TabBarToolbarItem) => {
        // The navigation group is special as it will always be sorted to the top/beginning of a menu.
        const compareGroup = (leftGroup: string | undefined = 'navigation', rightGroup: string | undefined = 'navigation') => {
            if (leftGroup === 'navigation') {
                return rightGroup === 'navigation' ? 0 : -1;
            }
            if (rightGroup === 'navigation') {
                return leftGroup === 'navigation' ? 0 : 1;
            }
            return leftGroup.localeCompare(rightGroup);
        };
        const result = compareGroup(left.group, right.group);
        if (result !== 0) {
            return result;
        }
        return (left.priority || 0) - (right.priority || 0);
    };

    export function is(arg: Object | undefined): arg is TabBarToolbarItem {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return !!arg && 'command' in arg && typeof (arg as any).command === 'string';
    }

}

/**
 * Main, shared registry for tab-bar toolbar items.
 */
@injectable()
export class TabBarToolbarRegistry implements FrontendApplicationContribution {

    protected items: Map<string, TabBarToolbarItem | ReactTabBarToolbarItem> = new Map();

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(ContributionProvider)
    @named(TabBarToolbarContribution)
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
        const result = [];
        for (const item of this.items.values()) {
            const visible = TabBarToolbarItem.is(item)
                ? this.commandRegistry.isVisible(item.command, widget)
                : (!item.isVisible || item.isVisible(widget));
            if (visible && (!item.when || this.contextKeyService.match(item.when, widget.node))) {
                result.push(item);
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

}

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

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(LabelParser)
    protected readonly labelParser: LabelParser;

    @inject(MenuModelRegistry)
    protected readonly menus: MenuModelRegistry;

    @inject(ContextMenuRenderer)
    protected readonly contextMenuRenderer: ContextMenuRenderer;

    @inject(TabBarToolbarRegistry)
    protected readonly toolbarRegistry: TabBarToolbarRegistry;

    constructor() {
        super();
        this.addClass(TabBarToolbar.Styles.TAB_BAR_TOOLBAR);
        this.hide();
    }

    updateItems(items: Array<TabBarToolbarItem | ReactTabBarToolbarItem>, current: Widget | undefined): void {
        this.inline.clear();
        this.more.clear();
        for (const item of items.sort(TabBarToolbarItem.PRIORITY_COMPARATOR).reverse()) {
            if ('render' in item || item.group === undefined || item.group === 'navigation') {
                this.inline.set(item.id, item);
            } else {
                this.more.set(item.id, item);
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
        const toolbarItemClassNames = this.getToolbarItemClassNames(command?.id);
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
            if (this.commandIsEnabled(commandId)) {
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

        this.renderMoreContextMenu(event.nativeEvent);
    };

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    renderMoreContextMenu(anchor: Anchor): any {
        const menuPath = ['TAB_BAR_TOOLBAR_CONTEXT_MENU'];
        const toDisposeOnHide = new DisposableCollection();
        this.addClass('menu-open');
        toDisposeOnHide.push(Disposable.create(() => this.removeClass('menu-open')));
        for (const item of this.more.values()) {
            // Register a submenu for the item, if the group is in format `<submenu group>/<submenu name>/.../<item group>`
            if (item.group?.includes('/')) {
                const split = item.group.split('/');
                const paths: string[] = [];
                for (let i = 0; i < split.length - 1; i += 2) {
                    paths.push(split[i], split[i + 1]);
                    // TODO order is missing, items sorting will be alphabetic
                    toDisposeOnHide.push(this.menus.registerSubmenu([...menuPath, ...paths], split[i + 1]));
                }
            }
            // TODO order is missing, items sorting will be alphabetic
            toDisposeOnHide.push(this.menus.registerMenuAction([...menuPath, ...item.group!.split('/')], {
                label: item.tooltip,
                commandId: item.command,
                when: item.when
            }));
        }
        return this.contextMenuRenderer.render({
            menuPath,
            args: [this.current],
            anchor,
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

        const item = this.inline.get(e.currentTarget.id);
        if (TabBarToolbarItem.is(item)) {
            this.commands.executeCommand(item.command, this.current);
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
