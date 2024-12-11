// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    ipcMain, BrowserWindow, Menu, MenuItemConstructorOptions, webContents, WebContents, session, shell, clipboard, IpcMainEvent
} from '@theia/electron/shared/electron';
import * as nativeKeymap from '@theia/electron/shared/native-keymap';

import { inject, injectable } from 'inversify';
import { FrontendApplicationState, StopReason } from '../common/frontend-application-state';
import { ElectronSecurityToken } from '../electron-common/electron-token';
import {
    CHANNEL_GET_SECURITY_TOKEN, CHANNEL_SET_MENU, MenuDto, CHANNEL_INVOKE_MENU, CHANNEL_FOCUS_WINDOW,
    CHANNEL_ATTACH_SECURITY_TOKEN, CHANNEL_OPEN_POPUP, CHANNEL_ON_CLOSE_POPUP, CHANNEL_CLOSE_POPUP,
    CHANNEL_GET_TITLE_STYLE_AT_STARTUP,
    CHANNEL_MINIMIZE,
    CHANNEL_MAXIMIZE,
    CHANNEL_UNMAXIMIZE,
    CHANNEL_CLOSE,
    CHANNEL_ON_WINDOW_EVENT,
    WindowEvent,
    CHANNEL_TOGGLE_DEVTOOLS,
    CHANNEL_SET_ZOOM_LEVEL,
    CHANNEL_GET_ZOOM_LEVEL,
    CHANNEL_IS_FULL_SCREENABLE,
    CHANNEL_REQUEST_CLOSE,
    CHANNEL_RESTART,
    CHANNEL_SET_TITLE_STYLE,
    CHANNEL_REQUEST_RELOAD,
    CHANNEL_APP_STATE_CHANGED,
    CHANNEL_SHOW_ITEM_IN_FOLDER,
    CHANNEL_READ_CLIPBOARD,
    CHANNEL_WRITE_CLIPBOARD,
    CHANNEL_IPC_CONNECTION,
    CHANNEL_IS_FULL_SCREEN,
    InternalMenuDto,
    CHANNEL_SET_MENU_BAR_VISIBLE,
    CHANNEL_TOGGLE_FULL_SCREEN,
    CHANNEL_IS_MAXIMIZED,
    CHANNEL_REQUEST_SECONDARY_CLOSE,
    CHANNEL_SET_BACKGROUND_COLOR,
    CHANNEL_WC_METADATA,
    CHANNEL_ABOUT_TO_CLOSE,
    CHANNEL_OPEN_WITH_SYSTEM_APP,
    CHANNEL_OPEN_URL
} from '../electron-common/electron-api';
import { ElectronMainApplication, ElectronMainApplicationContribution } from './electron-main-application';
import { Disposable, DisposableCollection, isOSX, MaybePromise } from '../common';
import { createDisposableListener } from './event-utils';

@injectable()
export class TheiaMainApi implements ElectronMainApplicationContribution {
    @inject(ElectronSecurityToken)
    protected electronSecurityToken: ElectronSecurityToken;

    protected readonly openPopups = new Map<number, Menu>();

