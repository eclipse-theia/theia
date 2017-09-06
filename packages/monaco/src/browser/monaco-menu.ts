/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { MenuContribution, MenuModelRegistry, MAIN_MENU_BAR } from "@theia/core/lib/common";
import { CommonCommands, CommonMenus } from "@theia/core/lib/browser";
import { EDITOR_CONTEXT_MENU_ID } from "@theia/editor/lib/browser";
import { MonacoCommands } from "./monaco-command";
import { MonacoCommandRegistry } from './monaco-command-registry';
import MenuRegistry = monaco.actions.MenuRegistry;
import MenuId = monaco.actions.MenuId;

export interface MonacoActionGroup {
    id: string;
    actions: string[];
}
export namespace MonacoMenus {
    export const SELECTION_MENU = '3_selection';

    export const SELECTION_GROUP: MonacoActionGroup = {
        id: '1_selection_group',
        actions: [
            MonacoCommands.SELECTION_SELECT_ALL,
            MonacoCommands.SELECTION_EXPAND_SELECTION,
            MonacoCommands.SELECTION_SHRINK_SELECTION
        ]
    };

    export const SELECTION_MOVE_GROUP: MonacoActionGroup = {
        id: '2_copy_move_group',
        actions: [
            MonacoCommands.SELECTION_COPY_LINE_UP,
            MonacoCommands.SELECTION_COPY_LINE_DOWN,
            MonacoCommands.SELECTION_MOVE_LINE_UP,
            MonacoCommands.SELECTION_MOVE_LINE_DOWN
        ]
    };

    export const SELECTION_CURSOR_GROUP: MonacoActionGroup = {
        id: '3_cursor_group',
        actions: [
            MonacoCommands.SELECTION_ADD_CURSOR_ABOVE,
            MonacoCommands.SELECTION_ADD_CURSOR_BELOW,
            MonacoCommands.SELECTION_ADD_CURSOR_TO_LINE_END,
            MonacoCommands.SELECTION_ADD_NEXT_OCCURRENCE,
            MonacoCommands.SELECTION_ADD_PREVIOUS_OCCURRENCE,
            MonacoCommands.SELECTION_SELECT_ALL_OCCURRENCES
        ]
    };

    export const SELECTION_GROUPS = [
        SELECTION_GROUP,
        SELECTION_MOVE_GROUP,
        SELECTION_CURSOR_GROUP
    ];
}

@injectable()
export class MonacoEditorMenuContribution implements MenuContribution {

    constructor(
        @inject(MonacoCommandRegistry) protected readonly commands: MonacoCommandRegistry
    ) { }

    registerMenus(registry: MenuModelRegistry) {
        // FIXME: it should belong to the editor extension menu contribution
        registry.registerMenuAction([EDITOR_CONTEXT_MENU_ID, CommonMenus.EDIT_MENU_UNDO_GROUP], {
            commandId: CommonCommands.UNDO.id
        });
        // FIXME: it should belong to the editor extension menu contribution
        registry.registerMenuAction([EDITOR_CONTEXT_MENU_ID, CommonMenus.EDIT_MENU_UNDO_GROUP], {
            commandId: CommonCommands.REDO.id
        });

        for (const item of MenuRegistry.getMenuItems(MenuId.EditorContext)) {
            const commandId = this.commands.validate(item.command.id);
            if (commandId) {
                const menuPath = [EDITOR_CONTEXT_MENU_ID, (item.group || "")];
                registry.registerMenuAction(menuPath, { commandId });
            }
        }

        registry.registerSubmenu([MAIN_MENU_BAR], MonacoMenus.SELECTION_MENU, "Selection");
        for (const group of MonacoMenus.SELECTION_GROUPS) {
            group.actions.forEach((action, index) => {
                const commandId = this.commands.validate(action);
                if (commandId) {
                    const path = [MAIN_MENU_BAR, MonacoMenus.SELECTION_MENU, group.id];
                    const order = index.toString();
                    registry.registerMenuAction(path, { commandId, order });
                }
            });
        }
    }
}
