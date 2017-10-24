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
import { FrontendApplication, FrontendApplicationContribution, CommonMenus } from '../../browser';
import { ElectronMainMenuFactory } from './electron-main-menu-factory';

export namespace ElectronCommands {
    export const TOGGLE_DEVELOPER_TOOLS: Command = {
        id: 'theia.toggleDevTools',
        label: 'Toggle Developer Tools'
    };
    export const RELOAD: Command = {
        id: 'view.reload',
        label: 'Reload Window'
    };
    export const ZOOM_IN: Command = {
        id: 'view.zoomIn',
        label: 'Zoom In'
    };
    export const ZOOM_OUT: Command = {
        id: 'view.zoomOut',
        label: 'Zoom Out'
    };
    export const RESET_ZOOM: Command = {
        id: 'view.resetZoom',
        label: 'Reset Zoom'
    };
}

export namespace ElectronMenus {
    export const VIEW_WINDOW = [...CommonMenus.VIEW.path, 'window'];
    export const VIEW_ZOOM = [...CommonMenus.VIEW.path, 'zoom'];
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
        registry.registerCommand(ElectronCommands.TOGGLE_DEVELOPER_TOOLS, {
            execute: () => {
                const webContent = electron.remote.getCurrentWebContents();
                if (!webContent.isDevToolsOpened()) {
                    webContent.openDevTools();
                } else {
                    webContent.closeDevTools();
                }
            }
        });

        registry.registerCommand(ElectronCommands.RELOAD, {
            execute: () => {
                const focusedWindow = electron.remote.getCurrentWindow();
                if (focusedWindow) {
                    focusedWindow.reload();
                }
            }
        });
        registry.registerCommand(ElectronCommands.ZOOM_IN, {
            execute: () => {
                const focusedWindow = electron.remote.getCurrentWindow();
                if (focusedWindow) {
                    const webContents = focusedWindow.webContents;
                    webContents.getZoomLevel(zoomLevel =>
                        webContents.setZoomLevel(zoomLevel + 0.5)
                    );
                }
            }
        });
        registry.registerCommand(ElectronCommands.ZOOM_OUT, {
            execute: () => {
                const focusedWindow = electron.remote.getCurrentWindow();
                if (focusedWindow) {
                    const webContents = focusedWindow.webContents;
                    webContents.getZoomLevel(zoomLevel =>
                        webContents.setZoomLevel(zoomLevel - 0.5)
                    );
                }
            }
        });
        registry.registerCommand(ElectronCommands.RESET_ZOOM, {
            execute: () => {
                const focusedWindow = electron.remote.getCurrentWindow();
                if (focusedWindow) {
                    focusedWindow.webContents.setZoomLevel(0);
                }
            }
        });
    }

    registerKeyBindings(registry: KeybindingRegistry): void {
        registry.registerKeyBinding({
            commandId: ElectronCommands.TOGGLE_DEVELOPER_TOOLS.id,
            keyCode: KeyCode.createKeyCode({ first: Key.KEY_I, modifiers: [Modifier.M1, Modifier.M2] })
        });

        registry.registerKeyBinding({
            commandId: ElectronCommands.RELOAD.id,
            keyCode: KeyCode.createKeyCode({ first: Key.KEY_R, modifiers: [Modifier.M1] })
        });

        registry.registerKeyBinding({
            commandId: ElectronCommands.ZOOM_IN.id,
            keyCode: KeyCode.createKeyCode({ first: Key.EQUAL, modifiers: [Modifier.M1] })
        });
        registry.registerKeyBinding({
            commandId: ElectronCommands.ZOOM_OUT.id,
            keyCode: KeyCode.createKeyCode({ first: Key.MINUS, modifiers: [Modifier.M1] })
        });
        registry.registerKeyBinding({
            commandId: ElectronCommands.RESET_ZOOM.id,
            keyCode: KeyCode.createKeyCode({ first: Key.DIGIT0, modifiers: [Modifier.M1] })
        });
    }

    registerMenus(registry: MenuModelRegistry) {
        registry.registerSubmenu([MAIN_MENU_BAR], ElectronMenus.HELP[1], "Help");
        registry.registerMenuAction(ElectronMenus.TOGGLE, {
            commandId: ElectronCommands.TOGGLE_DEVELOPER_TOOLS.id
        });

        registry.registerMenuAction(ElectronMenus.VIEW_WINDOW, {
            commandId: ElectronCommands.RELOAD.id,
            order: 'z0'
        });

        registry.registerMenuAction(ElectronMenus.VIEW_ZOOM, {
            commandId: ElectronCommands.ZOOM_IN.id,
            order: 'z1'
        });
        registry.registerMenuAction(ElectronMenus.VIEW_ZOOM, {
            commandId: ElectronCommands.ZOOM_OUT.id,
            order: 'z2'
        });
        registry.registerMenuAction(ElectronMenus.VIEW_ZOOM, {
            commandId: ElectronCommands.RESET_ZOOM.id,
            order: 'z3'
        });
    }

}
