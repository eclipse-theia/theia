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

import * as React from 'react';
import { ArrayUtils, Event, isFunction, isObject, isString, MenuPath } from '../../../common';
import { Widget } from '../../widgets';

/** Items whose group is exactly 'navigation' will be rendered inline. */
export const NAVIGATION = 'navigation';
export const TAB_BAR_TOOLBAR_CONTEXT_MENU = ['TAB_BAR_TOOLBAR_CONTEXT_MENU'];

export interface TabBarDelegator extends Widget {
    getTabBarDelegate(): Widget | undefined;
}

export namespace TabBarDelegator {
    export function is(candidate?: Widget): candidate is TabBarDelegator {
        return isObject<TabBarDelegator>(candidate) && isFunction(candidate.getTabBarDelegate);
    }
}

interface RegisteredToolbarItem {
    /**
     * The unique ID of the toolbar item.
     */
    id: string;
}

interface RenderedToolbarItem {
    /**
     * Optional icon for the item.
     */
    icon?: string | (() => string);

    /**
     * Optional text of the item.
     *
     * Strings in the format `$(iconIdentifier~animationType) will be treated as icon references.
     * If the iconIdentifier begins with fa-, Font Awesome icons will be used; otherwise it will be treated as Codicon name.
     *
     * You can find Codicon classnames here: https://microsoft.github.io/vscode-codicons/dist/codicon.html
     * You can find Font Awesome classnames here: http://fontawesome.io/icons/
     * The type of animation can be either `spin` or `pulse`.
     */
    text?: string;

    /**
     * Optional tooltip for the item.
     */
    tooltip?: string;
}

interface SelfRenderingToolbarItem {
    render(widget?: Widget): React.ReactNode;
}

interface ExecutableToolbarItem {
    /**
     * The command to execute when the item is selected.
     */
    command: string;
}

export interface MenuToolbarItem {
    /**
     * A menu path with which this item is associated.
     * If accompanied by a command, this data will be passed to the {@link MenuCommandExecutor}.
     * If no command is present, this menu will be opened.
     */
    menuPath: MenuPath;
}

export interface ConditionalToolbarItem {
    /**
     * https://code.visualstudio.com/docs/getstarted/keybindings#_when-clause-contexts
     */
    when?: string;
    /**
     * Checked before the item is shown.
     */
    isVisible?(widget?: Widget): boolean;
    /**
     * When defined, the container tool-bar will be updated if this event is fired.
     *
     * Note: currently, each item of the container toolbar will be re-rendered if any of the items have changed.
     */
    onDidChange?: Event<void>;
}

interface InlineToolbarItemMetadata {
    /**
     * Priority among the items. Can be negative. The smaller the number the left-most the item will be placed in the toolbar. It is `0` by default.
     */
    priority?: number;
    group: 'navigation' | undefined;
}

interface MenuToolbarItemMetadata {
    /**
     * Optional group for the item. Default `navigation`.
     * `navigation` group will be inlined, while all the others will appear in the `...` dropdown.
     * A group in format `submenu_group_1/submenu 1/.../submenu_group_n/ submenu n/item_group` means that the item will be located in a submenu(s) of the `...` dropdown.
     * The submenu's title is named by the submenu section name, e.g. `group/<submenu name>/subgroup`.
     */
    group: string;
    /**
     * Optional ordering string for placing the item within its group
     */
    order?: string;
}

/**
 * Representation of an item in the tab
 */
export interface TabBarToolbarItem extends RegisteredToolbarItem,
    ExecutableToolbarItem,
    RenderedToolbarItem,
    Omit<ConditionalToolbarItem, 'isVisible'>,
    Pick<InlineToolbarItemMetadata, 'priority'>,
    Partial<MenuToolbarItem>,
    Partial<MenuToolbarItemMetadata> { }

/**
 * Tab-bar toolbar item backed by a `React.ReactNode`.
 * Unlike the `TabBarToolbarItem`, this item is not connected to the command service.
 */
export interface ReactTabBarToolbarItem extends RegisteredToolbarItem,
    SelfRenderingToolbarItem,
    ConditionalToolbarItem,
    Pick<InlineToolbarItemMetadata, 'priority'>,
    Pick<Partial<MenuToolbarItemMetadata>, 'group'> { }

export interface AnyToolbarItem extends RegisteredToolbarItem,
    Partial<ExecutableToolbarItem>,
    Partial<RenderedToolbarItem>,
    Partial<SelfRenderingToolbarItem>,
    Partial<ConditionalToolbarItem>,
    Partial<MenuToolbarItem>,
    Pick<InlineToolbarItemMetadata, 'priority'>,
    Partial<MenuToolbarItemMetadata> { }

export interface MenuDelegate extends MenuToolbarItem, Required<Pick<ConditionalToolbarItem, 'isVisible'>> { }

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

    export function is(arg: unknown): arg is TabBarToolbarItem {
        return isObject<TabBarToolbarItem>(arg) && isString(arg.command);
    }

}

export namespace MenuToolbarItem {
    /**
     * Type guard for a toolbar item that actually is a menu item, amongst
     * the other kinds of item that it may also be.
     *
     * @param item a toolbar item
     * @returns whether the `item` is a menu item
     */
    export function is<T extends AnyToolbarItem>(item: T): item is T & MenuToolbarItem {
        return Array.isArray(item.menuPath);
    }

    export function getMenuPath(item: AnyToolbarItem): MenuPath | undefined {
        return Array.isArray(item.menuPath) ? item.menuPath : undefined;
    }
}

export namespace AnyToolbarItem {
    /**
     * Type guard for a toolbar item that actually manifests any of the
     * features of a conditional toolbar item.
     *
     * @param item a toolbar item
     * @returns whether the `item` is a conditional item
     */
    export function isConditional<T extends AnyToolbarItem>(item: T): item is T & ConditionalToolbarItem {
        return 'isVisible' in item && typeof item.isVisible === 'function'
            || 'onDidChange' in item && typeof item.onDidChange === 'function'
            || 'when' in item && typeof item.when === 'string';
    }
}
