// *****************************************************************************
// Copyright (C) 2022 Arduino SA and others.
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

import { injectable } from 'inversify';
import { app, BrowserWindow, ipcMain, IpcMainEvent, WebContents } from '../../electron-shared/electron';
import { Menu } from '../../electron-shared/electron/index';
import { isOSX } from '../common';
import { MenuItemConstructorOptions } from '../electron-common/menu';
import { CloseContextMenu, ContextMenuDidClose, MenuItemDidClick, SetMenu, ShowContextMenu, UpdateMenuItems } from '../electron-common/messaging/electron-messages';
import { ElectronMainApplicationContribution } from './electron-main-application';

@injectable()
export class ElectronMainMenu implements ElectronMainApplicationContribution {

    /** Keys are the sender IDS, values are the current menu per window. */
    protected menus = new Map<number, Menu | null>();
    /** Keys are sender IDs, values are the open context menus per sender. */
    protected openContextMenus = new Map<number, Map<string, Menu>>();

    onStart(): void {
        ipcMain.on(SetMenu.Signal, (event, params: SetMenu.Params) => this.handleSetMenuSignal(event, params));
        ipcMain.on(UpdateMenuItems.Signal, (event, params: UpdateMenuItems.Params) => this.handleUpdateMenuItemsSignal(event, params));
        ipcMain.on(ShowContextMenu.Signal, (event, params: ShowContextMenu.Params) => this.handleShowContextMenuSignal(event, params));
        ipcMain.on(CloseContextMenu.Signal, (event, params: CloseContextMenu.Params) => this.handleCloseContextMenuSignal(event, params));
        if (isOSX) {
            // OSX: Recreate the menus when changing windows.
            // OSX only has one menu bar for all windows, so we need to swap
            // between them as the user switches windows.
            app.on('browser-window-focus', (event, browserWindow) => {
                const menu = this.menus.get(browserWindow.id);
                if (menu !== undefined) {
                    Menu.setApplicationMenu(menu);
                }
            });
        }
        app.on('browser-window-created', (event, browserWindow) => {
            const { id } = browserWindow;
            browserWindow.once('closed', () => {
                this.menus.delete(id);
                this.openContextMenus.delete(id);
            });
        });
    }

    onStop(): void {
        this.menus.clear();
        this.openContextMenus.clear();
    }

    protected async handleSetMenuSignal(event: IpcMainEvent, params: SetMenu.Params): Promise<void> {
        const { sender } = event;
        const { id } = sender;
        const { template } = params;
        console.debug(SetMenu.Signal, `sender ID: ${id}`);
        const browserWindow = BrowserWindow.fromId(id);
        if (!browserWindow) {
            console.warn(SetMenu.Signal, `Could not find BrowserWindow with ID: <${id}>.`);
            return;
        }
        // eslint-disable-next-line no-null/no-null
        let menu: Menu | null = null;
        if (template) {
            menu = buildFromTemplate(sender, template);
        }
        this.doSetMenu(sender, menu, browserWindow);
    }

    protected async handleUpdateMenuItemsSignal(event: IpcMainEvent, params: UpdateMenuItems.Params): Promise<void> {
        const { sender } = event;
        const { id } = sender;
        const { menuItems } = params;
        console.debug(UpdateMenuItems.Signal, `Sender ID: <${id}>, menu items to update: <${JSON.stringify(menuItems)}>.`);
        const browserWindow = BrowserWindow.fromId(id);
        if (!browserWindow) {
            console.warn(UpdateMenuItems.Signal, `Could not find BrowserWindow with ID: <${id}>.`);
            return;
        }
        const menu = this.menus.get(id);
        if (!menu) {
            console.warn(UpdateMenuItems.Signal, `Could not update menu items toggle state. Sender <${id}> does not have a registered menu.`);
            return;
        }
        for (const { id: menuItemId, checked } of menuItems) {
            const menuItem = menu.getMenuItemById(menuItemId);
            if (menuItem) {
                menuItem.checked = checked;
            }
        }
        this.doSetMenu(sender, menu, browserWindow);
    }

    protected async handleShowContextMenuSignal(event: IpcMainEvent, params: ShowContextMenu.Params): Promise<void> {
        const { sender } = event;
        const { id } = sender;
        const { template, x, y, contextMenuId } = params;
        console.debug(ShowContextMenu.Signal, `Sender ID: <${id}>, context menu ID: <${contextMenuId}>.`);
        const browserWindow = BrowserWindow.fromId(id);
        if (!browserWindow) {
            console.warn(ShowContextMenu.Signal, `Could not find BrowserWindow with ID: <${id}>.`);
            return;
        }
        const contextMenu = buildFromTemplate(sender, template);
        contextMenu.once('menu-will-show', () => this.register(sender, contextMenuId, contextMenu));
        contextMenu.popup({
            window: browserWindow,
            x,
            y,
            callback: () => this.unregister(sender, contextMenuId)
        });
    }

