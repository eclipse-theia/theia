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
import { isOSX, RpcContext, RpcEvent, RpcServer } from '../common';
import { ElectronCurrentWindow } from '../electron-common';
import { InternalMenuDto, MenuDto } from '../electron-common/electron-menu';
import { ElectronMainApplication } from './electron-main-application';
import { SenderWebContents } from './electron-main-rpc-context';

type MenuId = number;

@injectable()
export class ElectronCurrentWindowMain implements RpcServer<ElectronCurrentWindow> {

    protected menuId = 1;
    protected openPopups = new Map<MenuId, Menu>();

    @inject(RpcEvent) $onFocus: RpcEvent<void>;
    @inject(RpcEvent) $onMaximize: RpcEvent<void>;
    @inject(RpcEvent) $onUnmaximize: RpcEvent<void>;
    @inject(RpcEvent) $onMenuClosed: RpcEvent<{ menuId: number }>;
    @inject(RpcEvent) $onMenuClicked: RpcEvent<{ menuId: number, handlerId: number }>;

    @inject(ElectronMainApplication)
    protected application: ElectronMainApplication;

    $isMaximizedSync(ctx: RpcContext): boolean {
        return this.getBrowserWindow(ctx).isMaximized();
    }

    $setMenu(ctx: RpcContext, menu?: MenuDto[]): void {
        let electronMenu: Menu | null;
        if (menu) {
            electronMenu = Menu.buildFromTemplate(this.fromMenuDto(ctx, this.menuId++, menu));
        } else {
            // eslint-disable-next-line no-null/no-null
            electronMenu = null;
        }
        if (isOSX) {
            Menu.setApplicationMenu(electronMenu);
        } else {
            this.getBrowserWindow(ctx).setMenu(electronMenu);
        }
    }

    async $popup(ctx: RpcContext, menu: MenuDto[], x: number, y: number): Promise<void> {
        const menuId = this.menuId++;
        const zoom = this.getWebContents(ctx).getZoomFactor();
        // TODO: Remove the offset once Electron fixes https://github.com/electron/electron/issues/31641
        const offset = process.platform === 'win32' ? 0 : 2;
        // x and y values must be Ints or else there is a conversion error
        x = Math.round(x * zoom) + offset;
        y = Math.round(y * zoom) + offset;
        const popup = Menu.buildFromTemplate(this.fromMenuDto(ctx, menuId, menu));
        this.openPopups.set(menuId, popup);
        return new Promise(resolve => {
            popup.popup({
                callback: () => {
                    this.openPopups.delete(menuId);
                    resolve();
                }
            });
        });
    }

    $closePopup(ctx: RpcContext, menuId: MenuId): void {
        this.openPopups.get(menuId)?.closePopup();
    }

    $minimize(ctx: RpcContext): void {
        this.getBrowserWindow(ctx).minimize();
    }

    $maximize(ctx: RpcContext): void {
        this.getBrowserWindow(ctx).maximize();
    }

    $unMaximize(ctx: RpcContext): void {
        this.getBrowserWindow(ctx).unmaximize();
    }

    $close(ctx: RpcContext): void {
        this.getBrowserWindow(ctx).close();
    }

    $toggleDevTools(ctx: RpcContext): void {
        this.getWebContents(ctx).toggleDevTools();
    }

    async $getZoomLevel(ctx: RpcContext): Promise<number> {
        return this.getWebContents(ctx).getZoomLevel();
    }

    $setZoomLevel(ctx: RpcContext, desired: number): void {
        this.getWebContents(ctx).setZoomLevel(desired);
    }

    $isFullScreenableSync(ctx: RpcContext): boolean {
        return this.getBrowserWindow(ctx).isFullScreenable();
    }

    $isFullScreenSync(ctx: RpcContext): boolean {
        return this.getBrowserWindow(ctx).isFullScreen();
    }

    $toggleFullScreen(ctx: RpcContext): void {
        const browserWindow = this.getBrowserWindow(ctx);
        browserWindow.fullScreen = !browserWindow.fullScreen;
    }

    $reload(ctx: RpcContext): void {
        this.application.getTheiaElectronWindow(this.getWebContents(ctx).id)?.reload();
    }

    async $getTitleBarStyle(ctx: RpcContext): Promise<string> {
        return this.application.getTitleBarStyleAtStartup(this.getWebContents(ctx));
    }

    async $setTitleBarStyle(ctx: RpcContext, style: string): Promise<void> {
        this.application.setTitleBarStyle(this.getWebContents(ctx), style);
    }

    protected fromMenuDto(ctx: RpcContext, menuId: MenuId, menuDto: InternalMenuDto[]): MenuItemConstructorOptions[] {
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
                result.submenu = this.fromMenuDto(ctx, menuId, dto.submenu);
            }
            if (dto.handlerId) {
                result.click = () => {
                    this.$onMenuClicked.emit(ctx.toSender({ menuId, handlerId: dto.handlerId! }));
                };
            }
            return result;
        });
    }

    protected getWebContents(ctx: RpcContext): WebContents {
        return ctx.require(SenderWebContents);
    }

    protected getBrowserWindow(ctx: RpcContext): BrowserWindow {
        const webContents = this.getWebContents(ctx);
        const browserWindow = BrowserWindow.fromWebContents(webContents);
        if (!browserWindow) {
            throw new Error(`No browser window found for webContents: ${webContents.id}`);
        }
        return browserWindow;
    }
}
