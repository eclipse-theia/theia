/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry } from '../common/menu';
import { KeybindingContribution, KeybindingRegistry } from '../common/keybinding';
import { KeyCode, Key, Modifier } from '../common/keys';
import { CommandContribution, CommandRegistry, Command } from '../common/command';
import { FrontendApplication } from '../browser/frontend-application';
import { injectable, inject } from "inversify";

export namespace CommonCommands {
    export const EDIT_MENU = "2_edit";
    export const EDIT_MENU_UNDO_GROUP = "1_undo/redo";
    export const EDIT_MENU_COPYPASTE_GROUP = "2_copy";

    export const EDIT_CUT = 'edit_cut';
    export const EDIT_COPY = 'edit_copy';
    export const EDIT_PASTE = 'edit_paste';

    export const EDIT_UNDO = 'undo';
    export const EDIT_REDO = 'redo';

    export const TAB_NEXT: Command = {
        id: 'tab:next',
        label: 'Switch to next tab'
    };
    export const TAB_PREVIOUS: Command = {
        id: 'tab:previous',
        label: 'Switch to previous tab'
    };
}

@injectable()
export class CommonFrontendContribution implements MenuContribution, CommandContribution, KeybindingContribution {

    constructor(
        @inject(FrontendApplication) protected readonly app: FrontendApplication
    ) { }

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

    registerCommands(commandRegistry: CommandRegistry): void {
        commandRegistry.registerCommand({
            id: CommonCommands.EDIT_CUT,
            label: 'Cut'
        });
        commandRegistry.registerCommand({
            id: CommonCommands.EDIT_COPY,
            label: 'Copy',
        });
        commandRegistry.registerCommand({
            id: CommonCommands.EDIT_PASTE,
            label: 'Paste'
        });
        commandRegistry.registerCommand({
            id: CommonCommands.EDIT_UNDO,
            label: 'Undo'
        });
        commandRegistry.registerCommand({
            id: CommonCommands.EDIT_REDO,
            label: 'Redo'
        });
        commandRegistry.registerCommand(CommonCommands.TAB_NEXT, {
            isEnabled: () => this.app.shell.hasSelectedTab(),
            execute: () => this.app.shell.activateNextTab()
        });

        commandRegistry.registerCommand(CommonCommands.TAB_PREVIOUS, {
            isEnabled: () => this.app.shell.hasSelectedTab(),
            execute: () => this.app.shell.activatePreviousTab()
        });
    }

    registerKeyBindings(registry: KeybindingRegistry): void {
        [
            {
                commandId: CommonCommands.TAB_NEXT.id,
                keyCode: KeyCode.createKeyCode({ first: Key.TAB, modifiers: [Modifier.M1] })
            },
            {
                commandId: CommonCommands.TAB_PREVIOUS.id,
                keyCode: KeyCode.createKeyCode({ first: Key.TAB, modifiers: [Modifier.M1, Modifier.M2] })
            },
        ].forEach(binding => {
            registry.registerKeyBinding(binding);
        });
    }
}
