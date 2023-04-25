// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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
// *****************************************************************************

import { MenuDto } from './electron-menu';
import { createIpcNamespace, IpcEvent } from './electron-ipc';
import { preloadServiceIdentifier } from './preload';

export const ELECTRON_CURRENT_WINDOW_IPC = createIpcNamespace('theia-electron-current-window', channel => ({
    onFocus: channel<() => void>(),
    onMaximize: channel<() => void>(),
    onUnmaximize: channel<() => void>(),
    isMaximized: channel<() => boolean>(),
    minimize: channel<() => void>(),
    maximize: channel<() => void>(),
    unmaximize: channel<() => void>(),
    close: channel<() => void>(),
    setMenuBarVisible: channel<(visible: boolean, windowName?: string) => void>(),
    setMenu: channel<(menuId: number, menu?: MenuDto[]) => void>(),
    onInvokeMenu: channel<(menuId: number, handlerId?: number) => void>(),
    toggleDevTools: channel<() => void>(),
    getZoomLevel: channel<() => Promise<number>>(),
    setZoomLevel: channel<(desired: number) => void>(),
    isFullScreenable: channel<() => boolean>(),
    isFullScreen: channel<() => boolean>(),
    toggleFullScreen: channel<() => void>(),
    openPopup: channel<(menuId: number, menu: MenuDto[], x: number, y: number) => Promise<number>>(),
    closePopup: channel<(handle: number) => void>(),
    onPopupClosed: channel<(menuId: number) => void>(),
    reload: channel<() => void>(),
    getTitleBarStyle: channel<() => Promise<string>>(),
    setTitleBarStyle: channel<(style: string) => Promise<void>>()
}));

export const ElectronCurrentWindow = preloadServiceIdentifier<ElectronCurrentWindow>('ElectronCurrentWindow');
export interface ElectronCurrentWindow {
    onFocus: IpcEvent<void>
    onMaximize: IpcEvent<void>
    onUnmaximize: IpcEvent<void>
    isMaximized(): boolean
    minimize(): void
    maximize(): void
    unMaximize(): void
    close(): void
    setMenu(menu?: MenuDto[]): void
    toggleDevTools(): void
    getZoomLevel(): Promise<number>
    setZoomLevel(desired: number): void
    isFullScreenable(): boolean // TODO: this should really be async, since it blocks the renderer process
    isFullScreen(): boolean // TODO: this should really be async, since it blocks the renderer process
    toggleFullScreen(): void
    popup(menu: MenuDto[], x: number, y: number, onClosed: () => void): Promise<number>
    closePopup(handle: number): void
    reload(): void
    getTitleBarStyle(): Promise<string>
    setTitleBarStyle(style: string): Promise<void>
}
