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

import { NewWindowOptions } from '../common/window';
import { Event, Extends, Proxyable, ProxyId } from '../common';
import { MenuDto } from './electron-menu';

export const ElectronWindow = ProxyId<ElectronWindow>('ElectronWindow');
export type ElectronWindow = Extends<$ElectronWindow, Proxyable<$ElectronWindow>>;
interface $ElectronWindow {
    onFocus: Event<void>;
    onMaximize: Event<void>;
    onUnmaximize: Event<void>;
    onMenuClosed: Event<{ menuId: number }>;
    onMenuClicked: Event<{ menuId: number, handlerId: number }>;
    minimize(): void;
    maximize(): void;
    unMaximize(): void;
    isMaximizedSync(): boolean;
    close(): void;
    setMenu(menu?: MenuDto[]): void;
    toggleDevTools(): void;
    getZoomLevel(): Promise<number>;
    setZoomLevel(desired: number): void;
    isFullScreenableSync(): boolean; // TODO: this should really be async, since it blocks the renderer process
    isFullScreenSync(): boolean; // TODO: this should really be async, since it blocks the renderer process
    toggleFullScreen(): void;
    popup(menu: MenuDto[], x: number, y: number): Promise<void>;
    closePopup(menuId: number): void;
    reload(): void;
    getTitleBarStyle(): Promise<string>;
    setTitleBarStyle(style: string): Promise<void>;
    setMenuBarVisible(visible: boolean, windowName?: string): void;
    focusWindow(windowName: string): void;
    openNewWindow(url: string, options?: NewWindowOptions): void;
    openNewDefaultWindow(): void;
}
