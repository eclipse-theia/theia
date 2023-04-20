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

import { inject, injectable, postConstruct } from 'inversify';
import { ElectronCurrentWindow, ELECTRON_CURRENT_WINDOW_IPC as ipc, IpcEvent, MenuDto, proxy, proxyable, TheiaIpcRenderer } from '../electron-common';
import { InternalMenuDto } from '../electron-common/electron-menu';

type MenuId = number;
type HandlerId = number;

const MAIN_MENU_ID = 0;

@injectable() @proxyable()
export class ElectronCurrentWindowImpl implements ElectronCurrentWindow {

    @proxy() onFocus: IpcEvent<void>;
    @proxy() onMaximize: IpcEvent<void>;
    @proxy() onUnmaximize: IpcEvent<void>;

    protected commandHandlers = new Map<MenuId, Map<HandlerId, () => void>>();
    protected menuId = MAIN_MENU_ID + 1;
    protected handlerId = 0;

    @inject(TheiaIpcRenderer)
    protected ipcRenderer: TheiaIpcRenderer;

    @postConstruct()
    protected postConstruct(): void {
        this.onFocus = this.ipcRenderer.createEvent(ipc.onFocus);
        this.onMaximize = this.ipcRenderer.createEvent(ipc.onMaximize);
        this.onUnmaximize = this.ipcRenderer.createEvent(ipc.onUnmaximize);
    }

    @proxy() isMaximized(): boolean {
        return this.ipcRenderer.sendSync(ipc.isMaximized);
    }

    @proxy() minimize(): void {
        this.ipcRenderer.send(ipc.minimize);
    }

    @proxy() maximize(): void {
        this.ipcRenderer.send(ipc.maximize);
    }

    @proxy() unMaximize(): void {
        this.ipcRenderer.send(ipc.unmaximize);
    }

    @proxy() close(): void {
        this.ipcRenderer.send(ipc.close);
    }

    @proxy() setMenuBarVisible(visible: boolean, windowName?: string): void {
        this.ipcRenderer.send(ipc.setMenuBarVisible, visible, windowName);
    }

    @proxy() setMenu(menu?: MenuDto[]): void {
        const handlers = new Map<number, () => void>();
        this.commandHandlers.set(MAIN_MENU_ID, handlers);
        this.ipcRenderer.send(ipc.setMenu, MAIN_MENU_ID, this.convertMenu(menu, handlers));
    }

    @proxy() toggleDevTools(): void {
        this.ipcRenderer.send(ipc.toggleDevTools);
    }

    @proxy() getZoomLevel(): Promise<number> {
        return this.ipcRenderer.invoke(ipc.getZoomLevel);
    }

    @proxy() setZoomLevel(desired: number): void {
        this.ipcRenderer.send(ipc.setZoomLevel, desired);
    }

    @proxy() isFullScreenable(): boolean {
        return this.ipcRenderer.sendSync(ipc.isFullScreenable);
    }

    @proxy() isFullScreen(): boolean {
        return this.ipcRenderer.sendSync(ipc.isFullScreen);
    }

    @proxy() toggleFullScreen(): void {
        this.ipcRenderer.send(ipc.toggleFullScreen);
    }

    @proxy() async popup(menu: MenuDto[], x: number, y: number, onClosed: () => void): Promise<number> {
        const menuId = this.menuId++;
        const handlers = new Map<HandlerId, () => void>();
        this.commandHandlers.set(menuId, handlers);
        const handle = await this.ipcRenderer.invoke(ipc.openPopup, menuId, this.convertMenu(menu, handlers)!, x, y);
        const closeListener = () => {
            this.ipcRenderer.removeListener(ipc.onPopupClosed, closeListener);
            this.commandHandlers.delete(menuId);
            onClosed();
        };
        this.ipcRenderer.on(ipc.onPopupClosed, closeListener);
        return handle;
    }

    @proxy() closePopup(handle: number): void {
        this.ipcRenderer.send(ipc.closePopup, handle);
    }

    @proxy() reload(): void {
        this.ipcRenderer.send(ipc.reload);
    }

    @proxy() async getTitleBarStyle(): Promise<string> {
        return this.ipcRenderer.invoke(ipc.getTitleBarStyle);
    }

    @proxy() async setTitleBarStyle(style: string): Promise<void> {
        await this.ipcRenderer.invoke(ipc.setTitleBarStyle, style);
    }

    protected convertMenu(menu: MenuDto[] | undefined, handlerMap: Map<HandlerId, () => void>): InternalMenuDto[] | undefined {
        if (!menu) {
            return;
        }
        return menu.map(item => {
            let handlerId;
            if (item.execute) {
                handlerId = this.handlerId++;
                handlerMap.set(handlerId, item.execute);
            }
            return {
                id: item.id,
                submenu: this.convertMenu(item.submenu, handlerMap),
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
}
