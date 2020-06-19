/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { MaybePromise } from '@theia/core/lib/common/types';
import URI from '@theia/core/lib/common/uri';
import { ElectronSecurityToken } from '@theia/core/lib/electron-common/electron-token';
import { fork, ForkOptions } from 'child_process';
import * as electron from 'electron';
import { app, BrowserWindow, BrowserWindowConstructorOptions, Event as ElectronEvent, shell, dialog } from 'electron';
import { realpathSync } from 'fs';
import { inject, injectable, named } from 'inversify';
import { AddressInfo } from 'net';
import * as path from 'path';
import { Argv } from 'yargs';
import { FileUri } from '@theia/core/lib/node';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { FrontendApplicationConfig } from '@theia/application-package';
const Storage = require('electron-store');
const createYargs: (argv?: string[], cwd?: string) => Argv = require('yargs/yargs');

/**
 * Options passed to the main/default command handler.
 */
export interface MainCommandOptions {

    /**
     * By default, the first positional argument. Should be a file or a folder.
     */
    file?: string

}

/**
 * Fields related to a launch event.
 *
 * This kind of event is triggered in two different contexts:
 *  1. The app is launched for the first time, `secondInstance` is false.
 *  2. The app is already running but user relaunches it, `secondInstance` is true.
 */
export interface ExecutionParams {
    secondInstance: boolean
    argv: string[]
    cwd: string
}

export const ElectronApplicationGlobals = Symbol('ElectronApplicationSettings');
export interface ElectronApplicationGlobals {
    THEIA_APP_PROJECT_PATH: string
    THEIA_BACKEND_MAIN_PATH: string
    THEIA_FRONTEND_HTML_PATH: string
}

export const ElectronMainContribution = Symbol('ElectronApplicationContribution');
export interface ElectronMainContribution {
    /**
     * The application is ready and is starting. This is the time to initialize
     * services global to this process.
     *
     * This event is fired when the process starts for the first time.
     */
    onStart?(application?: ElectronApplication): MaybePromise<void>;
    /**
     * The application is stopping. Contributions must perform only synchronous operations.
     */
    onStop?(application?: ElectronApplication): void;
}

@injectable()
export class ElectronApplication {

    @inject(ContributionProvider) @named(ElectronMainContribution)
    protected readonly electronApplicationContributions: ContributionProvider<ElectronMainContribution>;

    @inject(ElectronApplicationGlobals)
    protected readonly globals: ElectronApplicationGlobals;

    @inject(ElectronSecurityToken)
    protected electronSecurityToken: ElectronSecurityToken;

    protected readonly electronStore = new Storage();

    protected config: FrontendApplicationConfig;
    readonly backendPort = new Deferred<number>();

    async start(config: FrontendApplicationConfig): Promise<void> {
        this.config = config;
        this.hookApplicationEvents();
        const port = await this.startBackend();
        this.backendPort.resolve(port);
        await app.whenReady();
        await this.attachElectronSecurityToken(await this.backendPort.promise);
        await this.startContributions();
        await this.launch({
            secondInstance: false,
            argv: process.argv,
            cwd: process.cwd(),
        });
    }

    async launch(params: ExecutionParams): Promise<void> {
        createYargs(params.argv, params.cwd)
            .command('$0 [<file>]', false,
                cmd => cmd
                    .positional('file', { type: 'string' }),
                args => this.handleMainCommand(params, { file: args.file }),
            ).parse();
    }

    /**
     * Use this rather than creating `BrowserWindow` instances from scratch, since some security parameters need to be set, this method will do it.
     *
     * @param options
     */
    async createWindow(options: BrowserWindowConstructorOptions): Promise<BrowserWindow> {
        const electronWindow = new BrowserWindow(options);
        this.attachReadyToShow(electronWindow);
        this.attachWebContentsNewWindow(electronWindow);
        this.attachSaveWindowState(electronWindow);
        this.attachWillPreventUnload(electronWindow);
        this.attachGlobalShortcuts(electronWindow);
        return electronWindow;
    }

    async openDefaultWindow(): Promise<BrowserWindow> {
        const uri = await this.createWindowUri();
        const electronWindow = await this.createWindow(this.getBrowserWindowOptions());
        electronWindow.loadURL(uri.toString(true));
        return electronWindow;
    }

