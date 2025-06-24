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

import { NativeKeyboardLayout } from '../common/keyboard/keyboard-layout-provider';
import { Disposable } from '../common';
import { FrontendApplicationState, StopReason } from '../common/frontend-application-state';
import { ThemeMode } from '../common/theme';

export type MenuRole = ('undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll' | 'about' | 'services' | 'hide' | 'hideOthers' | 'unhide' | 'quit');

export interface MenuDto {
    id?: string,
    label?: string,
    submenu?: MenuDto[],
    type?: ('normal' | 'separator' | 'submenu' | 'checkbox' | 'radio');
    checked?: boolean,
    enabled?: boolean,
    visible?: boolean;
    role?: MenuRole;
    accelerator?: string,
    execute?: () => void
}

export type InternalMenuDto = Omit<MenuDto, 'execute' | 'submenu'> & {
    submenu?: InternalMenuDto[],
    handlerId?: number
};

export type WindowEvent = 'maximize' | 'unmaximize' | 'focus';

export interface TheiaCoreAPI {
    WindowMetadata: {
        webcontentId: string;
    }
    getSecurityToken: () => string;
    attachSecurityToken: (endpoint: string) => Promise<void>;

    setMenuBarVisible(visible: boolean, windowName?: string): void;
    setMenu(menu: MenuDto[] | undefined): void;

    popup(menu: MenuDto[], x: number, y: number, onClosed: () => void, windowName?: string): Promise<number>;
    closePopup(handle: number): void;

    focusWindow(name?: string): void;

    showItemInFolder(fsPath: string): void;

    getPathForFile(file: File): string;

    /**
     * @param location The location to open with the system app. This can be a file path or a URL.
     */
    openWithSystemApp(location: string): void;

    getTitleBarStyleAtStartup(): Promise<string>;
    setTitleBarStyle(style: string): void;
    setBackgroundColor(backgroundColor: string): void;
    setTheme(theme: ThemeMode): void;
    minimize(): void;
    isMaximized(): boolean; // TODO: this should really be async, since it blocks the renderer process
    maximize(): void;
    unMaximize(): void;
    close(): void;
    onWindowEvent(event: WindowEvent, handler: () => void): Disposable;
    onAboutToClose(handler: () => void): Disposable;
    setCloseRequestHandler(handler: (reason: StopReason) => Promise<boolean>): void;

    setOpenUrlHandler(handler: (url: string) => Promise<boolean>): void;

    setSecondaryWindowCloseRequestHandler(windowName: string, handler: () => Promise<boolean>): void;

    toggleDevTools(): void;
    getZoomLevel(): Promise<number>;
    setZoomLevel(desired: number): void;

    isFullScreenable(): boolean; // TODO: this should really be async, since it blocks the renderer process
    isFullScreen(): boolean; // TODO: this should really be async, since it blocks the renderer process
    toggleFullScreen(): void;

    requestReload(newUrl?: string): void;
    restart(): void;

    applicationStateChanged(state: FrontendApplicationState): void;

    readClipboard(): string;
    writeClipboard(text: string): void;

    onKeyboardLayoutChanged(handler: (newLayout: NativeKeyboardLayout) => void): Disposable;

    sendData(data: Uint8Array): void;
    onData(handler: (data: Uint8Array) => void): Disposable;
    useNativeElements: boolean;
}

declare global {
    interface Window {
        electronTheiaCore: TheiaCoreAPI
    }
}

export const CHANNEL_WC_METADATA = 'WebContentMetadata';
export const CHANNEL_SET_MENU = 'SetMenu';
export const CHANNEL_SET_MENU_BAR_VISIBLE = 'SetMenuBarVisible';
export const CHANNEL_INVOKE_MENU = 'InvokeMenu';
export const CHANNEL_OPEN_POPUP = 'OpenPopup';
export const CHANNEL_ON_CLOSE_POPUP = 'OnClosePopup';
export const CHANNEL_CLOSE_POPUP = 'ClosePopup';
export const CHANNEL_GET_SECURITY_TOKEN = 'GetSecurityToken';
export const CHANNEL_FOCUS_WINDOW = 'FocusWindow';
export const CHANNEL_SHOW_OPEN = 'ShowOpenDialog';
export const CHANNEL_SHOW_SAVE = 'ShowSaveDialog';
export const CHANNEL_SHOW_ITEM_IN_FOLDER = 'ShowItemInFolder';
export const CHANNEL_OPEN_WITH_SYSTEM_APP = 'OpenWithSystemApp';
export const CHANNEL_ATTACH_SECURITY_TOKEN = 'AttachSecurityToken';

export const CHANNEL_GET_TITLE_STYLE_AT_STARTUP = 'GetTitleStyleAtStartup';
export const CHANNEL_SET_TITLE_STYLE = 'SetTitleStyle';
export const CHANNEL_SET_BACKGROUND_COLOR = 'SetBackgroundColor';
export const CHANNEL_SET_THEME = 'SetTheme';
export const CHANNEL_CLOSE = 'Close';
export const CHANNEL_MINIMIZE = 'Minimize';
export const CHANNEL_MAXIMIZE = 'Maximize';
export const CHANNEL_IS_MAXIMIZED = 'IsMaximized';

export const CHANNEL_ABOUT_TO_CLOSE = 'AboutToClose';
export const CHANNEL_OPEN_URL = 'OpenUrl';

export const CHANNEL_UNMAXIMIZE = 'UnMaximize';
export const CHANNEL_ON_WINDOW_EVENT = 'OnWindowEvent';
export const CHANNEL_TOGGLE_DEVTOOLS = 'ToggleDevtools';
export const CHANNEL_GET_ZOOM_LEVEL = 'GetZoomLevel';
export const CHANNEL_SET_ZOOM_LEVEL = 'SetZoomLevel';
export const CHANNEL_IS_FULL_SCREENABLE = 'IsFullScreenable';
export const CHANNEL_IS_FULL_SCREEN = 'IsFullScreen';
export const CHANNEL_TOGGLE_FULL_SCREEN = 'ToggleFullScreen';

export const CHANNEL_REQUEST_SECONDARY_CLOSE = 'RequestSecondaryClose';

export const CHANNEL_REQUEST_CLOSE = 'RequestClose';
export const CHANNEL_REQUEST_RELOAD = 'RequestReload';
export const CHANNEL_RESTART = 'Restart';

export const CHANNEL_APP_STATE_CHANGED = 'ApplicationStateChanged';

export const CHANNEL_READ_CLIPBOARD = 'ReadClipboard';
export const CHANNEL_WRITE_CLIPBOARD = 'WriteClipboard';

export const CHANNEL_KEYBOARD_LAYOUT_CHANGED = 'KeyboardLayoutChanged';
export const CHANNEL_IPC_CONNECTION = 'IpcConnection';
