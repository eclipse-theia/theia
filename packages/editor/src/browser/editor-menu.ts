/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { MenuContribution, MenuModelRegistry, MenuPath, MAIN_MENU_BAR } from '@theia/core';
import { CommonCommands, CommonMenus } from '@theia/core/lib/browser';
import { EditorCommands } from './editor-command';

export const EDITOR_CONTEXT_MENU: MenuPath = ['editor_context_menu'];

/**
 * Editor context menu default groups should be aligned
 * with VS Code default groups: https://code.visualstudio.com/api/references/contribution-points#contributes.menus
 */
export namespace EditorContextMenu {
    export const NAVIGATION = [...EDITOR_CONTEXT_MENU, 'navigation'];
    export const MODIFICATION = [...EDITOR_CONTEXT_MENU, '1_modification'];
    export const CUT_COPY_PASTE = [...EDITOR_CONTEXT_MENU, '9_cutcopypaste'];
    export const COMMANDS = [...EDITOR_CONTEXT_MENU, 'z_commands'];
    export const UNDO_REDO = [...EDITOR_CONTEXT_MENU, '1_undo'];
}

export namespace EditorMainMenu {

    /**
     * The main `Go` menu item.
     */
    export const GO = [...MAIN_MENU_BAR, '5_go'];

    /**
     * Navigation menu group in the `Go` menu.
     */
    export const NAVIGATION_GROUP = [...GO, '1_navigation_group'];

}

@injectable()
export class EditorMenuContribution implements MenuContribution {

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(EditorContextMenu.UNDO_REDO, {
            commandId: CommonCommands.UNDO.id
        });
        registry.registerMenuAction(EditorContextMenu.UNDO_REDO, {
            commandId: CommonCommands.REDO.id
        });

        registry.registerMenuAction(EditorContextMenu.CUT_COPY_PASTE, {
            commandId: CommonCommands.CUT.id,
            order: '0'
        });
        registry.registerMenuAction(EditorContextMenu.CUT_COPY_PASTE, {
            commandId: CommonCommands.COPY.id,
            order: '1'
        });
        registry.registerMenuAction(EditorContextMenu.CUT_COPY_PASTE, {
            commandId: CommonCommands.PASTE.id,
            order: '2'
        });

        // Editor navigation. Go > Back and Go > Forward.
        registry.registerSubmenu(EditorMainMenu.GO, 'Go');
        registry.registerMenuAction(EditorMainMenu.NAVIGATION_GROUP, {
            commandId: EditorCommands.GO_BACK.id,
            label: 'Back'
        });
        registry.registerMenuAction(EditorMainMenu.NAVIGATION_GROUP, {
            commandId: EditorCommands.GO_FORWARD.id,
            label: 'Forward'
        });
        registry.registerMenuAction(EditorMainMenu.NAVIGATION_GROUP, {
            commandId: EditorCommands.GO_LAST_EDIT.id,
            label: 'Last Edit Location'
        });

        // Toggle Commands.
        registry.registerMenuAction(CommonMenus.VIEW_TOGGLE, {
            commandId: EditorCommands.TOGGLE_WORD_WRAP.id,
            label: EditorCommands.TOGGLE_WORD_WRAP.label,
            order: '0'
        });
        registry.registerMenuAction(CommonMenus.VIEW_TOGGLE, {
            commandId: EditorCommands.TOGGLE_MINIMAP.id,
            label: 'Show Minimap',
            order: '1',
        });
        registry.registerMenuAction(CommonMenus.VIEW_TOGGLE, {
            commandId: EditorCommands.TOGGLE_RENDER_WHITESPACE.id,
            label: 'Render Whitespace',
            order: '2'
        });
    }

}
