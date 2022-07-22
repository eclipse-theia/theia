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
export interface MenuAction extends MenuNodeRenderingData, Pick<MenuNodeMetadata, 'when'> {
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
     * Menu entries are sorted in ascending order based on their `order` strings. If omitted the determined
     * label will be used instead.
     */
    order?: string;
}

export namespace MenuAction {
    /* Determine whether object is a MenuAction */
    export function is(arg: unknown): arg is MenuAction {
        return !!arg && typeof arg === 'object' && 'commandId' in arg;
    }
}

/**
 * Additional options when creating a new submenu.
 */
export interface SubMenuOptions extends Pick<MenuAction, 'order'>, Pick<MenuNodeMetadata, 'when'>, Partial<Pick<CompoundMenuNodeMetadata, 'role'>> {
    /**
     * The class to use for the submenu icon.
     */
    iconClass?: string;
}

export type MenuPath = string[];

export const MAIN_MENU_BAR: MenuPath = ['menubar'];

export const SETTINGS_MENU: MenuPath = ['settings_menu'];
export const ACCOUNTS_MENU: MenuPath = ['accounts_menu'];
export const ACCOUNTS_SUBMENU = [...ACCOUNTS_MENU, '1_accounts_submenu'];

export interface MenuNodeMetadata {
    /**
     * technical identifier.
     */
    readonly id: string;
    /**
     * Menu nodes are sorted in ascending order based on their `sortString`.
     */
    readonly sortString: string;
    /**
     * Condition under which the menu node should be rendered.
     * See https://code.visualstudio.com/docs/getstarted/keybindings#_when-clause-contexts
     */
    readonly when?: string;
    /**
     * A reference to the parent node - useful for determining the menu path by which the node can be accessed.
     */
    readonly parent?: MenuNode;
}

export interface MenuNodeRenderingData {
    /**
     * Optional label. Will be rendered as text of the menu item.
     */
    readonly label?: string;
    /**
     * Icon classes for the menu node. If present, these will produce an icon to the left of the label in browser-style menus.
     */
    readonly icon?: string;
}

export const enum CompoundMenuNodeRole {
    /** Indicates that the node should be rendered as submenu that opens a new menu on hover */
    Submenu,
    /** Indicates that the node's children should be rendered as group separated from other items by a separator */
    Group,
    /** Indicates that the node's children should be treated as though they were direct children of the node's parent */
    Flat,
}

export interface CompoundMenuNode {
    /**
     * Items that are grouped under this menu.
     */
    readonly children: ReadonlyArray<MenuNode>
}

export namespace CompoundMenuNode {
    export function is(node: MenuNode): node is MenuNode & CompoundMenuNode { return Array.isArray(node.children); }
    export function getRole(node: MenuNode): CompoundMenuNodeRole | undefined {
        if (!is(node)) { return undefined; }
        return node.role ?? (node.label ? CompoundMenuNodeRole.Submenu : CompoundMenuNodeRole.Group);
    }
    export function sortChildren(m1: MenuNode, m2: MenuNode): number {
        // The navigation group is special as it will always be sorted to the top/beginning of a menu.
        if (isNavigationGroup(m1)) {
            return -1;
        }
        if (isNavigationGroup(m2)) {
            return 1;
        }
        return m1.sortString.localeCompare(m2.sortString);
    }

    /** Collapses the children of any subemenus with role {@link CompoundMenuNodeRole Flat} and sorts */
    export function getFlatChildren(children: ReadonlyArray<MenuNode>): MenuNode[] {
        const childrenToMerge: ReadonlyArray<MenuNode>[] = [];
        return children.filter(child => {
            if (getRole(child) === CompoundMenuNodeRole.Flat) {
                childrenToMerge.push((child as CompoundMenuNode).children);
                return false;
            }
            return true;
        }).concat(...childrenToMerge).sort(sortChildren);
    }

    /**
     * Indicates whether the given node is the special `navigation` menu.
     *
     * @param node the menu node to check.
     * @returns `true` when the given node is a {@link CompoundMenuNode} with id `navigation`,
     * `false` otherwise.
     */
    export function isNavigationGroup(node: MenuNode): node is MenuNode & CompoundMenuNode {
        return is(node) && node.id === 'navigation';
    }
}

export interface CompoundMenuNodeMetadata {
    /**
     * @deprecated @since 1.28 use `role` instead.
     * Whether the item should be rendered as a submenu.
     */
    readonly isSubmenu: boolean;
    /**
     * How the node and its children should be rendered. See {@link CompoundMenuNodeRole}.
     */
    readonly role: CompoundMenuNodeRole;
}

export interface CommandMenuNode {
    command: string;
}

export namespace CommandMenuNode {
    export function is(candidate: MenuNode): candidate is MenuNode & CommandMenuNode { return Boolean(candidate.command); }
}

export interface AlternativeHandlerMenuNode {
    altNode: MenuNodeMetadata & MenuNodeRenderingData & CommandMenuNode;
}

/**
 * Base interface of the nodes used in the menu tree structure.
 */
export interface MenuNode extends MenuNodeMetadata,
    MenuNodeRenderingData,
    Partial<CompoundMenuNode>,
    Partial<CommandMenuNode>,
    Partial<CompoundMenuNodeMetadata>,
    Partial<AlternativeHandlerMenuNode> { }
