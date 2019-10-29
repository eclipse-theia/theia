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

import { inject, injectable, named } from 'inversify';
import { session, screen, globalShortcut, app, BrowserWindow, BrowserWindowConstructorOptions, Event as ElectronEvent, shell, dialog } from 'electron';
import * as path from 'path';
import { Argv } from 'yargs';
import { AddressInfo } from 'net';
import { promises as fs } from 'fs';
import { fork, ForkOptions } from 'child_process';
import { FrontendApplicationConfig } from '@theia/application-package/lib/application-props';
import URI from '../common/uri';
import { FileUri } from '../node/file-uri';
import { Deferred } from '../common/promise-util';
import { MaybePromise } from '../common/types';
import { ContributionProvider } from '../common/contribution-provider';
import { ElectronSecurityToken } from '../electron-common/electron-token';
const Storage = require('electron-store');
const createYargs: (argv?: string[], cwd?: string) => Argv = require('yargs/yargs');

/**
 * Options passed to the main/default command handler.
 */
export interface MainCommandOptions {

    /**
     * By default, the first positional argument. Should be either a relative or absolute file-system path pointing to a file or a folder.
     */
    readonly file?: string;

}

/**
 * Fields related to a launch event.
 *
 * This kind of event is triggered in two different contexts:
 *  1. The app is launched for the first time, `secondInstance` is false.
 *  2. The app is already running but user relaunches it, `secondInstance` is true.
 */
export interface ExecutionParams {
    readonly secondInstance: boolean;
    readonly argv: string[];
    readonly cwd: string;
}

export const ElectronApplicationGlobals = Symbol('ElectronApplicationSettings');
export interface ElectronApplicationGlobals {
    readonly THEIA_APP_PROJECT_PATH: string
    readonly THEIA_BACKEND_MAIN_PATH: string
    readonly THEIA_FRONTEND_HTML_PATH: string
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

// Extracted the functionality from `yargs@15.4.0-beta.0`.
// Based on https://github.com/yargs/yargs/blob/522b019c9a50924605986a1e6e0cb716d47bcbca/lib/process-argv.ts
@injectable()
export class ProcessArgv {

    protected get processArgvBinIndex(): number {
        // The binary name is the first command line argument for:
        // - bundled Electron apps: bin argv1 argv2 ... argvn
        if (this.isBundledElectronApp) {
            return 0;
        }
        // or the second one (default) for:
        // - standard node apps: node bin.js argv1 argv2 ... argvn
        // - unbundled Electron apps: electron bin.js argv1 arg2 ... argvn
        return 1;
    }

    protected get isBundledElectronApp(): boolean {
        // process.defaultApp is either set by electron in an electron unbundled app, or undefined
        // see https://github.com/electron/electron/blob/master/docs/api/process.md#processdefaultapp-readonly
        return this.isElectronApp && !(process as ProcessArgv.ElectronProcess).defaultApp;
    }

    protected get isElectronApp(): boolean {
        // process.versions.electron is either set by electron, or undefined
        // see https://github.com/electron/electron/blob/master/docs/api/process.md#processversionselectron-readonly
        return !!(process as ProcessArgv.ElectronProcess).versions.electron;
    }

    get processArgvWithoutBin(): Array<string> {
        return process.argv.slice(this.processArgvBinIndex + 1);
    }

    get ProcessArgvBin(): string {
        return process.argv[this.processArgvBinIndex];
    }

}

export namespace ProcessArgv {
    export interface ElectronProcess extends NodeJS.Process {
        readonly defaultApp?: boolean;
        readonly versions: NodeJS.ProcessVersions & {
            readonly electron: string;
        };
    }
}

@injectable()
export class ElectronApplication {

    @inject(ContributionProvider) @named(ElectronMainContribution)
    protected readonly electronApplicationContributions: ContributionProvider<ElectronMainContribution>;

    @inject(ElectronApplicationGlobals)
    protected readonly globals: ElectronApplicationGlobals;

    @inject(ElectronSecurityToken)
    protected electronSecurityToken: ElectronSecurityToken;

    @inject(ProcessArgv)
    protected processArgv: ProcessArgv;

    protected readonly electronStore = new Storage();

    protected config: FrontendApplicationConfig;
    readonly backendPort = new Deferred<number>();

    async start(config: FrontendApplicationConfig): Promise<void> {
        this.config = config;
        this.hookApplicationEvents();
        const port = await this.startBackend();
        this.backendPort.resolve(port);
        await app.whenReady();
        await this.attachElectronSecurityToken(port);
        await this.startContributions();
        await this.launch({
            secondInstance: false,
            argv: this.processArgv.processArgvWithoutBin,
            cwd: process.cwd()
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
        const [uri, electronWindow] = await Promise.all([
            this.createWindowUri(),
            this.createWindow(this.getBrowserWindowOptions())
        ]);
        electronWindow.loadURL(uri.toString(true));
        return electronWindow;
    }

    async openWindowWithWorkspace(url: string): Promise<BrowserWindow> {
        const electronWindow = await this.createWindow(this.getBrowserWindowOptions());
        electronWindow.loadURL(url);
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
            let workspacePath: string | undefined = undefined;
            try {
                workspacePath = await fs.realpath(path.resolve(params.cwd, options.file));
            } catch {
                console.error(`Could not resolve the workspace path. "${options.file}" is not a valid 'file' option. Falling back to the default workspace location.`);
            }
            if (workspacePath === undefined) {
                await this.openDefaultWindow();
            } else {
                const uri = (await this.createWindowUri()).withFragment(workspacePath);
                await this.openWindowWithWorkspace(uri.toString(true));
            }
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
        // We must center by hand because `browserWindow.center()` fails on multi-screen setups
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
                    globalShortcut.register(accelerator, () => { });
                }
            });
            electronWindow.on('blur', () => {
                for (const accelerator of accelerators) {
                    globalShortcut.unregister(accelerator);
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
            session.defaultSession!.cookies.set({
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
        app.on('window-all-closed', this.onWindowAllClosed.bind(this));
    }

    protected onWillQuit(event: ElectronEvent): void {
        this.stopContributions();
    }

    protected async onSecondInstance(event: ElectronEvent, argv: string[], cwd: string): Promise<void> {
        await this.launch({ argv, cwd, secondInstance: true });
    }

    protected onWindowAllClosed(event: ElectronEvent): void {
        this.requestStop();
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

}