    async openWindowWithWorkspace(workspace: string): Promise<BrowserWindow> {
        const uri = (await this.createWindowUri()).withFragment(workspace);
        const electronWindow = await this.createWindow(this.getBrowserWindowOptions());
        electronWindow.loadURL(uri.toString(true));
        return electronWindow;
    }

    /**
     * "Gently" close all windows, application will not stop if a `beforeunload` handler returns `false`.
     */
    requestStop(): void {
        app.quit();
    }

    protected async handleMainCommand(params: ExecutionParams, options: MainCommandOptions): Promise<void> {
        if (typeof options.file === 'undefined') {
            await this.openDefaultWindow();
        } else {
            await this.openWindowWithWorkspace(realpathSync(path.resolve(params.cwd, options.file)));
        }
    }

    protected async createWindowUri(): Promise<URI> {
        const port = await this.backendPort.promise;
        return FileUri.create(this.globals.THEIA_FRONTEND_HTML_PATH).withQuery(`port=${port}`);
    }

    protected getBrowserWindowOptions(): BrowserWindowConstructorOptions {
        let windowState: BrowserWindowConstructorOptions | undefined = this.electronStore.get('windowstate', undefined);
        if (typeof windowState === 'undefined') {
            windowState = this.getDefaultWindowState();
        }
        return {
            ...windowState,
            show: false,
            title: this.config.applicationName,
            minWidth: 200,
            minHeight: 120,
        };
    }

    protected getDefaultWindowState(): BrowserWindowConstructorOptions {
        // The `screen` API must be required when the application is ready.
        // See: https://electronjs.org/docs/api/screen#screen
        const { screen } = require('electron');
        // We must center by hand because \`browserWindow.center()\` fails on multi-screen setups
        // See: https://github.com/electron/electron/issues/3490
        const { bounds } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        const height = Math.floor(bounds.height * (2 / 3));
        const width = Math.floor(bounds.width * (2 / 3));
        const y = Math.floor(bounds.y + (bounds.height - height) / 2);
        const x = Math.floor(bounds.x + (bounds.width - width) / 2);
        return { width, height, x, y };
    }

    /**
     * Prevent opening links into new electron browser windows by default.
     */
    protected attachWebContentsNewWindow(electronWindow: BrowserWindow): void {
        electronWindow.webContents.on('new-window', (event, url) => {
            event.preventDefault();
            shell.openExternal(url);
        });
    }

    /**
     * Only show the window when the content is ready.
     */
    protected attachReadyToShow(electronWindow: BrowserWindow): void {
        electronWindow.on('ready-to-show', () => electronWindow.show());
    }