    onStart(application: ElectronMainApplication): MaybePromise<void> {
        ipcMain.on(CHANNEL_WC_METADATA, event => {
            event.returnValue = event.sender.id.toString();
        });

        // electron security token
        ipcMain.on(CHANNEL_GET_SECURITY_TOKEN, event => {
            event.returnValue = this.electronSecurityToken.value;
        });

        ipcMain.handle(CHANNEL_ATTACH_SECURITY_TOKEN, (event, endpoint) => session.defaultSession.cookies.set({
            url: endpoint,
            name: ElectronSecurityToken,
            value: JSON.stringify(this.electronSecurityToken),
            httpOnly: true,
            sameSite: 'no_restriction'
        }));

        // application menu
        ipcMain.on(CHANNEL_SET_MENU, (event, menuId: number, menu: MenuDto[]) => {
            let electronMenu: Menu | null;
            if (menu) {
                electronMenu = Menu.buildFromTemplate(this.fromMenuDto(event.sender, menuId, menu));
            } else {
                // eslint-disable-next-line no-null/no-null
                electronMenu = null;
            }
            if (isOSX) {
                Menu.setApplicationMenu(electronMenu);
            } else {
                BrowserWindow.fromWebContents(event.sender)?.setMenu(electronMenu);
            }
        });

        ipcMain.on(CHANNEL_SET_MENU_BAR_VISIBLE, (event, visible: boolean, windowName: string | undefined) => {
            let electronWindow;
            if (windowName) {
                electronWindow = BrowserWindow.getAllWindows().find(win => win.webContents.mainFrame.name === windowName);
            } else {
                electronWindow = BrowserWindow.fromWebContents(event.sender);
            }
            if (electronWindow) {
                electronWindow.setMenuBarVisibility(visible);
            } else {
                console.warn(`There is no known secondary window '${windowName}'. Thus, the menu bar could not be made visible.`);
            }
        });

        // popup menu
        ipcMain.handle(CHANNEL_OPEN_POPUP, (event, menuId, menu, x, y, windowName?: string) => {
            const zoom = event.sender.getZoomFactor();
            // TODO: Remove the offset once Electron fixes https://github.com/electron/electron/issues/31641
            const offset = process.platform === 'win32' ? 0 : 2;
            // x and y values must be Ints or else there is a conversion error
            x = Math.round(x * zoom) + offset;
            y = Math.round(y * zoom) + offset;
            const popup = Menu.buildFromTemplate(this.fromMenuDto(event.sender, menuId, menu));
            this.openPopups.set(menuId, popup);
            let electronWindow: BrowserWindow | undefined;
            if (windowName) {
                electronWindow = BrowserWindow.getAllWindows().find(win => win.webContents.mainFrame.name === windowName);
            } else {
                electronWindow = BrowserWindow.fromWebContents(event.sender) || undefined;
            }
            popup.popup({
                window: electronWindow,
                callback: () => {
                    this.openPopups.delete(menuId);
                    event.sender.send(CHANNEL_ON_CLOSE_POPUP, menuId);
                }
            });
        });

        ipcMain.handle(CHANNEL_CLOSE_POPUP, (event, handle) => {
            if (this.openPopups.has(handle)) {
                this.openPopups.get(handle)!.closePopup();
            }
        });

        // focus windows for secondary window support
        ipcMain.on(CHANNEL_FOCUS_WINDOW, (event, windowName) => {
            const electronWindow = windowName
                ? BrowserWindow.getAllWindows().find(win => win.webContents.mainFrame.name === windowName)
                : BrowserWindow.fromWebContents(event.sender);
            if (electronWindow) {
                if (electronWindow.isMinimized()) {
                    electronWindow.restore();
                }
                electronWindow.focus();
            } else {
                console.warn(`There is no known secondary window '${windowName}'. Thus, the window could not be focussed.`);
            }
        });

        ipcMain.on(CHANNEL_SHOW_ITEM_IN_FOLDER, (event, fsPath) => {
            shell.showItemInFolder(fsPath);
        });

        ipcMain.on(CHANNEL_OPEN_WITH_SYSTEM_APP, (event, uri) => {
            shell.openExternal(uri);
        });

        ipcMain.handle(CHANNEL_GET_TITLE_STYLE_AT_STARTUP, event => application.getTitleBarStyleAtStartup(event.sender));

        ipcMain.on(CHANNEL_SET_TITLE_STYLE, (event, style) => application.setTitleBarStyle(event.sender, style));

        ipcMain.on(CHANNEL_SET_BACKGROUND_COLOR, (event, backgroundColor) => application.setBackgroundColor(event.sender, backgroundColor));

        ipcMain.on(CHANNEL_MINIMIZE, event => {
            BrowserWindow.fromWebContents(event.sender)?.minimize();
        });

        ipcMain.on(CHANNEL_IS_MAXIMIZED, event => {
            event.returnValue = BrowserWindow.fromWebContents(event.sender)?.isMaximized();
        });

        ipcMain.on(CHANNEL_MAXIMIZE, event => {
            BrowserWindow.fromWebContents(event.sender)?.maximize();
        });

        ipcMain.on(CHANNEL_UNMAXIMIZE, event => {
            BrowserWindow.fromWebContents(event.sender)?.unmaximize();
        });

        ipcMain.on(CHANNEL_CLOSE, event => {
            BrowserWindow.fromWebContents(event.sender)?.close();
        });

        ipcMain.on(CHANNEL_RESTART, event => {
            application.restart(event.sender);
        });

        ipcMain.on(CHANNEL_TOGGLE_DEVTOOLS, event => {
            event.sender.toggleDevTools();
        });

        ipcMain.on(CHANNEL_SET_ZOOM_LEVEL, (event, zoomLevel: number) => {
            event.sender.setZoomLevel(zoomLevel);
        });

        ipcMain.handle(CHANNEL_GET_ZOOM_LEVEL, event => event.sender.getZoomLevel());

        ipcMain.on(CHANNEL_TOGGLE_FULL_SCREEN, event => {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win) {
                win.setFullScreen(!win.isFullScreen());
            }
        });
        ipcMain.on(CHANNEL_IS_FULL_SCREENABLE, event => {
            event.returnValue = BrowserWindow.fromWebContents(event.sender)?.isFullScreenable();
        });

        ipcMain.on(CHANNEL_IS_FULL_SCREEN, event => {
            event.returnValue = BrowserWindow.fromWebContents(event.sender)?.isFullScreen();
        });

        ipcMain.on(CHANNEL_READ_CLIPBOARD, event => {
            event.returnValue = clipboard.readText();
        });
        ipcMain.on(CHANNEL_WRITE_CLIPBOARD, (event, text) => {
            clipboard.writeText(text);
        });

