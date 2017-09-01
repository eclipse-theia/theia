/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { MenuContribution, MenuModelRegistry, MAIN_MENU_BAR } from "@theia/core/lib/common";
import { CommonCommands } from "@theia/core/lib/browser";
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
                commandId: MonacoSelectionCommands.SELECTION_SELECT_ALL,
                order: '0'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_SELECTION_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_EXPAND_SELECTION,
                order: '2'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_SELECTION_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_SHRINK_SELECTION,
                order: '3'
            });

        // Copy and move group
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_COPY_MOVE_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_COPY_LINE_UP,
                order: '0'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_COPY_MOVE_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_COPY_LINE_DOWN,
                order: '1'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_COPY_MOVE_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_MOVE_LINE_UP,
                order: '2'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_COPY_MOVE_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_MOVE_LINE_DOWN,
                order: '3'
            });

        // Cursor group
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_CURSOR_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_ADD_CURSOR_ABOVE,
                order: '0'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_CURSOR_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_ADD_CURSOR_BELOW,
                order: '1'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_CURSOR_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_ADD_CURSOR_TO_LINE_END,
                order: '2'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_CURSOR_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_ADD_NEXT_OCCURRENCE,
                order: '3'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_CURSOR_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_ADD_PREVIOUS_OCCURRENCE,
                order: '4'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            MonacoSelectionCommands.SELECTION_MENU,
            MonacoSelectionCommands.SELECTION_MENU_CURSOR_GROUP], {
                commandId: MonacoSelectionCommands.SELECTION_SELECT_ALL_OCCURRENCES,
                order: '5'
            });
    }
}
