/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import * as electron from 'electron';
import * as nativeKeymap from 'native-keymap';
import ElectronStorage = require('electron-store');
import { injectable, inject, named } from 'inversify';
import { ContributionProvider, MaybePromise } from '../common';
import { Deferred } from '../common/promise-util';
import { fork } from 'child_process';

export const ElectronMainApplicationContribution = Symbol('ElectronMainApplicationContribution');
export interface ElectronMainApplicationContribution {

    onStart?(app: Electron.App): MaybePromise<void>;

    /**
     * Will wait for both the electron `ready` event, and all contributions to
     * finish executing `onStart`.
     *
     * @param infos https://electronjs.org/docs/api/app#event-ready.
     */
    // tslint:disable-next-line:no-any
    onReady?(infos?: any): MaybePromise<void>;

    onNewWindow?(newWindow: electron.BrowserWindow): MaybePromise<void>;

    onBeforeQuit?(event: electron.Event): void;

    onQuit?(event: electron.Event, exitCode: number): void;
}

export interface ElectronBrowserWindowOptions extends electron.BrowserWindowConstructorOptions {
    isMaximized?: boolean,
}

const WindowState = 'windowstate';
interface WindowState {
    isMaximized?: boolean
    height: number
    width: number
    x: number
    y: number
}
export interface ElectronMainApplicationStorage {
    [WindowState]: WindowState;
}

export const TheiaApplicationName = Symbol('TheiaApplicationName');
export type TheiaApplicationName = string;

export const TheiaBackendMainPath = Symbol('TheiaBackendMainPath');
export type TheiaBackendMainPath = string;

export const TheiaIndexHtmlPath = Symbol('TheiaIndexHtmlPath');
export type TheiaIndexHtmlPath = string;

@injectable()
export class ElectronMainApplication {

    @inject(TheiaApplicationName)
    protected readonly applicationName: TheiaApplicationName;

    @inject(TheiaBackendMainPath)
    protected readonly mainPath: TheiaBackendMainPath;

    @inject(TheiaIndexHtmlPath)
    protected readonly indexHtml: TheiaIndexHtmlPath;

    @inject(ContributionProvider) @named(ElectronMainApplicationContribution)
    protected readonly contributions: ContributionProvider<ElectronMainApplicationContribution>;

    // tslint:disable-next-line:no-any
    protected readonly storage = new ElectronStorage<ElectronMainApplicationStorage>();

    protected readonly backendPortDeferred = new Deferred<number>();
    /**
     * Set when the NodeJS backend has started and dispatched the port it is running on.
     */
    protected readonly backendPort = this.backendPortDeferred.promise;

    async start(app: electron.App): Promise<void> {
        await this.bindApplicationEvents(app);
        this.startBackend(app); // no await here, let it be concurrent.
        try {
            await Promise.all(this.contributions.getContributions()
                .map(contribution => contribution.onStart && contribution.onStart(app)));
        } catch (error) {
            console.error(error);
            app.exit(1);
            return;
        }
        this.ready(app);
    }

    protected async ready(app: electron.App): Promise<void> {
        const infos = await app.whenReady();
        this.bindIpcEvents();
        await this.setTempMenu();
        await Promise.all(this.contributions.getContributions()
            .map(contribution => contribution.onReady && contribution.onReady(infos)));
        await this.openWindow();
    }

    protected canPreventStop = true;
    protected async beforeQuit(event: electron.Event): Promise<void> {
        if (this.canPreventStop) {
            // Pause the stop.
            event.preventDefault();
            let preventStop = false;
            // Ask all opened windows whether they want to prevent the \`close\` event or not.
            for (const window of electron.BrowserWindow.getAllWindows()) {
                if (!preventStop) {
                    window.webContents.send('prevent-stop-request');
                    const preventStopPerWindow = await new Promise(resolve => {
                        // tslint:disable-next-line:no-any
                        electron.ipcMain.once('prevent-stop-response', (_: electron.Event, arg: any) => {
                            if (!!arg && 'preventStop' in arg && typeof arg.preventStop === 'boolean') {
                                resolve(arg.preventStop);
                            }
                        });
                    });
                    if (preventStopPerWindow) {
                        preventStop = true;
                    }
                }
            }
            if (!preventStop) {
                this.canPreventStop = false;
                electron.app.quit();
            }
        }
        this.contributions.getContributions()
            .map(contribution => contribution.onBeforeQuit && contribution.onBeforeQuit(event));
    }

    protected quit(event: electron.Event, exitCode: number): void {
        this.contributions.getContributions()
            .map(contribution => contribution.onQuit && contribution.onQuit(event, exitCode));
    }

    protected bindApplicationEvents(app: electron.App): MaybePromise<void> {
        app.on('activate', (event, hasVisibleWindows) => this.activate(event, hasVisibleWindows));
        app.on('window-all-closed', () => this.windowAllClosed(app));
        app.on('before-quit', event => this.beforeQuit(event));
        app.on('quit', (event, exitCode) => this.quit(event, exitCode));
    }

    protected bindIpcEvents(): void {
        electron.ipcMain.on('create-new-window',
            (event: electron.IpcMessageEvent, url?: string) => this.createNewWindow(url));
        electron.ipcMain.on('open-external',
            (event: electron.IpcMessageEvent, url?: string) => url && this.openExternally(url));
    }

    protected activate(event: electron.Event, hasVisibleWindows: boolean): MaybePromise<void> {
        if (electron.BrowserWindow.getAllWindows().length === 0) {
            this.openWindow();
        }
    }