        nativeKeymap.onDidChangeKeyboardLayout(() => {
            const newLayout = {
                info: nativeKeymap.getCurrentKeyboardLayout(),
                mapping: nativeKeymap.getKeyMap()
            };
            for (const webContent of webContents.getAllWebContents()) {
                webContent.send('keyboardLayoutChanged', newLayout);
            }
        });
    }

    private isASCI(accelerator: string | undefined): boolean {
        if (typeof accelerator !== 'string') {
            return false;
        }
        for (let i = 0; i < accelerator.length; i++) {
            if (accelerator.charCodeAt(i) > 127) {
                return false;
            }
        }
        return true;
    }

    fromMenuDto(sender: WebContents, menuId: number, menuDto: InternalMenuDto[]): MenuItemConstructorOptions[] {
        return menuDto.map(dto => {
            const result: MenuItemConstructorOptions = {
                id: dto.id,
                label: dto.label,
                type: dto.type,
                checked: dto.checked,
                enabled: dto.enabled,
                visible: dto.visible,
                role: dto.role,
                accelerator: this.isASCI(dto.accelerator) ? dto.accelerator : undefined
            };
            if (dto.submenu) {
                result.submenu = this.fromMenuDto(sender, menuId, dto.submenu);
            }
            if (dto.handlerId) {
                result.click = () => {
                    sender.send(CHANNEL_INVOKE_MENU, menuId, dto.handlerId);
                };
            }
            return result;
        });
    }
}

let nextReplyChannel: number = 0;

export namespace TheiaRendererAPI {
    export function sendWindowEvent(wc: WebContents, event: WindowEvent): void {
        wc.send(CHANNEL_ON_WINDOW_EVENT, event);
    }

    export function openUrl(wc: WebContents, url: string): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            const channelNr = nextReplyChannel++;
            const replyChannel = `openUrl${channelNr}`;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const l = createDisposableListener(ipcMain, replyChannel, (e, args: any[]) => {
                l.dispose();
                resolve(args[0]);
            });

            wc.send(CHANNEL_OPEN_URL, url, replyChannel);
        });
    }

    export function sendAboutToClose(wc: WebContents): Promise<void> {
        return new Promise<void>(resolve => {
            const channelNr = nextReplyChannel++;
            const replyChannel = `aboutToClose${channelNr}`;
            const l = createDisposableListener(ipcMain, replyChannel, e => {
                l.dispose();
                resolve();
            });

            wc.send(CHANNEL_ABOUT_TO_CLOSE, replyChannel);
        });
    }

    export function requestClose(wc: WebContents, stopReason: StopReason): Promise<boolean> {
        const channelNr = nextReplyChannel++;
        const confirmChannel = `confirm-${channelNr}`;
        const cancelChannel = `cancel-${channelNr}`;
        const disposables = new DisposableCollection();

        return new Promise<boolean>(resolve => {
            wc.send(CHANNEL_REQUEST_CLOSE, stopReason, confirmChannel, cancelChannel);
            createDisposableListener(ipcMain, confirmChannel, e => {
                resolve(true);
            }, disposables);
            createDisposableListener(ipcMain, cancelChannel, e => {
                resolve(false);
            }, disposables);
        }).finally(() => disposables.dispose());
    }

    export function requestSecondaryClose(mainWindow: WebContents, secondaryWindow: WebContents): Promise<boolean> {
        const channelNr = nextReplyChannel++;
        const confirmChannel = `confirm-${channelNr}`;
        const cancelChannel = `cancel-${channelNr}`;
        const disposables = new DisposableCollection();

        return new Promise<boolean>(resolve => {
            mainWindow.send(CHANNEL_REQUEST_SECONDARY_CLOSE, secondaryWindow.mainFrame.name, confirmChannel, cancelChannel);
            createDisposableListener(ipcMain, confirmChannel, e => {
                resolve(true);
            }, disposables);
            createDisposableListener(ipcMain, cancelChannel, e => {
                resolve(false);
            }, disposables);
        }).finally(() => disposables.dispose());
    }

    export function onRequestReload(wc: WebContents, handler: () => void): Disposable {
        return createWindowListener(wc, CHANNEL_REQUEST_RELOAD, handler);
    }

    export function onApplicationStateChanged(wc: WebContents, handler: (state: FrontendApplicationState) => void): Disposable {
        return createWindowListener(wc, CHANNEL_APP_STATE_CHANGED, state => handler(state as FrontendApplicationState));
    }

    export function onIpcData(handler: (sender: WebContents, data: Uint8Array) => void): Disposable {
        return createDisposableListener<IpcMainEvent>(ipcMain, CHANNEL_IPC_CONNECTION, (event, data) => handler(event.sender, data as Uint8Array));
    }

    export function sendData(wc: WebContents, data: Uint8Array): void {
        wc.send(CHANNEL_IPC_CONNECTION, data);
    }

    function createWindowListener(wc: WebContents, channel: string, handler: (...args: unknown[]) => unknown): Disposable {
        return createDisposableListener<IpcMainEvent>(ipcMain, channel, (event, ...args) => {
            if (wc.id === event.sender.id) {
                handler(...args);
            }
        });
    }
}
