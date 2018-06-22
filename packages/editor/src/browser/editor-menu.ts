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

import { injectable } from "inversify";
import { MenuContribution, MenuModelRegistry, MenuPath, MAIN_MENU_BAR } from "@theia/core";
import { CommonCommands } from "@theia/core/lib/browser";
import { EditorCommands } from './editor-command';

export const EDITOR_CONTEXT_MENU: MenuPath = ['editor_context_menu'];

export namespace EditorContextMenu {
    export const UNDO_REDO = [...EDITOR_CONTEXT_MENU, '1_undo'];
    export const NAVIGATION = [...EDITOR_CONTEXT_MENU, 'navigation'];
}

export namespace EditorMainMenu {

    /**
     * The main `Go` menu item.
     */
    export const GO = [...MAIN_MENU_BAR, '4_go'];

    /**
     * Navigation menu group in the `Go` menu.
     */
    export const NAVIGATION_GROUP = [...GO, '1_navigation_group'];

}

@injectable()
export class EditorMenuContribution implements MenuContribution {

    registerMenus(registry: MenuModelRegistry) {
        registry.registerMenuAction(EditorContextMenu.UNDO_REDO, {
            commandId: CommonCommands.UNDO.id
        });
        registry.registerMenuAction(EditorContextMenu.UNDO_REDO, {
            commandId: CommonCommands.REDO.id
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
    }

}
