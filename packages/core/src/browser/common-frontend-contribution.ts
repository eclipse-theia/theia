/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry } from '../common/menu';
import { KeybindingContribution, KeybindingRegistry } from '../common/keybinding';
import { KeyCode, Key, Modifier } from '../common/keys';
import { CommandContribution, CommandRegistry, Command } from '../common/command';
import { MessageService } from '../common/message-service';
import { FrontendApplication } from './frontend-application';
import * as browser from './browser';

export namespace CommonCommands {

    export const EDIT_MENU = "2_edit";
    export const EDIT_MENU_UNDO_GROUP = "1_undo/redo";
    export const EDIT_MENU_CUT_COPY_PASTE_GROUP = "2_cut/copy/paste";
    export const EDIT_MENU_FIND_REPLACE_GROUP = "3_find/replace";

    export const CUT: Command = {
        id: 'theia.cut',
        label: 'Cut'
    };
    export const COPY: Command = {
        id: 'theia.copy',
        label: 'Copy'
    };
    export const PASTE: Command = {
        id: 'theia.paste',
        label: 'Paste'
    };

    export const UNDO: Command = {
        id: 'theia.undo',
        label: 'Undo'
    };
    export const REDO: Command = {
        id: 'theia.redo',
        label: 'Redo'
    };

    export const FIND: Command = {
        id: 'theia.find',
        label: 'Find'
    };
    export const REPLACE: Command = {
        id: 'theia.replace',
        label: 'Replace'
    };

    export const NEXT_TAB: Command = {
        id: 'theia.nextTab',
        label: 'Switch to next tab'
    };
    export const PREVIOUS_TAB: Command = {
        id: 'theia.previousTab',
        label: 'Switch to previous tab'
    };

}

export const supportCut = browser.isNative || document.queryCommandSupported('cut');
export const supportCopy = browser.isNative || document.queryCommandSupported('copy');
// Chrome incorrectly returns true for document.queryCommandSupported('paste')
// when the paste feature is available but the calling script has insufficient
// privileges to actually perform the action
export const supportPaste = browser.isNative || (!browser.isChrome && document.queryCommandSupported('paste'));

@injectable()
export class CommonFrontendContribution implements MenuContribution, CommandContribution, KeybindingContribution {

    constructor(
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(MessageService) protected readonly messageService: MessageService
    ) { }

    registerMenus(registry: MenuModelRegistry): void {
        // Explicitly register the Edit Submenu
        registry.registerSubmenu([MAIN_MENU_BAR], CommonCommands.EDIT_MENU, "Edit");

        // Undo/Redo
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            CommonCommands.EDIT_MENU,
            CommonCommands.EDIT_MENU_UNDO_GROUP], {
                commandId: CommonCommands.UNDO.id,
                order: '0'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            CommonCommands.EDIT_MENU,
            CommonCommands.EDIT_MENU_UNDO_GROUP], {
                commandId: CommonCommands.REDO.id,
                order: '1'
            });

        // Find/Replace
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            CommonCommands.EDIT_MENU,
            CommonCommands.EDIT_MENU_FIND_REPLACE_GROUP], {
                commandId: CommonCommands.FIND.id,
                order: '0'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            CommonCommands.EDIT_MENU,
            CommonCommands.EDIT_MENU_FIND_REPLACE_GROUP], {
                commandId: CommonCommands.REPLACE.id,
                order: '1'
            });

        // Cut/Copy/Paste
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            CommonCommands.EDIT_MENU,
            CommonCommands.EDIT_MENU_CUT_COPY_PASTE_GROUP], {
                commandId: CommonCommands.CUT.id,
                order: '0'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            CommonCommands.EDIT_MENU,
            CommonCommands.EDIT_MENU_CUT_COPY_PASTE_GROUP], {
                commandId: CommonCommands.COPY.id,
                order: '1'
            });
        registry.registerMenuAction([
            MAIN_MENU_BAR,
            CommonCommands.EDIT_MENU,
            CommonCommands.EDIT_MENU_CUT_COPY_PASTE_GROUP], {
                commandId: CommonCommands.PASTE.id,
                order: '2'
            });
    }

    registerCommands(commandRegistry: CommandRegistry): void {
        commandRegistry.registerCommand(CommonCommands.CUT, {
            execute: () => {
                if (supportCut) {
                    document.execCommand('cut');
                } else {
                    this.messageService.warn('Please use the browser cut command or shortcut.');
                }
            }
        });
        commandRegistry.registerCommand(CommonCommands.COPY, {
            execute: () => {
                if (supportCopy) {
                    document.execCommand('copy');
                } else {
                    this.messageService.warn('Please use the browser copy command or shortcut.');
                }
            }
        });
        commandRegistry.registerCommand(CommonCommands.PASTE, {
            execute: () => {
                if (supportPaste) {
                    document.execCommand('paste');
                } else {
                    this.messageService.warn('Please use the browser paste command or shortcut.');
                }
            }
        });

        commandRegistry.registerCommand(CommonCommands.UNDO);
        commandRegistry.registerCommand(CommonCommands.REDO);

        commandRegistry.registerCommand(CommonCommands.FIND);
        commandRegistry.registerCommand(CommonCommands.REPLACE);

        commandRegistry.registerCommand(CommonCommands.NEXT_TAB, {
            isEnabled: () => this.app.shell.hasSelectedTab(),
            execute: () => this.app.shell.activateNextTab()
        });
        commandRegistry.registerCommand(CommonCommands.PREVIOUS_TAB, {
            isEnabled: () => this.app.shell.hasSelectedTab(),
            execute: () => this.app.shell.activatePreviousTab()
        });
    }

    registerKeyBindings(registry: KeybindingRegistry): void {
        if (supportCut) {
            registry.registerKeyBinding({
                commandId: CommonCommands.CUT.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_X, modifiers: [Modifier.M1] })
            });
        }
        if (supportCopy) {
            registry.registerKeyBinding({
                commandId: CommonCommands.COPY.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [Modifier.M1] })
            });
        }
        if (supportPaste) {
            registry.registerKeyBinding({
                commandId: CommonCommands.PASTE.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_V, modifiers: [Modifier.M1] })
            });
        }
        registry.registerKeybindings(
            {
                commandId: CommonCommands.UNDO.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_Z, modifiers: [Modifier.M1] })
            },
            {
                commandId: CommonCommands.REDO.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_Z, modifiers: [Modifier.M2, Modifier.M1] })
            },
            {
                commandId: CommonCommands.FIND.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_F, modifiers: [Modifier.M1] })
            },
            {
                commandId: CommonCommands.REPLACE.id,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_F, modifiers: [Modifier.M3, Modifier.M1] })
            },
            {
                commandId: CommonCommands.NEXT_TAB.id,
                keyCode: KeyCode.createKeyCode({ first: Key.TAB, modifiers: [Modifier.M1] })
            },
            {
                commandId: CommonCommands.PREVIOUS_TAB.id,
                keyCode: KeyCode.createKeyCode({ first: Key.TAB, modifiers: [Modifier.M1, Modifier.M2] })
            }
        );
    }
}
