/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as electron from 'electron';
import { inject, injectable } from 'inversify';
import {
    Command, CommandContribution, CommandRegistry,
    MenuModelRegistry, MenuContribution
} from '../../common';
import { KeybindingContribution, KeybindingRegistry } from '../../browser';
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
    export const VIEW_WINDOW = [...CommonMenus.VIEW, 'window'];
    export const VIEW_ZOOM = [...CommonMenus.VIEW, 'zoom'];
}

export namespace ElectronMenus {
    export const HELP_TOGGLE = [...CommonMenus.HELP, 'z_toggle'];
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
        electron.remote.getCurrentWindow().setMenu(this.factory.createMenuBar());
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

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybindings(
            {
                command: ElectronCommands.TOGGLE_DEVELOPER_TOOLS.id,
                keybinding: "ctrlcmd+shift+i"
            },
            {
                command: ElectronCommands.RELOAD.id,
                keybinding: "ctrlcmd+r"
            },
            {
                command: ElectronCommands.ZOOM_IN.id,
                keybinding: "ctrlcmd+="
            },
            {
                command: ElectronCommands.ZOOM_OUT.id,
                keybinding: "ctrlcmd+-"
            },
            {
                command: ElectronCommands.RESET_ZOOM.id,
                keybinding: "ctrlcmd+0"
            }
        );
    }

    registerMenus(registry: MenuModelRegistry) {
        registry.registerMenuAction(ElectronMenus.HELP_TOGGLE, {
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
