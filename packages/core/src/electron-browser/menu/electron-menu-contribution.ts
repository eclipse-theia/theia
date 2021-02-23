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

import * as electron from '../../../shared/electron';
import { inject, injectable } from 'inversify';
import {
    Command, CommandContribution, CommandRegistry,
    isOSX, isWindows, MenuModelRegistry, MenuContribution, Disposable
} from '../../common';
import { KeybindingContribution, KeybindingRegistry, PreferenceScope, PreferenceService } from '../../browser';
import { FrontendApplication, FrontendApplicationContribution, CommonMenus } from '../../browser';
import { ElectronMainMenuFactory } from './electron-main-menu-factory';
import { FrontendApplicationStateService, FrontendApplicationState } from '../../browser/frontend-application-state';
import { ZoomLevel } from '../window/electron-window-preferences';

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
    export const CLOSE_WINDOW: Command = {
        id: 'close.window',
        label: 'Close Window'
    };
}

export namespace ElectronMenus {
    export const VIEW_WINDOW = [...CommonMenus.VIEW, 'window'];
    export const VIEW_ZOOM = [...CommonMenus.VIEW, 'zoom'];
}

export namespace ElectronMenus {
    export const HELP_TOGGLE = [...CommonMenus.HELP, 'z_toggle'];
}

export namespace ElectronMenus {
    export const FILE_CLOSE = [...CommonMenus.FILE_CLOSE, 'window-close'];
}

@injectable()
export class ElectronMenuContribution implements FrontendApplicationContribution, CommandContribution, MenuContribution, KeybindingContribution {

    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    constructor(
        @inject(ElectronMainMenuFactory) protected readonly factory: ElectronMainMenuFactory
    ) { }

    onStart(app: FrontendApplication): void {
        this.hideTopPanel(app);
        this.setMenu();
        if (isOSX) {
            // OSX: Recreate the menus when changing windows.
            // OSX only has one menu bar for all windows, so we need to swap
            // between them as the user switches windows.
            electron.remote.getCurrentWindow().on('focus', () => this.setMenu());
        }
        // Make sure the application menu is complete, once the frontend application is ready.
        // https://github.com/theia-ide/theia/issues/5100
        let onStateChange: Disposable | undefined = undefined;
        const stateServiceListener = (state: FrontendApplicationState) => {
            if (state === 'ready') {
                this.setMenu();
            }
            if (state === 'closing_window') {
                if (!!onStateChange) {
                    onStateChange.dispose();
                }
            }
        };
        onStateChange = this.stateService.onStateChanged(stateServiceListener);
    }

    /**
     * Makes the `theia-top-panel` hidden as it is unused for the electron-based application.
     * The `theia-top-panel` is used as the container of the main, application menu-bar for the
     * browser. Electron has it's own.
     * By default, this method is called on application `onStart`.
     */
    protected hideTopPanel(app: FrontendApplication): void {
        const itr = app.shell.children();
        let child = itr.next();
        while (child) {
            // Top panel for the menu contribution is not required for Electron.
            if (child.id === 'theia-top-panel') {
                child.setHidden(true);
                child = undefined;
            } else {
                child = itr.next();
            }
        }
    }

    private setMenu(menu: electron.Menu = this.factory.createMenuBar(), electronWindow: electron.BrowserWindow = electron.remote.getCurrentWindow()): void {
        if (isOSX) {
            electron.remote.Menu.setApplicationMenu(menu);
        } else {
            // Unix/Windows: Set the per-window menus
            electronWindow.setMenu(menu);
        }
    }

    registerCommands(registry: CommandRegistry): void {

        const currentWindow = electron.remote.getCurrentWindow();

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
            execute: () => currentWindow.reload()
        });
        registry.registerCommand(ElectronCommands.CLOSE_WINDOW, {
            execute: () => currentWindow.close()
        });

        registry.registerCommand(ElectronCommands.ZOOM_IN, {
            execute: () => {
                const webContents = currentWindow.webContents;
                // When starting at a level that is not a multiple of 0.5, increment by at most 0.5 to reach the next highest multiple of 0.5.
                let zoomLevel = (Math.floor(webContents.zoomLevel / ZoomLevel.VARIATION) * ZoomLevel.VARIATION) + ZoomLevel.VARIATION;
                if (zoomLevel > ZoomLevel.MAX) {
                    zoomLevel = ZoomLevel.MAX;
                    return;
                };
                this.preferenceService.set('window.zoomLevel', zoomLevel, PreferenceScope.User);
            }
        });
        registry.registerCommand(ElectronCommands.ZOOM_OUT, {
            execute: () => {
                const webContents = currentWindow.webContents;
                // When starting at a level that is not a multiple of 0.5, decrement by at most 0.5 to reach the next lowest multiple of 0.5.
                let zoomLevel = (Math.ceil(webContents.zoomLevel / ZoomLevel.VARIATION) * ZoomLevel.VARIATION) - ZoomLevel.VARIATION;
                if (zoomLevel < ZoomLevel.MIN) {
                    zoomLevel = ZoomLevel.MIN;
                    return;
                };
                this.preferenceService.set('window.zoomLevel', zoomLevel, PreferenceScope.User);
            }
        });
        registry.registerCommand(ElectronCommands.RESET_ZOOM, {
            execute: () => this.preferenceService.set('window.zoomLevel', ZoomLevel.DEFAULT, PreferenceScope.User)
        });
    }

    registerKeybindings(registry: KeybindingRegistry): void {
        registry.registerKeybindings(
            {
                command: ElectronCommands.TOGGLE_DEVELOPER_TOOLS.id,
                keybinding: 'ctrlcmd+alt+i'
            },
            {
                command: ElectronCommands.RELOAD.id,
                keybinding: 'ctrlcmd+r'
            },
            {
                command: ElectronCommands.ZOOM_IN.id,
                keybinding: 'ctrlcmd+='
            },
            {
                command: ElectronCommands.ZOOM_OUT.id,
                keybinding: 'ctrlcmd+-'
            },
            {
                command: ElectronCommands.RESET_ZOOM.id,
                keybinding: 'ctrlcmd+0'
            },
            {
                command: ElectronCommands.CLOSE_WINDOW.id,
                keybinding: (isOSX ? 'cmd+shift+w' : (isWindows ? 'ctrl+w' : /* Linux */ 'ctrl+q'))
            }
        );
    }

    registerMenus(registry: MenuModelRegistry): void {
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
        registry.registerMenuAction(ElectronMenus.FILE_CLOSE, {
            commandId: ElectronCommands.CLOSE_WINDOW.id,
        });
    }
}
