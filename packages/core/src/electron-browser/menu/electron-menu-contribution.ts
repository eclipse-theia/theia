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
    isOSX, isWindows, MenuModelRegistry, MenuContribution, nls
} from '../../common';
import {
    ApplicationShell, codicon, ConfirmDialog, KeybindingContribution, KeybindingRegistry,
    PreferenceScope, FrontendApplication, FrontendApplicationContribution, CommonMenus, CommonCommands, Dialog, MENU_BAR_VISIBILITY, CorePreferences, Widget,
} from '../../browser';
import { ElectronMainMenuFactory } from './electron-main-menu-factory';
import { FrontendApplicationStateService } from '../../browser/frontend-application-state';
import { FrontendApplicationConfigProvider } from '../../browser/frontend-application-config-provider';
import { RequestTitleBarStyle, Restart, TitleBarStyleAtStartup, TitleBarStyleChanged } from '../../electron-common/messaging/electron-messages';
import { ZoomLevel } from '../window/electron-window-preferences';
import { BrowserMenuBarContribution, VISIBLE_MENU_CLASS } from '../../browser/menu/browser-menu-plugin';
import { WindowService } from '../../browser/window/window-service';

import '../../../src/electron-browser/menu/electron-menu-style.css';
import pDebounce = require('p-debounce');
import { ContextKeyService } from '../../browser/context-key-service';
import { TabBarToolbarRegistry } from '../../browser/shell/tab-bar-toolbar';

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
    export const VIEW_ZOOM = [...CommonMenus.VIEW_APPEARANCE_SUBMENU, '4_appearance_submenu_zoom'];
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

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(TabBarToolbarRegistry)
    protected readonly tabbarToolbarRegistry: TabBarToolbarRegistry;

    protected electronMenu: Electron.Menu | undefined; // eslint-disable-line no-null/no-null

    protected _titleBarStyle?: 'native' | 'custom';
    protected get titleBarStyle(): 'native' | 'custom' | undefined {
        return this._titleBarStyle;
    }
    protected set titleBarStyle(style: 'native' | 'custom' | undefined) {
        if (style !== 'native' && style !== 'custom') {
            return;
        }
        if (this._titleBarStyle !== undefined) {
            throw new Error('Title bar style should be set only once.');
        }
        this._titleBarStyle = style;
    }

    constructor(
        @inject(ElectronMainMenuFactory) protected readonly factory: ElectronMainMenuFactory,
        @inject(ApplicationShell) protected shell: ApplicationShell
    ) {
        super(factory);
    }

    async onStart(app: FrontendApplication): Promise<void> {
        await super.onStart(app);
        if (this.titleBarStyle === 'native') {
            this.subscribeToToggleChangeEvents();
        }
        if (isOSX) {
            // OSX: Recreate the menus when changing windows.
            // OSX only has one menu bar for all windows, so we need to swap
            // between them as the user switches windows.
            electron.remote.getCurrentWindow().on('focus', () => this.doSetMenu());
        }
    }

    protected ensureElectronMenu(): Electron.Menu {
        if (!this.electronMenu) {
            this.electronMenu = this.factory.createElectronMenuBar();
        }
        return this.electronMenu;
    }

    protected async subscribeToPreferenceEvents(): Promise<void> {
        const titleBarStyleKnown = new Promise<'custom' | 'native'>(resolve => {
            electron.ipcRenderer.once(TitleBarStyleAtStartup, (_event, style: 'native' | 'custom') => resolve(this.titleBarStyle = style));
            electron.ipcRenderer.send(RequestTitleBarStyle);
        });
        await Promise.all([titleBarStyleKnown, this.preferenceService.ready]);
        await this.preferenceService.set('window.titleBarStyle', this.titleBarStyle, PreferenceScope.User);
        this.preferenceService.onPreferenceChanged(change => {
            if (change.preferenceName === 'window.titleBarStyle') {
                this.handleTitleBarStyleChange();
            } else if (change.preferenceName === MENU_BAR_VISIBILITY) {
                this.handleVisibilityChange();
            }
        });
    }

    /**
     * Electron menus are effectively immutable once set, so if anything occurs that should change their state, we have to check for it and
     * reset the menu accordingly.
     */
    protected subscribeToToggleChangeEvents(): void {
        // Should receive all context key (including preferences) and tabbarToolbar `onChange` events. If your toggleable command doesn't trigger any of those, it should.
        this.contextKeyService.onDidChange(() => this.handleMenuCommandToggleState());
        this.tabbarToolbarRegistry.onDidChange(() => this.handleMenuCommandToggleState());
        // Even so, we'll check after commands are executed anyway.
        this.commandRegistry.onDidExecuteCommand(e => {
            if (this.commandRegistry.isToggleable(e.commandId)) {
                this.handleMenuCommandToggleState();
            }
        });
    }

    protected handleTitleBarStyleChange(titleBarStyle = this.preferenceService.get<'custom' | 'native'>('window.titleBarStyle', 'native')): void {
        if (this.titleBarStyle !== titleBarStyle && electron.remote.getCurrentWindow().isFocused()) {
            electron.ipcRenderer.send(TitleBarStyleChanged, titleBarStyle);
            this.handleRequiredRestart();
        }
    }

    protected attachMainMenu(): void {
        if (isOSX) {
            this.doSetMenu();
        }
        const menuVisibility = this.preferenceService.get<CorePreferences[typeof MENU_BAR_VISIBILITY]>(MENU_BAR_VISIBILITY, 'classic');
        if (this.titleBarStyle === 'custom' || menuVisibility === 'compact') {
            super.attachMainMenu(menuVisibility);
            this.appendWindowControls();
        } else {
            this.doSetMenu();
            this.handleVisibilityChange();
        }
    }

    protected doSetMenu(): void {
        if (isOSX) {
            electron.remote.Menu.setApplicationMenu(this.ensureElectronMenu());
        } else {
            electron.remote.getCurrentWindow().setMenu(this.ensureElectronMenu());
        }
    }

    protected handleVisibilityChange(menuVisibility = this.getMenuVisibility()): void {
        if (isOSX) { // OSX should never see this event, but this covers all bases.
            return;
        }
        if (this.titleBarStyle === 'custom') {
            return super.handleVisibilityChange(menuVisibility);
        }
        if (menuVisibility !== 'compact' && this.browserMenu) {
            this.browserMenu.parent = null; // eslint-disable-line no-null/no-null
        }
        if (menuVisibility === 'visible') {
            electron.remote.getCurrentWindow().setMenuBarVisibility(true);
        } else if (menuVisibility === 'classic') {
            electron.remote.getCurrentWindow().setMenuBarVisibility(!this.shell.isAreaMaximized());
        } else if (menuVisibility === 'hidden') {
            electron.remote.getCurrentWindow().setMenuBarVisibility(false);
        } else {
            electron.remote.getCurrentWindow().setMenuBarVisibility(false);
            return super.handleVisibilityChange();
        }
    }

    protected setVisibilityClass(): void {
        document.body.classList.add(VISIBLE_MENU_CLASS);
    }

    protected setMenuAndTopPanelVisibility(menuVisibility = this.getMenuVisibility()): void {
        this.shell.topPanel.setHidden(this.titleBarStyle === 'native');
        if (this.browserMenu) {
            this.browserMenu.setHidden(menuVisibility === 'hidden');
        };
    }

    protected handleKeyBindingChange(): void {
        if (this.electronMenu) {
            this.factory.updateKeybindings(this.electronMenu);
            this.doSetMenu();
        }
        super.handleKeyBindingChange();
    }

    protected readonly handleMenuCommandToggleState = pDebounce(() => this.doHandleMenuCommandToggleState(), 10);

    protected doHandleMenuCommandToggleState(): void {
        if (this.electronMenu) {
            this.factory.updateToggledStatus(this.electronMenu);
            this.doSetMenu();
        }
    }

    protected appendWindowControls(electronWindow: electron.BrowserWindow = electron.remote.getCurrentWindow()): void {
        const dragPanel = new Widget();
        dragPanel.id = 'theia-drag-panel';
        this.shell.topPanel.insertWidget(0, dragPanel);
        const controls = document.createElement('div');
        controls.id = 'window-controls';
        controls.append(
            this.createControlButton('minimize', () => electronWindow.minimize()),
            this.createControlButton('maximize', () => electronWindow.maximize()),
            this.createControlButton('restore', () => electronWindow.unmaximize()),
            this.createControlButton('close', () => electronWindow.close())
        );
        this.shell.topPanel.node.append(controls);
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
        super.registerCommands(registry);

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
        super.registerMenus(registry);
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
        registry.registerMenuAction(CommonMenus.VIEW_APPEARANCE_SUBMENU_SCREEN, {
            commandId: ElectronCommands.TOGGLE_FULL_SCREEN.id,
            label: nls.localizeByDefault('Full Screen'),
            order: '0'
        });
    }
}
