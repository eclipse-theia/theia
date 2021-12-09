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
    isOSX, isWindows, MenuModelRegistry, MenuContribution, Disposable, nls
} from '../../common';
import {
    ApplicationShell, codicon, ConfirmDialog, KeybindingContribution, KeybindingRegistry,
    PreferenceScope, Widget, FrontendApplication, FrontendApplicationContribution, CommonMenus, CommonCommands, Dialog,
} from '../../browser';
import { ElectronMainMenuFactory } from './electron-main-menu-factory';
import { FrontendApplicationStateService, FrontendApplicationState } from '../../browser/frontend-application-state';
import { FrontendApplicationConfigProvider } from '../../browser/frontend-application-config-provider';
import { RequestTitleBarStyle, Restart, TitleBarStyleAtStartup, TitleBarStyleChanged } from '../../electron-common/messaging/electron-messages';
import { ZoomLevel } from '../window/electron-window-preferences';
import { BrowserMenuBarContribution } from '../../browser/menu/browser-menu-plugin';
import { WindowService } from '../../browser/window/window-service';

import '../../../src/electron-browser/menu/electron-menu-style.css';

export namespace ElectronCommands {
    export const TOGGLE_DEVELOPER_TOOLS = Command.toDefaultLocalizedCommand({
        id: 'theia.toggleDevTools',
        label: 'Toggle Developer Tools'
    });
    export const RELOAD = Command.toDefaultLocalizedCommand({
        id: 'view.reload',
        label: 'Reload Window'
    });
    export const ZOOM_IN = Command.toDefaultLocalizedCommand({
        id: 'view.zoomIn',
        label: 'Zoom In'
    });
    export const ZOOM_OUT = Command.toDefaultLocalizedCommand({
        id: 'view.zoomOut',
        label: 'Zoom Out'
    });
    export const RESET_ZOOM = Command.toDefaultLocalizedCommand({
        id: 'view.resetZoom',
        label: 'Reset Zoom'
    });
    export const CLOSE_WINDOW = Command.toDefaultLocalizedCommand({
        id: 'close.window',
        label: 'Close Window'
    });
    export const TOGGLE_FULL_SCREEN = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.toggleFullScreen',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Toggle Full Screen'
    });
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
export class ElectronMenuContribution extends BrowserMenuBarContribution implements FrontendApplicationContribution, CommandContribution, MenuContribution, KeybindingContribution {

    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    protected titleBarStyleChangeFlag = false;
    protected titleBarStyle?: string;

    constructor(
        @inject(ElectronMainMenuFactory) protected readonly factory: ElectronMainMenuFactory,
        @inject(ApplicationShell) protected shell: ApplicationShell
    ) {
        super(factory);
    }

    onStart(app: FrontendApplication): void {
        this.handleTitleBarStyling(app);
        if (isOSX) {
            // OSX: Recreate the menus when changing windows.
            // OSX only has one menu bar for all windows, so we need to swap
            // between them as the user switches windows.
            electron.remote.getCurrentWindow().on('focus', () => this.setMenu(app));
        }
        // Make sure the application menu is complete, once the frontend application is ready.
        // https://github.com/theia-ide/theia/issues/5100
        let onStateChange: Disposable | undefined = undefined;
        const stateServiceListener = (state: FrontendApplicationState) => {
            if (state === 'closing_window') {
                if (!!onStateChange) {
                    onStateChange.dispose();
                }
            }
        };
        onStateChange = this.stateService.onStateChanged(stateServiceListener);
        this.shell.mainPanel.onDidToggleMaximized(() => {
            this.handleToggleMaximized();
        });
        this.shell.bottomPanel.onDidToggleMaximized(() => {
            this.handleToggleMaximized();
        });
    }

    handleTitleBarStyling(app: FrontendApplication): void {
        this.hideTopPanel(app);
        electron.ipcRenderer.on(TitleBarStyleAtStartup, (_event, style: string) => {
            this.titleBarStyle = style;
            this.preferenceService.ready.then(() => {
                this.preferenceService.set('window.titleBarStyle', this.titleBarStyle, PreferenceScope.User);
            });
        });
        electron.ipcRenderer.send(RequestTitleBarStyle);
        this.preferenceService.ready.then(() => {
            this.setMenu(app);
            electron.remote.getCurrentWindow().setMenuBarVisibility(['classic', 'visible'].includes(this.preferenceService.get('window.menuBarVisibility', 'classic')));
        });
        this.preferenceService.onPreferenceChanged(change => {
            if (change.preferenceName === 'window.titleBarStyle') {
                if (this.titleBarStyleChangeFlag && this.titleBarStyle !== change.newValue && electron.remote.getCurrentWindow().isFocused()) {
                    electron.ipcRenderer.send(TitleBarStyleChanged, change.newValue);
                    this.handleRequiredRestart();
                }
                this.titleBarStyleChangeFlag = true;
            }
        });
    }

