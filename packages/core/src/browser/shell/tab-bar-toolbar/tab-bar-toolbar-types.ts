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
import { ArrayUtils, Event, isFunction, isObject, MenuPath } from '../../../common';
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

export type TabBarToolbarItem = RenderedToolbarItem | ReactTabBarToolbarItem;

/**
 * Representation of an item in the tab
 */
export interface TabBarToolbarItemBase {
    /**
     * The unique ID of the toolbar item.
     */
    id: string;
    /**
     * The command to execute when the item is selected.
     */
    command?: string;

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

    /**
     * Priority among the items. Can be negative. The smaller the number the left-most the item will be placed in the toolbar. It is `0` by default.
     */
    priority?: number;
    group?: string;
    /**
     * A menu path with which this item is associated.
     * If accompanied by a command, this data will be passed to the {@link MenuCommandExecutor}.
     * If no command is present, this menu will be opened.
     */
    menuPath?: MenuPath;
    /**
     * The path of the menu delegate that contributed this toolbar item
     */
    delegateMenuPath?: MenuPath;
    contextKeyOverlays?: Record<string, string>;
    /**
     * Optional ordering string for placing the item within its group
     */
    order?: string;
}

export interface RenderedToolbarItem extends TabBarToolbarItemBase {
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

/**
 * Tab-bar toolbar item backed by a `React.ReactNode`.
 * Unlike the `TabBarToolbarItem`, this item is not connected to the command service.
 */
export interface ReactTabBarToolbarItem extends TabBarToolbarItemBase {
    render(widget?: Widget): React.ReactNode;
}

export namespace ReactTabBarToolbarItem {
    export function is(item: TabBarToolbarItem): item is ReactTabBarToolbarItem {
        return isObject<ReactTabBarToolbarItem>(item) && typeof item.render === 'function';
    }
}

export interface MenuDelegate {
    menuPath: MenuPath;
    isVisible(widget?: Widget): boolean;
}

export namespace TabBarToolbarItem {

    /**
     * Compares the items by `priority` in ascending. Undefined priorities will be treated as `0`.
     */
    export const PRIORITY_COMPARATOR = (left: TabBarToolbarItem, right: TabBarToolbarItem) => {
        const leftGroup: string = left.group ?? NAVIGATION;
        const rightGroup: string = right.group ?? NAVIGATION;
        if (leftGroup === NAVIGATION && rightGroup !== NAVIGATION) {
            return ArrayUtils.Sort.LeftBeforeRight;
        }
        if (rightGroup === NAVIGATION && leftGroup !== NAVIGATION) {
            return ArrayUtils.Sort.RightBeforeLeft;
        }
        if (leftGroup !== rightGroup) {
            return leftGroup.localeCompare(rightGroup);
        }
        return (left.priority || 0) - (right.priority || 0);
    };
}
