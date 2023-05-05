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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
//
import { Disposable } from '../common/disposable';
import { StopReason } from '../common/frontend-application-state';
import { NativeKeyboardLayout } from '../common/keyboard/keyboard-layout-provider';
import {
    CHANNEL_ATTACH_SECURITY_TOKEN,
    CHANNEL_FOCUS_WINDOW, CHANNEL_GET_SECURITY_TOKEN, CHANNEL_INVOKE_MENU, CHANNEL_SET_MENU, CHANNEL_OPEN_POPUP, CHANNEL_CLOSE_POPUP,
    MenuDto, TheiaCoreAPI, CHANNEL_ON_CLOSE_POPUP, CHANNEL_GET_TITLE_STYLE_AT_STARTUP, WindowEvent,
    CHANNEL_MINIMIZE, CHANNEL_IS_MAXIMIZED, CHANNEL_MAXIMIZE, CHANNEL_UNMAXIMIZE, CHANNEL_CLOSE, CHANNEL_TOGGLE_DEVTOOLS,
    CHANNEL_ON_WINDOW_EVENT, CHANNEL_GET_ZOOM_LEVEL, CHANNEL_SET_ZOOM_LEVEL, CHANNEL_IS_FULL_SCREENABLE, CHANNEL_TOGGLE_FULL_SCREEN,
    CHANNEL_IS_FULL_SCREEN, CHANNEL_SET_MENU_BAR_VISIBLE, CHANNEL_REQUEST_CLOSE, CHANNEL_SET_TITLE_STYLE, CHANNEL_RESTART,
    CHANNEL_REQUEST_RELOAD, CHANNEL_APP_STATE_CHANGED, CHANNEL_SHOW_ITEM_IN_FOLDER, CHANNEL_READ_CLIPBOARD, CHANNEL_WRITE_CLIPBOARD,
    CHANNEL_KEYBOARD_LAYOUT_CHANGED, CHANNEL_IPC_CONNECTION, InternalMenuDto
} from '../electron-common/electron-api';

// eslint-disable-next-line import/no-extraneous-dependencies
const { ipcRenderer, contextBridge } = require('electron');

// a map of menuId => map<handler id => handler>
const commandHandlers = new Map<number, Map<number, () => void>>();
let nextHandlerId = 0;
const mainMenuId = 0;
let nextMenuId = mainMenuId + 1;

function convertMenu(menu: MenuDto[] | undefined, handlerMap: Map<number, () => void>): InternalMenuDto[] | undefined {
    if (!menu) {
        return undefined;
    }

    return menu.map(item => {
        let handlerId = undefined;
        if (item.execute) {
            handlerId = nextHandlerId++;
            handlerMap.set(handlerId, item.execute);
        }

        return {
            id: item.id,
            submenu: convertMenu(item.submenu, handlerMap),
            accelerator: item.accelerator,
            label: item.label,
            handlerId: handlerId,
            checked: item.checked,
            enabled: item.enabled,
            role: item.role,
            type: item.type,
            visible: item.visible
        };
    });
}

