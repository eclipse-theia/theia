/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as electron from 'electron';
import { inject, injectable } from 'inversify';
import {
    Command, CommandContribution, CommandRegistry,
    KeybindingContribution, KeybindingRegistry, KeyCode, Key, Modifier,
    MAIN_MENU_BAR, MenuModelRegistry, MenuContribution
} from '../../common';
import { FrontendApplication, FrontendApplicationContribution } from '../../browser';
import { ElectronMainMenuFactory } from './electron-main-menu-factory';

export namespace ElectronMenuCommands {
    export const TOGGLE_DEVELOPER_TOOLS: Command = {
        id: 'theia.toggleDevTools',
        label: 'Toggle Developer Tools'
    };
}

export namespace ElectronMenus {
    export const HELP = [MAIN_MENU_BAR, "4_help"];
    export const TOGGLE = [...HELP, '1_toggle'];
}

@injectable()
export class ElectronMenuContribution implements FrontendApplicationContribution, CommandContribution, MenuContribution, KeybindingContribution {

    constructor(
        @inject(ElectronMainMenuFactory) protected readonly factory: ElectronMainMenuFactory
    ) { }

    onStart(app: FrontendApplication): void {
        const itr = app.shell.children();
        let child = itr.next();
        while (child) {
            // Top panel for the menu contribution is not required for Electron.
            // TODO: Make sure this is the case on Windows too.
            if (child.id === 'theia-top-panel') {
                child.setHidden(true);
                child = undefined;
            } else {
                child = itr.next();
            }
        }
        electron.remote.Menu.setApplicationMenu(this.factory.createMenuBar());
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(ElectronMenuCommands.TOGGLE_DEVELOPER_TOOLS, {
            execute: () => {
                const webContent = electron.remote.getCurrentWebContents();
                if (!webContent.isDevToolsOpened()) {
                    webContent.openDevTools();
                } else {
                    webContent.closeDevTools();
                }
            }
        });
    }

    registerKeyBindings(registry: KeybindingRegistry): void {
        registry.registerKeyBinding({
            commandId: ElectronMenuCommands.TOGGLE_DEVELOPER_TOOLS.id,
            keyCode: KeyCode.createKeyCode({ first: Key.KEY_I, modifiers: [Modifier.M1, Modifier.M2] })
        });
    }

    registerMenus(registry: MenuModelRegistry) {
        // Explicitly register the Help Submenu
        registry.registerSubmenu([MAIN_MENU_BAR], ElectronMenus.HELP[1], "Help");
        registry.registerMenuAction(ElectronMenus.TOGGLE, {
            commandId: ElectronMenuCommands.TOGGLE_DEVELOPER_TOOLS.id
        });
    }

}
