/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { CommonCommands } from "../../browser";
import { MenuContribution, MenuModelRegistry, MAIN_MENU_BAR } from "../../common";

export namespace ElectronMenus {
    export const HELP = [MAIN_MENU_BAR, "4_help"];
    export const TOGGLE = [...HELP, '1_toggle'];
}

@injectable()
export class CoreMenuContribution implements MenuContribution {

    registerMenus(registry: MenuModelRegistry) {
        // Explicitly register the Help Submenu
        registry.registerSubmenu([MAIN_MENU_BAR], ElectronMenus.HELP[1], "Help");

        // Cut/Copy/Paste
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            CommonCommands.EDIT_MENU,
            CommonCommands.EDIT_MENU_CUT_COPY_PASTE_GROUP], {
                commandId: CommonCommands.EDIT_CUT,
                order: '0'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            CommonCommands.EDIT_MENU,
            CommonCommands.EDIT_MENU_CUT_COPY_PASTE_GROUP], {
                commandId: CommonCommands.EDIT_COPY,
                order: '1'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            CommonCommands.EDIT_MENU,
            CommonCommands.EDIT_MENU_CUT_COPY_PASTE_GROUP], {
                commandId: CommonCommands.EDIT_PASTE,
                order: '2'
            });


        registry.registerMenuAction(ElectronMenus.TOGGLE, {
            commandId: 'theia.electron.toggle.dev.tools'
        });
    }
}
