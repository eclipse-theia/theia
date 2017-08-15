/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry } from './menu';
import { CommandContribution, CommandRegistry } from './command';
import { injectable } from "inversify";

const enjson = require('./i18n/en.json');
const esjson = require('./i18n/es.json');
const frjson = require('./i18n/fr.json');
const Globalize = require("globalize");

// Load potential languages
Globalize.loadMessages(enjson);
Globalize.loadMessages(esjson);
Globalize.loadMessages(frjson);

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
        registry.registerSubmenu([MAIN_MENU_BAR], CommonCommands.EDIT_MENU, Globalize.formatMessage("core/common/Edit"));
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
            label: Globalize.formatMessage("core/common/Cut")
        })
        commandRegistry.registerCommand({
            id: CommonCommands.EDIT_COPY,
            label: Globalize.formatMessage("core/common/Copy")
        })
        commandRegistry.registerCommand({
            id: CommonCommands.EDIT_PASTE,
            label: Globalize.formatMessage("core/common/Paste")
        })
        commandRegistry.registerCommand({
            id: CommonCommands.EDIT_UNDO,
            label: Globalize.formatMessage("core/common/Undo")
        })
        commandRegistry.registerCommand({
            id: CommonCommands.EDIT_REDO,
            label: Globalize.formatMessage("core/common/Redo")
        });
    }

}