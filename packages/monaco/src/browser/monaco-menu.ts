/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
<<<<<<< HEAD
import { MenuContribution, MenuModelRegistry } from "@theia/core/lib/common";
import { CommonCommands } from '@theia/core/lib/browser';
=======
import { MenuContribution, MenuModelRegistry, CommonCommands, MAIN_MENU_BAR } from "@theia/core/lib/common";
>>>>>>> 9748b0e... GH-210: Registered `selection` commands, handlers and menu items.
import { EDITOR_CONTEXT_MENU_ID } from "@theia/editor/lib/browser";
import { MonacoSelectionCommands } from "./monaco-command";
import MenuRegistry = monaco.actions.MenuRegistry;
import MenuId = monaco.actions.MenuId;
import IMenuItem = monaco.actions.IMenuItem;

@injectable()
export class MonacoEditorMenuContribution implements MenuContribution {
    registerMenus(registry: MenuModelRegistry) {

        registry.registerMenuAction([EDITOR_CONTEXT_MENU_ID, "1_undo/redo"], {
            commandId: CommonCommands.EDIT_UNDO
        });
        registry.registerMenuAction([EDITOR_CONTEXT_MENU_ID, "1_undo/redo"], {
            commandId: CommonCommands.EDIT_REDO
        });

        const wrap: (item: IMenuItem) => { path: string[], commandId: string } = item =>
            ({ path: [EDITOR_CONTEXT_MENU_ID, (item.group || "")], commandId: item.command.id });

        MenuRegistry.getMenuItems(MenuId.EditorContext)
            .map(item => wrap(item))
            .forEach(props => registry.registerMenuAction(props.path, { commandId: props.commandId }));


        // Explicitly register `Selection` menu.
        registry.registerSubmenu([MAIN_MENU_BAR], MonacoSelectionCommands.SELECTION_MENU, "Selection");

        // Selection group
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_SELECTION_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_SELECT_ALL
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_SELECTION_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_EXPAND_SELECTION
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_SELECTION_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_SHRINK_SELECTION
            });

        // Copy and move group
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_COPY_MOVE_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_COPY_LINE_UP
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_COPY_MOVE_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_COPY_LINE_DOWN
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_COPY_MOVE_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_MOVE_LINE_UP
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_COPY_MOVE_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_MOVE_LINE_DOWN
            });

        // Cursor group
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_CURSOR_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_SWITCH_TO_MULTI_CURSOR
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_CURSOR_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_ADD_CURSOR_ABOVE
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_CURSOR_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_ADD_CURSOR_BELOW
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_CURSOR_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_ADD_CURSOR_TO_LINE_END
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_CURSOR_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_ADD_NEXT_OCCURRENCE
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_CURSOR_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_ADD_PREVIOUS_OCCURRENCE
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_CURSOR_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_SELECT_ALL_OCCURRENCES
            });
    }
}
