/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { MenuPath } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { UserStorageUri } from '@theia/userstorage/lib/browser';

export namespace MainToolbarCommands {
    export const TOGGLE_MAIN_TOOLBAR = {
        id: 'main.toolbar.view.toggle',
        category: 'View',
        label: 'Toggle Main Toolbar',
    };
    export const REMOVE_COMMAND_FROM_TOOLBAR = {
        id: 'main.toolbar.remove.command',
        category: 'Edit',
        label: 'Remove Command From Toolbar',
    };
    export const INSERT_GROUP_LEFT = {
        id: 'main.toolbar.insert.group.left',
        category: 'Edit',
        label: 'Insert Group Separator (Left)',
    };
    export const INSERT_GROUP_RIGHT = {
        id: 'main.toolbar.insert.group.right',
        category: 'Edit',
        label: 'Insert Group Separator (Right)',
    };
    export const ADD_COMMAND_TO_TOOLBAR = {
        id: 'main.toolbar.add.command',
        category: 'Edit',
        label: 'Add Command to Toolbar',
    };
    export const RESET_TOOLBAR = {
        id: 'main.toolbar.restore.defaults',
        category: 'Toolbar',
        label: 'Restore Toolbar Defaults',
    };
    export const CUSTOMIZE_TOOLBAR = {
        id: 'main.toolbar.customize.toolbar',
        category: 'Toolbar',
        label: 'Customize Toolbar (Open JSON)',
    };
}

export const UserToolbarURI = Symbol('UserToolbarURI');
export const USER_TOOLBAR_URI = new URI().withScheme(UserStorageUri.scheme).withPath('/user/toolbar.json');
export namespace MainToolbarMenus {
    export const TOOLBAR_ITEM_CONTEXT_MENU: MenuPath = ['mainToolbar:toolbarItemContextMenu'];
    export const MAIN_TOOLBAR_BACKGROUND_CONTEXT_MENU: MenuPath = ['mainToolbar:backgroundContextMenu'];
    export const SEARCH_WIDGET_DROPDOWN_MENU: MenuPath = ['searchToolbar:dropdown'];
}

export type ReactInteraction<T = Element, U = MouseEvent> = React.MouseEvent<T, U> | React.KeyboardEvent<T>;
export namespace ReactKeyboardEvent {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function is(obj: any): obj is React.KeyboardEvent {
        return typeof obj === 'object' && 'key' in obj;
    }
}
