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

import * as React from 'react';
import { ArrayUtils, Event, MenuPath } from '../../../common';
import { Widget } from '../../widgets';

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

export const menuDelegateSeparator = '@=@';
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

export interface MenuDelegateToolbarItem extends TabBarToolbarItem {
    menuPath: MenuPath;
}

export namespace MenuDelegateToolbarItem {
    export function getMenuPath(item: TabBarToolbarItem): MenuPath | undefined {
        const asDelegate = item as MenuDelegateToolbarItem;
        return Array.isArray(asDelegate.menuPath) ? asDelegate.menuPath : undefined;
    }
}

export interface SubmenuToolbarItem extends TabBarToolbarItem {
    prefix: string;
}

export namespace SubmenuToolbarItem {
    export function is(candidate: TabBarToolbarItem): candidate is SubmenuToolbarItem {
        return typeof (candidate as SubmenuToolbarItem).prefix === 'string';
    }
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

/** Items whose group is exactly 'navigation' will be rendered inline. */
export const NAVIGATION = 'navigation';

export namespace TabBarToolbarItem {

    /**
     * Compares the items by `priority` in ascending. Undefined priorities will be treated as `0`.
     */
    export const PRIORITY_COMPARATOR = (left: TabBarToolbarItem, right: TabBarToolbarItem) => {
        const leftGroup = left.group ?? NAVIGATION;
        const rightGroup = right.group ?? NAVIGATION;
        if (leftGroup === NAVIGATION && rightGroup !== NAVIGATION) { return ArrayUtils.Sort.LeftBeforeRight; }
        if (rightGroup === NAVIGATION && leftGroup !== NAVIGATION) { return ArrayUtils.Sort.RightBeforeLeft; }
        if (leftGroup !== rightGroup) { return leftGroup.localeCompare(rightGroup); }
        return (left.priority || 0) - (right.priority || 0);
    };

    export function is(arg: Object | undefined): arg is TabBarToolbarItem {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return !!arg && 'command' in arg && typeof (arg as any).command === 'string';
    }

}

export interface MenuDelegate {
    menuPath: MenuPath;
    isEnabled: (widget: Widget) => boolean;
}

export const TAB_BAR_TOOLBAR_CONTEXT_MENU = ['TAB_BAR_TOOLBAR_CONTEXT_MENU'];
export const submenuItemPrefix = `navigation${menuDelegateSeparator}`;
