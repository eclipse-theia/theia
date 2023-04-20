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

import { BrowserWindow, Menu, MenuItemConstructorOptions, WebContents } from '@theia/electron/shared/electron';
import { inject, injectable } from 'inversify';
import { isOSX } from '../common';
import { ELECTRON_CURRENT_WINDOW_IPC as ipc, TheiaIpcMain, TheiaIpcMainEvent, TheiaIpcMainInvokeEvent } from '../electron-common';
import { InternalMenuDto, MenuDto } from '../electron-common/electron-menu';
import { ElectronMainApplication, ElectronMainApplicationContribution } from './electron-main-application';

type MenuId = number;

@injectable()
export class ElectronCurrentWindowMain implements ElectronMainApplicationContribution {

    protected application: ElectronMainApplication;
    protected openPopups = new Map<MenuId, Menu>();

    @inject(TheiaIpcMain)
    protected ipcMain: TheiaIpcMain;

    onStart(application: ElectronMainApplication): void {
        this.application = application;
        this.ipcMain.on(ipc.isMaximized, this.onIsMaximized, this);
        this.ipcMain.on(ipc.setMenu, this.onSetMenu, this);
        this.ipcMain.handle(ipc.openPopup, this.onOpenPopup, this);
        this.ipcMain.handle(ipc.closePopup, this.handleClosePopup, this);
        this.ipcMain.on(ipc.minimize, this.onMinimize, this);
        this.ipcMain.on(ipc.maximize, this.onMaximize, this);
        this.ipcMain.on(ipc.unmaximize, this.onUnmaxize, this);
        this.ipcMain.on(ipc.close, this.onClose, this);
        this.ipcMain.on(ipc.toggleDevTools, this.onToggleDevTools, this);
        this.ipcMain.handle(ipc.getZoomLevel, this.handleGetZoomLevel, this);
        this.ipcMain.on(ipc.setZoomLevel, this.onSetZoomLevel, this);
        this.ipcMain.on(ipc.isFullScreenable, this.onIsFullScreenable, this);
        this.ipcMain.on(ipc.isFullScreen, this.onIsFullScreen, this);
        this.ipcMain.on(ipc.toggleFullScreen, this.onToggleFullScreen, this);
        this.ipcMain.on(ipc.reload, this.onReload, this);
        this.ipcMain.handle(ipc.getTitleBarStyle, this.handleGetTitleBarStyle, this);
        this.ipcMain.handle(ipc.setTitleBarStyle, this.handleSetTitleBarStyle, this);
    }

    protected onIsMaximized(event: TheiaIpcMainEvent): boolean {
        return BrowserWindow.fromWebContents(event.sender)!.isMaximized();
    }

    protected onSetMenu(event: TheiaIpcMainEvent, menuId: MenuId, menu?: MenuDto[]): void {
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
            BrowserWindow.fromWebContents(event.sender)!.setMenu(electronMenu);
        }
    }

    protected async onOpenPopup(event: TheiaIpcMainEvent, menuId: MenuId, menu: MenuDto[], x: number, y: number): Promise<number> {
        const zoom = event.sender.getZoomFactor();
        // TODO: Remove the offset once Electron fixes https://github.com/electron/electron/issues/31641
        const offset = process.platform === 'win32' ? 0 : 2;
        // x and y values must be Ints or else there is a conversion error
        x = Math.round(x * zoom) + offset;
        y = Math.round(y * zoom) + offset;
        const popup = Menu.buildFromTemplate(this.fromMenuDto(event.sender, menuId, menu));
        this.openPopups.set(menuId, popup);
        popup.popup({
            callback: () => {
                this.openPopups.delete(menuId);
                this.ipcMain.sendTo(event.sender, ipc.onPopupClosed, menuId);
            }
        });
        return -1;
    }

    protected handleClosePopup(event: TheiaIpcMainInvokeEvent, menuId: MenuId): void {
        this.openPopups.get(menuId)?.closePopup();
    }

    protected onMinimize(event: TheiaIpcMainEvent): void {
        BrowserWindow.fromWebContents(event.sender)?.minimize();
    }

    protected onMaximize(event: TheiaIpcMainEvent): void {
        BrowserWindow.fromWebContents(event.sender)!.maximize();
    }

    protected onUnmaxize(event: TheiaIpcMainEvent): void {
        BrowserWindow.fromWebContents(event.sender)!.unmaximize();
    }

    protected onClose(event: TheiaIpcMainEvent): void {
        BrowserWindow.fromWebContents(event.sender)!.close();
    }

    protected onToggleDevTools(event: TheiaIpcMainEvent): void {
        event.sender.toggleDevTools();
    }

    protected async handleGetZoomLevel(event: TheiaIpcMainInvokeEvent): Promise<number> {
        return event.sender.getZoomLevel();
    }

    protected onSetZoomLevel(event: TheiaIpcMainEvent, desired: number): void {
        event.sender.setZoomLevel(desired);
    }

    protected onIsFullScreenable(event: TheiaIpcMainEvent): boolean {
        return BrowserWindow.fromWebContents(event.sender)!.isFullScreenable();
    }

    protected onIsFullScreen(event: TheiaIpcMainEvent): boolean {
        return BrowserWindow.fromWebContents(event.sender)!.isFullScreen();
    }

    protected onToggleFullScreen(event: TheiaIpcMainEvent): void {
        const browserWindow = BrowserWindow.fromWebContents(event.sender)!;
        // browserWindow.fullScreen = !browserWindow.fullScreen; // ?
        browserWindow.setFullScreen(!browserWindow.isFullScreen());
    }

    protected onReload(event: TheiaIpcMainEvent): void {
        this.application.getTheiaElectronWindow(event.sender.id)?.reload();
    }

    protected async handleGetTitleBarStyle(event: TheiaIpcMainInvokeEvent): Promise<string> {
        return this.application.getTitleBarStyleAtStartup(event.sender);
    }

    protected async handleSetTitleBarStyle(event: TheiaIpcMainInvokeEvent, style: string): Promise<void> {
        this.application.setTitleBarStyle(event.sender, style);
    }

    protected fromMenuDto(sender: WebContents, menuId: MenuId, menuDto: InternalMenuDto[]): MenuItemConstructorOptions[] {
        return menuDto.map(dto => {
            const result: MenuItemConstructorOptions = {
                id: dto.id,
                label: dto.label,
                type: dto.type,
                checked: dto.checked,
                enabled: dto.enabled,
                visible: dto.visible,
                role: dto.role,
                accelerator: dto.accelerator
            };
            if (dto.submenu) {
                result.submenu = this.fromMenuDto(sender, menuId, dto.submenu);
            }
            if (dto.handlerId) {
                result.click = () => {
                    this.ipcMain.sendTo(sender, ipc.onInvokeMenu, menuId, dto.handlerId);
                };
            }
            return result;
        });
    }
}
