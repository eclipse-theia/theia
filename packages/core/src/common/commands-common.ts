/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry } from './menu';
import { CommandContribution, CommandRegistry } from './command';
import { injectable } from "inversify";

export namespace CommonCommands {
    export const EDIT_MENU = "2_edit"
    export const EDIT_MENU_UNDO_GROUP = "1_undo/redo"
    export const EDIT_MENU_COPYPASTE_GROUP = "2_copy"

    export const EDIT_CUT = 'edit_cut';
    export const EDIT_COPY = 'edit_copy';
    export const EDIT_PASTE = 'edit_paste';

    export const EDIT_UNDO = 'edit_undo';
    export const EDIT_REDO = 'edit_redo';
}

@injectable()
export class CommonMenuContribution implements MenuContribution {

    registerMenus(registry: MenuModelRegistry): void {
        // Explicitly register the Edit Submenu
        registry.registerSubmenu([MAIN_MENU_BAR], CommonCommands.EDIT_MENU, "Edit");
        registry.registerMenuAction([MAIN_MENU_BAR, CommonCommands.EDIT_MENU, CommonCommands.EDIT_MENU_UNDO_GROUP], {
            commandId: CommonCommands.EDIT_UNDO
        });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            CommonCommands.EDIT_MENU,
            CommonCommands.EDIT_MENU_UNDO_GROUP], {
                commandId: CommonCommands.EDIT_REDO
            });
    }

}

@injectable()
export class CommonCommandContribution implements CommandContribution {

    registerCommands(commandRegistry: CommandRegistry): void {
        commandRegistry.registerCommand({
            id: CommonCommands.EDIT_CUT,
            label: 'Cut'
        })
        commandRegistry.registerCommand({
            id: CommonCommands.EDIT_COPY,
            label: 'Copy',
        })
        commandRegistry.registerCommand({
            id: CommonCommands.EDIT_PASTE,
            label: 'Paste'
        })
        commandRegistry.registerCommand({
            id: CommonCommands.EDIT_UNDO,
            label: 'Undo'
        })
        commandRegistry.registerCommand({
            id: CommonCommands.EDIT_REDO,
            label: 'Redo'
        })
    }

}