    protected async startBackend(app: electron.App): Promise<void> {
        const devMode = process.defaultApp || /node_modules[\/]electron[\/]/.test(process.execPath);
        try {
            await (devMode
                ? this.requireBackend(app)
                : this.forkBackend(app));
        } catch (error) {
            console.error(error);
            app.exit(1);
        }
    }

    /**
     * In development mode, it is easier to run the backend as part of the main process.
     *
     * @param app
     */
    protected async requireBackend(app: electron.App): Promise<number> {
        // tslint:disable-next-line:no-any
        require(this.mainPath).then((address: any) => {
            this.backendPortDeferred.resolve(address.port);
        }).catch((error: Error) => {
            this.backendPortDeferred.reject(error);
        });
        return this.backendPort;
    }

    /**
     * In production mode, the backend gets its own process.
     *
     * @param app
     */
    protected async forkBackend(app: electron.App): Promise<number> {
        const backendProcess = fork(this.mainPath);
        backendProcess.on('error', error => {
            this.backendPortDeferred.reject(error);
        });
        backendProcess.on('message', message => {
            const port = Number.parseInt(message, 10);
            if (!isNaN(port)) {
                this.backendPortDeferred.resolve(port);
            }
        });
        app.on('quit', () => {
            process.kill(backendProcess.pid);
        });
        return this.backendPort;
    }

    /**
     * @todo Allow user to open windows when none is left.
     *
     * Usually, Mac application don't stop when there isn't more windows.
     * But we will skip that platform check for now, until we support opening
     * new windows when none were left.
     */
    protected windowAllClosed(app: electron.App): MaybePromise<void> {
        app.quit();
    }

    protected async openWindow(): Promise<electron.BrowserWindow> {
        const backendPort = await this.backendPort;
        return this.createNewWindow(`file://${this.indexHtml}?port=${backendPort}`);
    }

    protected async createNewWindow(url?: string): Promise<electron.BrowserWindow> {
        const windowOptions: ElectronBrowserWindowOptions = {
            show: false,
            ...await this.getWindowOptions(url),
        };

        // Always hide the window, we will show the window when it is ready to be shown in any case.
        const newWindow = new electron.BrowserWindow(windowOptions);
        if (windowOptions.isMaximized) {
            newWindow.maximize();
        }
        newWindow.on('ready-to-show', () => newWindow.show());

        await this.bindWindowEvents(newWindow);

        if (url) {
            newWindow.loadURL(url);
        }

        await Promise.all(this.contributions.getContributions()
            .map(contribution => contribution.onNewWindow && contribution.onNewWindow(newWindow)));

        return newWindow;
    }

    protected bindWindowEvents(electronWindow: electron.BrowserWindow): MaybePromise<void> {

        // Prevent calls to "window.open" from opening an ElectronBrowser window,
        // and rather open in the OS default web browser.
        electronWindow.webContents.on('new-window', (event, url) => {
            event.preventDefault();
            electron.shell.openExternal(url);
        });

        // Notify the renderer process on keyboard layout change
        nativeKeymap.onDidChangeKeyboardLayout(() => {
            if (!electronWindow.isDestroyed()) {
                const newLayout = {
                    info: nativeKeymap.getCurrentKeyboardLayout(),
                    mapping: nativeKeymap.getKeyMap()
                };
                electronWindow.webContents.send('keyboardLayoutChanged', newLayout);
            }
        });

        const saveWindowState = () => {
            try {
                let bounds: electron.Rectangle;
                if (electronWindow.isMaximized()) {
                    bounds = this.storage.get(WindowState, {} as WindowState);
                } else {
                    bounds = electronWindow.getBounds();
                }
                this.storage.set(WindowState, {
                    isMaximized: electronWindow.isMaximized(),
                    width: bounds.width,
                    height: bounds.height,
                    x: bounds.x,
                    y: bounds.y
                });
            } catch (e) {
                console.error('Error while saving window state.', e);
            }
        };
        // tslint:disable-next-line:no-any
        let delayedSaveTimeout: any;
        const saveWindowStateDelayed = () => {
            if (delayedSaveTimeout) {
                clearTimeout(delayedSaveTimeout);
            }
            delayedSaveTimeout = setTimeout(saveWindowState, 1000);
        };
        electronWindow.on('close', saveWindowState);
        electronWindow.on('resize', saveWindowStateDelayed);
        electronWindow.on('move', saveWindowStateDelayed);
    }

    protected getWindowOptions(url?: string): MaybePromise<ElectronBrowserWindowOptions> {
        // We must center by hand because \`browserWindow.center()\` fails on multi-screen setups
        // See: https://github.com/electron/electron/issues/3490
        const { bounds } = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint());
        const height = Math.floor(bounds.height * (2 / 3));
        const width = Math.floor(bounds.width * (2 / 3));

        const y = Math.floor(bounds.y + (bounds.height - height) / 2);
        const x = Math.floor(bounds.x + (bounds.width - width) / 2);

        const windowState = this.storage.get(WindowState, {
            width, height, x, y,
        });

        return {
            show: false,
            title: this.applicationName,
            width: windowState.width,
            height: windowState.height,
            minWidth: 200,
            minHeight: 120,
            x: windowState.x,
            y: windowState.y,
            isMaximized: windowState.isMaximized
        };
    }

    protected openExternally(url: string): MaybePromise<void> {
        electron.shell.openExternal(url);
    }

    /**
     * Remove the default electron menus, waiting for the application to set its own.
     */
    protected setTempMenu(): MaybePromise<void> {
        electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate([{
            role: 'help', submenu: [{ role: 'toggledevtools' }]
        }]));
    }

}