    /**
     * Save the window geometry state on every change.
     */
    protected attachSaveWindowState(electronWindow: BrowserWindow): void {
        const saveWindowState = () => {
            try {
                let bounds;
                if (electronWindow.isMaximized()) {
                    bounds = this.electronStore.get('windowstate', {});
                } else {
                    bounds = electronWindow.getBounds();
                }
                this.electronStore.set('windowstate', {
                    isMaximized: electronWindow.isMaximized(),
                    width: bounds.width,
                    height: bounds.height,
                    x: bounds.x,
                    y: bounds.y
                });
            } catch (e) {
                console.error('Error while saving window state:', e);
            }
        };
        let delayedSaveTimeout: NodeJS.Timer | undefined;
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

    /**
     * Catch window closing event and display a confirmation window.
     */
    protected attachWillPreventUnload(electronWindow: BrowserWindow): void {
        // Fired when a beforeunload handler tries to prevent the page unloading
        electronWindow.webContents.on('will-prevent-unload', event => {
            const preventStop = 0 !== dialog.showMessageBox(electronWindow, {
                type: 'question',
                buttons: ['Yes', 'No'],
                title: 'Confirm',
                message: 'Are you sure you want to quit?',
                detail: 'Any unsaved changes will not be saved.'
            });

            if (!preventStop) {
                // This ignores the beforeunload callback, allowing the page to unload
                event.preventDefault();
            }
        });
    }

    /**
     * Catch certain keybindings to prevent reloading the window using keyboard shortcuts.
     */
    protected attachGlobalShortcuts(electronWindow: BrowserWindow): void {
        if (this.config.electron?.disallowReloadKeybinding) {
            const accelerators = ['CmdOrCtrl+R', 'F5'];
            electronWindow.on('focus', () => {
                for (const accelerator of accelerators) {
                    electron.globalShortcut.register(accelerator, () => { });
                }
            });
            electronWindow.on('blur', () => {
                for (const accelerator of accelerators) {
                    electron.globalShortcut.unregister(accelerator);
                }
            });
        }
    }

    /**
     * Start the NodeJS backend server.
     *
     * @return Running server's port promise.
     */
    protected async startBackend(): Promise<number> {
        // Check if we should run everything as one process.
        const noBackendFork = process.argv.indexOf('--no-cluster') !== -1;
        // Any flag/argument passed after `--` will be forwarded to the backend process.
        const backendArgvMarkerIndex = process.argv.indexOf('--');
        const backendArgv = backendArgvMarkerIndex === -1 ? [] : process.argv.slice(backendArgvMarkerIndex + 1);
        // We cannot use the `process.cwd()` as the application project path (the location of the `package.json` in other words)
        // in a bundled electron application because it depends on the way we start it. For instance, on OS X, these are a differences:
        // https://github.com/eclipse-theia/theia/issues/3297#issuecomment-439172274
        process.env.THEIA_APP_PROJECT_PATH = this.globals.THEIA_APP_PROJECT_PATH;
        // Set the electron version for both the dev and the production mode. (https://github.com/eclipse-theia/theia/issues/3254)
        // Otherwise, the forked backend processes will not know that they're serving the electron frontend.
        process.env.THEIA_ELECTRON_VERSION = process.versions.electron;
        if (noBackendFork) {
            process.env[ElectronSecurityToken] = JSON.stringify(this.electronSecurityToken);
            // The backend server main file is supposed to export a promise resolving with the port used by the http(s) server.
            const address: AddressInfo = await require(this.globals.THEIA_BACKEND_MAIN_PATH);
            return address.port;
        } else {
            const backendProcess = fork(this.globals.THEIA_BACKEND_MAIN_PATH, backendArgv, await this.getForkOptions());
            return new Promise((resolve, reject) => {
                // The backend server main file is also supposed to send the resolved http(s) server port via IPC.
                backendProcess.on('message', (address: AddressInfo) => {
                    resolve(address.port);
                });
                backendProcess.on('error', error => {
                    reject(error);
                });
                app.on('quit', () => {
                    // If we forked the process for the clusters, we need to manually terminate it.
                    // See: https://github.com/eclipse-theia/theia/issues/835
                    process.kill(backendProcess.pid);
                });
            });
        }
    }

    protected async getForkOptions(): Promise<ForkOptions> {
        return {
            env: {
                ...process.env,
                [ElectronSecurityToken]: JSON.stringify(this.electronSecurityToken),
            },
        };
    }

    protected async attachElectronSecurityToken(port: number): Promise<void> {
        await new Promise((resolve, reject) => {
            electron.session.defaultSession!.cookies.set({
                url: `http://localhost:${port}`,
                name: ElectronSecurityToken,
                value: JSON.stringify(this.electronSecurityToken),
                httpOnly: true,
            }, error => error ? reject(error) : resolve());
        });
    }

    protected hookApplicationEvents(): void {
        app.on('will-quit', this.onWillQuit.bind(this));
        app.on('second-instance', this.onSecondInstance.bind(this));
        app.on('window-all-closed', () => this.requestStop.bind(this));
    }

    protected onWillQuit(event: ElectronEvent): void {
        this.stop();
    }

    protected async onSecondInstance(event: ElectronEvent, argv: string[], cwd: string): Promise<void> {
        await this.launch({ argv, cwd, secondInstance: true });
    }

    protected async startContributions(): Promise<void> {
        const promises = [];
        for (const contribution of this.electronApplicationContributions.getContributions()) {
            if (contribution.onStart) {
                promises.push(contribution.onStart(this));
            }
        }
        await Promise.all(promises);
    }

    protected stopContributions(): void {
        for (const contribution of this.electronApplicationContributions.getContributions()) {
            if (contribution.onStop) {
                contribution.onStop(this);
            }
        }
    }

    protected stop(): void {
        this.stopContributions();
    }

}
