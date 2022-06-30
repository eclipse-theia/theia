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

/**
 * A menu entry representing an action, e.g. "New File".
 */
export interface MenuAction {
    /**
     * The command to execute.
     */
    commandId: string;
    /**
     * In addition to the mandatory command property, an alternative command can be defined.
     * It will be shown and invoked when pressing Alt while opening a menu.
     */
    alt?: string;
    /**
     * A specific label for this action. If not specified the command label or command id will be used.
     */
    label?: string;
    /**
     * Icon class(es). If not specified the icon class associated with the specified command
     * (i.e. `command.iconClass`) will be used if it exists.
     */
    icon?: string;
    /**
     * Menu entries are sorted in ascending order based on their `order` strings. If omitted the determined
     * label will be used instead.
     */
    order?: string;
    /**
     * Optional expression which will be evaluated by the {@link ContextKeyService} to determine visibility
     * of the action, e.g. `resourceLangId == markdown`.
     */
    when?: string;
}

export namespace MenuAction {
    /* Determine whether object is a MenuAction */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function is(arg: MenuAction | any): arg is MenuAction {
        return !!arg && arg === Object(arg) && 'commandId' in arg;
    }
}

/**
 * Additional options when creating a new submenu.
 */
export interface SubMenuOptions {
    /**
     * The class to use for the submenu icon.
     */
    iconClass?: string;
    /**
     * Menu entries are sorted in ascending order based on their `order` strings. If omitted the determined
     * label will be used instead.
     */
    order?: string;
    /**
     * The conditions under which to include the specified submenu under the specified parent.
     */
    when?: string;
}

export type MenuPath = string[];

export const MAIN_MENU_BAR: MenuPath = ['menubar'];

export const SETTINGS_MENU: MenuPath = ['settings_menu'];
export const ACCOUNTS_MENU: MenuPath = ['accounts_menu'];
export const ACCOUNTS_SUBMENU = [...ACCOUNTS_MENU, '1_accounts_submenu'];

/**
 * Base interface of the nodes used in the menu tree structure.
 */
export interface MenuNode {
    /**
     * the optional label for this specific node.
     */
    readonly label?: string
    /**
     * technical identifier.
     */
    readonly id: string
    /**
     * Menu nodes are sorted in ascending order based on their `sortString`.
     */
    readonly sortString: string
    /**
     * Additional conditions determining the visibility of a menu node
     */
    readonly when?: string;

    readonly children?: ReadonlyArray<MenuNode>;

    readonly isSubmenu?: boolean;

    readonly icon?: string;
}
