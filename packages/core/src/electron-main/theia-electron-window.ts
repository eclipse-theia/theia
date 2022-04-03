// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { FrontendApplicationConfig } from '@theia/application-package';
import { FrontendApplicationState } from '../common/frontend-application-state';
import { APPLICATION_STATE_CHANGE_SIGNAL, CLOSE_REQUESTED_SIGNAL, RELOAD_REQUESTED_SIGNAL, StopReason } from '../electron-common/messaging/electron-messages';
import { BrowserWindow, BrowserWindowConstructorOptions, ipcMain, IpcMainEvent } from '../../electron-shared/electron';
import { inject, injectable, postConstruct } from '../../shared/inversify';
import { ElectronMainApplicationGlobals } from './electron-main-constants';
import { DisposableCollection, Emitter, Event, isWindows, serviceIdentifier } from '../common';
import { createDisposableListener } from './event-utils';

/**
 * Theia tracks the maximized state of Electron Browser Windows.
 */
export interface TheiaBrowserWindowOptions extends BrowserWindowConstructorOptions {
    isMaximized?: boolean;
    isFullScreen?: boolean;
    /**
     * Represents the complete screen layout for all available displays.
     * This field is used to determine if the layout was updated since the electron window was last opened,
     * in which case we want to invalidate the stored options and use the default options instead.
     */
    screenLayout?: string;
}

export const TheiaBrowserWindowOptions = Symbol('TheiaBrowserWindowOptions');

export const WindowApplicationConfig = Symbol('WindowApplicationConfig');
export type WindowApplicationConfig = FrontendApplicationConfig;

@injectable()
export class TheiaElectronWindow {
    @inject(TheiaBrowserWindowOptions) protected readonly options: TheiaBrowserWindowOptions;
    @inject(WindowApplicationConfig) protected readonly config: WindowApplicationConfig;
    @inject(ElectronMainApplicationGlobals) protected readonly globals: ElectronMainApplicationGlobals;

    protected onDidCloseEmitter = new Emitter<void>();

    get onDidClose(): Event<void> {
        return this.onDidCloseEmitter.event;
    }

    protected readonly toDispose = new DisposableCollection(this.onDidCloseEmitter);

    protected _window: BrowserWindow;
    get window(): BrowserWindow {
        return this._window;
    }

    protected closeIsConfirmed = false;
    protected applicationState: FrontendApplicationState = 'init';

    @postConstruct()
    protected init(): void {
        this._window = new BrowserWindow(this.options);
        this._window.setMenuBarVisibility(false);
        this.attachReadyToShow();
        this.restoreMaximizedState();
        this.attachCloseListeners();
        this.trackApplicationState();
        this.attachReloadListener();
    }

    /**
     * Only show the window when the content is ready.
     */
    protected attachReadyToShow(): void {
        this._window.once('ready-to-show', () => this._window.show());
    }

    protected attachCloseListeners(): void {
        createDisposableListener<Electron.Event>(this._window, 'closed', () => {
            this.onDidCloseEmitter.fire();
            this.dispose();
        }, this.toDispose);
        createDisposableListener<Electron.Event>(this._window, 'close', async event => {
            // User has already indicated that it is OK to close this window, or the window is being closed before it's ready.
            if (this.closeIsConfirmed || this.applicationState !== 'ready') {
                return;
            }
            event.preventDefault();
            this.handleStopRequest(() => this.doCloseWindow(), StopReason.Close);
        }, this.toDispose);
    }

    protected doCloseWindow(): void {
        this.closeIsConfirmed = true;
        this._window.close();
    }

    close(reason: StopReason = StopReason.Close): Promise<boolean> {
        return this.handleStopRequest(() => this.doCloseWindow(), reason);
    }

    protected reload(): void {
        this.handleStopRequest(() => {
            this.applicationState = 'init';
            this._window.reload();
        }, StopReason.Reload);
    }

    protected async handleStopRequest(onSafeCallback: () => unknown, reason: StopReason): Promise<boolean> {
        // Only confirm close to windows that have loaded our front end.
        let currentUrl = this.window.webContents.getURL();
        let frontendUri = this.globals.THEIA_FRONTEND_HTML_PATH;
        // Since our resolved frontend HTML path might contain backward slashes on Windows, we normalize everything first.
        if (isWindows) {
            currentUrl = currentUrl.replace(/\\/g, '/');
            frontendUri = frontendUri.replace(/\\/g, '/');
        }
        const safeToClose = !currentUrl.includes(frontendUri) || await this.checkSafeToStop(reason);
        if (safeToClose) {
            try {
                await onSafeCallback();
                return true;
            } catch (e) {
                console.warn(`Request ${StopReason[reason]} failed.`, e);
            }
        }
        return false;
    }

    protected checkSafeToStop(reason: StopReason): Promise<boolean> {
        const confirmChannel = `safe-to-close-${this._window.id}`;
        const cancelChannel = `notSafeToClose-${this._window.id}`;
        const temporaryDisposables = new DisposableCollection();
        return new Promise<boolean>(resolve => {
            this._window.webContents.send(CLOSE_REQUESTED_SIGNAL, { confirmChannel, cancelChannel, reason });
            createDisposableListener(ipcMain, confirmChannel, (e: IpcMainEvent) => {
                if (this.isSender(e)) {
                    resolve(true);
                }
            }, temporaryDisposables);
            createDisposableListener(ipcMain, cancelChannel, (e: IpcMainEvent) => {
                if (this.isSender(e)) {
                    resolve(false);
                }
            }, temporaryDisposables);
        }).finally(() => temporaryDisposables.dispose());
    }

    protected restoreMaximizedState(): void {
        if (this.options.isMaximized) {
            this._window.maximize();
        } else {
            this._window.unmaximize();
        }
    }

    protected trackApplicationState(): void {
        createDisposableListener(ipcMain, APPLICATION_STATE_CHANGE_SIGNAL, (e: IpcMainEvent, state: FrontendApplicationState) => {
            if (this.isSender(e)) {
                this.applicationState = state;
            }
        }, this.toDispose);
    }

    protected attachReloadListener(): void {
        createDisposableListener(ipcMain, RELOAD_REQUESTED_SIGNAL, (e: IpcMainEvent) => {
            if (this.isSender(e)) {
                this.reload();
            }
        }, this.toDispose);
    }

    protected isSender(e: IpcMainEvent): boolean {
        return BrowserWindow.fromId(e.sender.id) === this._window;
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}

export const TheiaElectronWindowFactory = serviceIdentifier<TheiaElectronWindowFactory>('TheiaElectronWindowFactory');
export interface TheiaElectronWindowFactory {
    (options: TheiaBrowserWindowOptions, config: FrontendApplicationConfig): TheiaElectronWindow;
}