    handleToggleMaximized(): void {
        const preference = this.preferenceService.get('window.menuBarVisibility');
        if (preference === 'classic') {
            this.factory.setMenuBar();
        }
    }

    /**
     * Hides the `theia-top-panel` depending on the selected `titleBarStyle`.
     * The `theia-top-panel` is used as the container of the main, application menu-bar for the
     * browser. Native Electron has it's own.
     * By default, this method is called on application `onStart`.
     */
    protected hideTopPanel(app: FrontendApplication): void {
        const itr = app.shell.children();
        let child = itr.next();
        while (child) {
            // Top panel for the menu contribution is not required for native Electron title bar.
            if (child.id === 'theia-top-panel') {
                child.setHidden(this.titleBarStyle !== 'custom');
                break;
            } else {
                child = itr.next();
            }
        }
    }

    protected setMenu(app: FrontendApplication, electronMenu: electron.Menu | null = this.factory.createElectronMenuBar(),
        electronWindow: electron.BrowserWindow = electron.remote.getCurrentWindow()): void {
        if (isOSX) {
            electron.remote.Menu.setApplicationMenu(electronMenu);
        } else {
            this.hideTopPanel(app);
            if (this.titleBarStyle === 'custom' && !this.menuBar) {
                this.createCustomTitleBar(app, electronWindow);
            }
            // Unix/Windows: Set the per-window menus
            electronWindow.setMenu(electronMenu);
        }
    }

    protected createCustomTitleBar(app: FrontendApplication, electronWindow: electron.BrowserWindow): void {
        const dragPanel = new Widget();
        dragPanel.id = 'theia-drag-panel';
        app.shell.addWidget(dragPanel, { area: 'top' });
        this.appendMenu(app.shell);
        const controls = document.createElement('div');
        controls.id = 'window-controls';
        controls.append(
            this.createControlButton('minimize', () => electronWindow.minimize()),
            this.createControlButton('maximize', () => electronWindow.maximize()),
            this.createControlButton('restore', () => electronWindow.unmaximize()),
            this.createControlButton('close', () => electronWindow.close())
        );
        app.shell.topPanel.node.append(controls);
        this.handleWindowControls(electronWindow);
    }

    protected handleWindowControls(electronWindow: electron.BrowserWindow): void {
        toggleControlButtons();
        electronWindow.on('maximize', toggleControlButtons);
        electronWindow.on('unmaximize', toggleControlButtons);

        function toggleControlButtons(): void {
            if (electronWindow.isMaximized()) {
                document.body.classList.add('maximized');
            } else {
                document.body.classList.remove('maximized');
            }
        }
    }

    protected createControlButton(id: string, handler: () => void): HTMLElement {
        const button = document.createElement('div');
        button.id = `${id}-button`;
        button.className = `control-button ${codicon(`chrome-${id}`)}`;
        button.addEventListener('click', handler);
        return button;
    }

    protected async handleRequiredRestart(): Promise<void> {
        const msgNode = document.createElement('div');
        const message = document.createElement('p');
        message.textContent = nls.localizeByDefault('A setting has changed that requires a restart to take effect');
        const detail = document.createElement('p');
        detail.textContent = nls.localizeByDefault(
            'Press the restart button to restart {0} and enable the setting.', FrontendApplicationConfigProvider.get().applicationName);
        msgNode.append(message, detail);
        const restart = nls.localizeByDefault('Restart');
        const dialog = new ConfirmDialog({
            title: restart,
            msg: msgNode,
            ok: restart,
            cancel: Dialog.CANCEL
        });
        if (await dialog.open()) {
            this.windowService.setSafeToShutDown();
            electron.ipcRenderer.send(Restart);
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
        registry.registerCommand(ElectronCommands.TOGGLE_FULL_SCREEN, {
            isEnabled: () => currentWindow.isFullScreenable(),
            isVisible: () => currentWindow.isFullScreenable(),
            execute: () => currentWindow.setFullScreen(!currentWindow.isFullScreen())
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
            },
            {
                command: ElectronCommands.TOGGLE_FULL_SCREEN.id,
                keybinding: isOSX ? 'ctrl+ctrlcmd+f' : 'f11'
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
