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

import { Command, isObject, MenuPath, nls } from '@theia/core';
import { CommonCommands } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { UserStorageUri } from '@theia/userstorage/lib/browser';

export namespace ToolbarCommands {
    export const TOGGLE_TOOLBAR = Command.toLocalizedCommand({
        id: 'toolbar.view.toggle',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Toggle Toolbar',
    }, 'theia/toolbar/toggleToolbar', nls.getDefaultKey(CommonCommands.VIEW_CATEGORY));

    export const REMOVE_COMMAND_FROM_TOOLBAR = Command.toLocalizedCommand({
        id: 'toolbar.remove.command',
        category: 'Toolbar',
        label: 'Remove Command From Toolbar',
    }, 'theia/toolbar/removeCommand');

    export const INSERT_GROUP_LEFT = Command.toLocalizedCommand({
        id: 'toolbar.insert.group.left',
        category: 'Toolbar',
        label: 'Insert Group Separator (Left)',
    }, 'theia/toolbar/insertGroupLeft');

    export const INSERT_GROUP_RIGHT = Command.toLocalizedCommand({
        id: 'toolbar.insert.group.right',
        category: 'Toolbar',
        label: 'Insert Group Separator (Right)',
    }, 'theia/toolbar/insertGroupRight');

    export const ADD_COMMAND_TO_TOOLBAR = Command.toLocalizedCommand({
        id: 'toolbar.add.command',
        category: 'Toolbar',
        label: 'Add Command to Toolbar',
    }, 'theia/toolbar/addCommand');

    export const RESET_TOOLBAR = Command.toLocalizedCommand({
        id: 'toolbar.restore.defaults',
        category: 'Toolbar',
        label: 'Restore Toolbar Defaults',
    }, 'theia/toolbar/restoreDefaults');

    export const CUSTOMIZE_TOOLBAR = Command.toLocalizedCommand({
        id: 'toolbar.customize',
        category: 'Toolbar',
        label: 'Customize Toolbar (Open JSON)',
    }, 'theia/toolbar/openJSON');
}

export const UserToolbarURI = Symbol('UserToolbarURI');
export const USER_TOOLBAR_URI = new URI().withScheme(UserStorageUri.scheme).withPath('/user/toolbar.json');
export namespace ToolbarMenus {
    export const TOOLBAR_ITEM_CONTEXT_MENU: MenuPath = ['toolbar:toolbarItemContextMenu'];
    export const TOOLBAR_BACKGROUND_CONTEXT_MENU: MenuPath = ['toolbar:backgroundContextMenu'];
    export const SEARCH_WIDGET_DROPDOWN_MENU: MenuPath = ['searchToolbar:dropdown'];
}

export type ReactInteraction<T = Element, U = MouseEvent> = React.MouseEvent<T, U> | React.KeyboardEvent<T>;
export namespace ReactKeyboardEvent {
    export function is(obj: unknown): obj is React.KeyboardEvent {
        return isObject(obj) && 'key' in obj;
    }
}