const api: TheiaCoreAPI = {
    setMenuBarVisible: (visible: boolean, windowName?: string) => ipcRenderer.send(CHANNEL_SET_MENU_BAR_VISIBLE, visible, windowName),
    setMenu: (menu: MenuDto[] | undefined) => {
        commandHandlers.delete(mainMenuId);
        const handlers = new Map<number, () => void>();
        commandHandlers.set(mainMenuId, handlers);
        ipcRenderer.send(CHANNEL_SET_MENU, mainMenuId, convertMenu(menu, handlers));
    },
    getSecurityToken: () => ipcRenderer.invoke(CHANNEL_GET_SECURITY_TOKEN),
    focusWindow: (name: string) => ipcRenderer.send(CHANNEL_FOCUS_WINDOW, name),
    showItemInFolder: fsPath => {
        ipcRenderer.send(CHANNEL_SHOW_ITEM_IN_FOLDER, fsPath);
    },
    attachSecurityToken: (endpoint: string) => ipcRenderer.invoke(CHANNEL_ATTACH_SECURITY_TOKEN, endpoint),

    popup: async function (menu: MenuDto[], x: number, y: number, onClosed: () => void): Promise<number> {
        const menuId = nextMenuId++;
        const handlers = new Map<number, () => void>();
        commandHandlers.set(menuId, handlers);
        const handle = await ipcRenderer.invoke(CHANNEL_OPEN_POPUP, menuId, convertMenu(menu, handlers), x, y);
        const closeListener = () => {
            ipcRenderer.removeListener(CHANNEL_ON_CLOSE_POPUP, closeListener);
            commandHandlers.delete(menuId);
            onClosed();
        };
        ipcRenderer.on(CHANNEL_ON_CLOSE_POPUP, closeListener);
        return handle;
    },
    closePopup: function (handle: number): void {
        ipcRenderer.send(CHANNEL_CLOSE_POPUP, handle);
    },
    getTitleBarStyleAtStartup: function (): Promise<string> {
        return ipcRenderer.invoke(CHANNEL_GET_TITLE_STYLE_AT_STARTUP);
    },
    setTitleBarStyle: function (style): void {
        ipcRenderer.send(CHANNEL_SET_TITLE_STYLE, style);
    },
    minimize: function (): void {
        ipcRenderer.send(CHANNEL_MINIMIZE);
    },
    isMaximized: function (): boolean {
        return ipcRenderer.sendSync(CHANNEL_IS_MAXIMIZED);
    },
    maximize: function (): void {
        ipcRenderer.send(CHANNEL_MAXIMIZE);
    },
    unMaximize: function (): void {
        ipcRenderer.send(CHANNEL_UNMAXIMIZE);
    },
    close: function (): void {
        ipcRenderer.send(CHANNEL_CLOSE);
    },
    onWindowEvent: function (event: WindowEvent, handler: () => void): Disposable {
        const h = (_event: unknown, evt: WindowEvent) => {
            if (event === evt) {
                handler();
            }
        };
        ipcRenderer.on(CHANNEL_ON_WINDOW_EVENT, h);
        return Disposable.create(() => ipcRenderer.off(CHANNEL_ON_WINDOW_EVENT, h));
    },
    setCloseRequestHandler: function (handler: (stopReason: StopReason) => Promise<boolean>): void {
        ipcRenderer.on(CHANNEL_REQUEST_CLOSE, async (event, stopReason, confirmChannel, cancelChannel) => {
            try {
                if (await handler(stopReason)) {
                    event.sender.send(confirmChannel);
                    return;
                };
            } catch (e) {
                console.warn('exception in close handler ', e);
            }
            event.sender.send(cancelChannel);
        });
    },

    toggleDevTools: function (): void {
        ipcRenderer.send(CHANNEL_TOGGLE_DEVTOOLS);
    },
    getZoomLevel: function (): Promise<number> {
        return ipcRenderer.invoke(CHANNEL_GET_ZOOM_LEVEL);
    },

    setZoomLevel: function (desired: number): void {
        ipcRenderer.send(CHANNEL_SET_ZOOM_LEVEL, desired);
    },
    isFullScreenable: function (): boolean {
        return ipcRenderer.sendSync(CHANNEL_IS_FULL_SCREENABLE);
    },

    isFullScreen: function (): boolean {
        return ipcRenderer.sendSync(CHANNEL_IS_FULL_SCREEN);

    },
    toggleFullScreen: function (): void {
        ipcRenderer.send(CHANNEL_TOGGLE_FULL_SCREEN);
    },

    requestReload: () => ipcRenderer.send(CHANNEL_REQUEST_RELOAD),
    restart: () => ipcRenderer.send(CHANNEL_RESTART),

    applicationStateChanged: state => {
        ipcRenderer.send(CHANNEL_APP_STATE_CHANGED, state);
    },

    readClipboard(): string {
        return ipcRenderer.sendSync(CHANNEL_READ_CLIPBOARD);
    },

    writeClipboard(text): void {
        ipcRenderer.send(CHANNEL_WRITE_CLIPBOARD, text);
    },

    onKeyboardLayoutChanged(handler): Disposable {
        return createDisposableListener(CHANNEL_KEYBOARD_LAYOUT_CHANGED, (event, layout) => { handler(layout as NativeKeyboardLayout); });
    },

    onData: handler => createDisposableListener(CHANNEL_IPC_CONNECTION, (event, data) => { handler(data as Uint8Array); }),

    sendData: data => {
        ipcRenderer.send(CHANNEL_IPC_CONNECTION, data);
    },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDisposableListener(channel: string, handler: (event: any, ...args: unknown[]) => any): Disposable {
    ipcRenderer.on(channel, handler);
    return Disposable.create(() => ipcRenderer.off(channel, handler));
}

export function preload(): void {
    console.log('exposing theia core electron api');
    ipcRenderer.on(CHANNEL_INVOKE_MENU, (_, menuId: number, handlerId: number) => {
        const map = commandHandlers.get(menuId);
        if (map) {
            const handler = map.get(handlerId);
            if (handler) {
                handler();
            }
        }
    });

    contextBridge.exposeInMainWorld('electronTheiaCore', api);
}
