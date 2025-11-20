// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { MAIN_MENU_BAR, MANAGE_MENU } from '../common/menu';

export namespace CommonMenus {

    export const FILE = [...MAIN_MENU_BAR, '1_file'];
    export const FILE_NEW_TEXT = [...FILE, '1_new_text'];
    export const FILE_NEW = [...FILE, '1_new'];
    export const FILE_OPEN = [...FILE, '2_open'];
    export const FILE_SAVE = [...FILE, '3_save'];
    export const FILE_AUTOSAVE = [...FILE, '4_autosave'];
    export const FILE_SETTINGS = [...FILE, '5_settings'];
    export const FILE_SETTINGS_SUBMENU = [...FILE_SETTINGS, '1_settings_submenu'];
    export const FILE_SETTINGS_SUBMENU_OPEN = [...FILE_SETTINGS_SUBMENU, '1_settings_submenu_open'];
    export const FILE_SETTINGS_SUBMENU_THEME = [...FILE_SETTINGS_SUBMENU, '2_settings_submenu_theme'];
    export const FILE_CLOSE = [...FILE, '6_close'];

    export const FILE_NEW_CONTRIBUTIONS = ['file', 'newFile'];

    export const EDIT = [...MAIN_MENU_BAR, '2_edit'];
    export const EDIT_UNDO = [...EDIT, '1_undo'];
    export const EDIT_CLIPBOARD = [...EDIT, '2_clipboard'];
    export const EDIT_FIND = [...EDIT, '3_find'];

    export const VIEW = [...MAIN_MENU_BAR, '4_view'];
    export const VIEW_PRIMARY = [...VIEW, '0_primary'];
    export const VIEW_APPEARANCE = [...VIEW, '1_appearance'];
    export const VIEW_APPEARANCE_SUBMENU = [...VIEW_APPEARANCE, '1_appearance_submenu'];
    export const VIEW_APPEARANCE_SUBMENU_SCREEN = [...VIEW_APPEARANCE_SUBMENU, '2_appearance_submenu_screen'];
    export const VIEW_APPEARANCE_SUBMENU_BAR = [...VIEW_APPEARANCE_SUBMENU, '3_appearance_submenu_bar'];
    export const VIEW_EDITOR_SUBMENU = [...VIEW_APPEARANCE, '2_editor_submenu'];
    export const VIEW_EDITOR_SUBMENU_SPLIT = [...VIEW_EDITOR_SUBMENU, '1_editor_submenu_split'];
    export const VIEW_EDITOR_SUBMENU_ORTHO = [...VIEW_EDITOR_SUBMENU, '2_editor_submenu_ortho'];
    export const VIEW_VIEWS = [...VIEW, '2_views'];
    export const VIEW_LAYOUT = [...VIEW, '3_layout'];
    export const VIEW_TOGGLE = [...VIEW, '4_toggle'];

    export const MANAGE_GENERAL = [...MANAGE_MENU, '1_manage_general'];
    export const MANAGE_SETTINGS = [...MANAGE_MENU, '2_manage_settings'];
    export const MANAGE_SETTINGS_THEMES = [...MANAGE_SETTINGS, '1_manage_settings_themes'];

    // last menu item
    export const HELP = [...MAIN_MENU_BAR, '9_help'];

}