    protected async handleCloseContextMenuSignal(event: IpcMainEvent, params: CloseContextMenu.Params): Promise<void> {
        const { sender } = event;
        const { id } = sender;
        const { contextMenuId } = params;
        console.debug(CloseContextMenu.Signal, `Sender ID: <${id}>, context menu ID: <${contextMenuId}>.`);
        this.unregister(sender, contextMenuId);
    }

    protected register(sender: WebContents, contextMenuId: string, contextMenu: Menu): boolean {
        const { id } = sender;
        console.debug(`>>> Registering open context menu for sender <${id}> with context menu ID: <${contextMenuId}>.`);
        this.dumpOpenContextMenus();
        let contextMenusPerSender = this.openContextMenus.get(id);
        if (!contextMenusPerSender) {
            contextMenusPerSender = new Map<string, Menu>();
            this.openContextMenus.set(id, contextMenusPerSender);
        } else {
            const existingOpenMenu = contextMenusPerSender.get(contextMenuId);
            if (existingOpenMenu) {
                console.warn(`<<< Context menu was already registered for sender <${id}> with context menu ID: <${contextMenuId}>.`);
                return false;
            }
        }
        contextMenusPerSender.set(contextMenuId, contextMenu);
        console.debug(`<<< Registered open context menu for sender <${id}> with context menu ID: <${contextMenuId}>.`);
        this.dumpOpenContextMenus();
        return true;
    }

    protected unregister(sender: WebContents, contextMenuId: string, options?: { silent?: boolean }): boolean {
        const { id } = sender;
        const silent = options?.silent ?? false;
        console.debug(`>>> Removing open context menu for sender <${id}> with context menu ID: <${contextMenuId}>.`);
        this.dumpOpenContextMenus('before unregister');
        const contextMenusPerSender = this.openContextMenus.get(id);
        if (!contextMenusPerSender) {
            console.warn(`Sender <${id}> does not have any opened context menu registered.`);
            return false;
        }
        const contextMenu = contextMenusPerSender.get(contextMenuId);
        if (!contextMenu) {
            // It might happen that a context menu was gracefully closed (eg. user clicked away), but still the renderer request a close on `dispose`.
            if (silent) {
                console.warn(`Sender <${id}> does not have an opened context menu registered with ID <${contextMenuId}>.`);
            }
            return false;
        }
        contextMenusPerSender.delete(contextMenuId);
        const browserWindow = BrowserWindow.fromId(id);
        if (!browserWindow) {
            console.warn(`Could not find browser window for sender <${id}>.`);
            return false;
        }
        contextMenu.closePopup(browserWindow);
        sender.send(ContextMenuDidClose.Signal, { contextMenuId });
        if (!contextMenusPerSender.size) {
            this.openContextMenus.delete(id);
        }
        console.debug(`>>> Removed open context menu for sender <${id}> with context menu ID: <${contextMenuId}>.`);
        this.dumpOpenContextMenus('after unregister');
        return true;
    }

    protected doSetMenu(sender: WebContents, menu: Menu | null, browserWindow: Electron.BrowserWindow): void {
        const { id } = sender;
        this.menus.set(id, menu);
        if (isOSX) {
            Menu.setApplicationMenu(menu);
        } else {
            // Unix/Windows: Set the per-window menus
            browserWindow.setMenu(menu);
        }
    }

    protected dumpOpenContextMenus(message: string = ''): void {
        console.debug(`------- Open context menus ${message ? `[${message}] ` : ''}-------`);
        for (const [id, contextMenusPerSender] of this.openContextMenus.entries()) {
            if (contextMenusPerSender.size) {
                console.debug(`Open context menus for sender <${id}>:`);
            }
            for (const contextMenuId of contextMenusPerSender.keys()) {
                console.debug(` - <${contextMenuId}>`);
            }
        }
        console.debug('----------------------------------');
    }

}

function buildFromTemplate(sender: WebContents, options: MenuItemConstructorOptions[]): Menu {
    const template = options.map(o => MenuItemConstructorOptions.toElectron(o, menuItemClickHandler(sender)));
    return Menu.buildFromTemplate(template);
}

function menuItemClickHandler(sender: WebContents): (params: { commandId: string; args?: unknown[]; }) => () => void {
    return (params: { commandId: string; args?: unknown[]; }) => () => sender.send(MenuItemDidClick.Signal, params);
}
