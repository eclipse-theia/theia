/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
            commandId: EditorCommands.BACK.id,
            label: 'Back'
        });
        registry.registerMenuAction(EditorMainMenu.NAVIGATION_GROUP, {
            commandId: EditorCommands.FORWARD.id,
            label: 'Forward'
        });
    }

}
