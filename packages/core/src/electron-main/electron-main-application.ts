// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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

import { inject, injectable, named } from 'inversify';
import * as electronRemoteMain from '../../electron-shared/@electron/remote/main';
import { screen, ipcMain, app, BrowserWindow, Event as ElectronEvent } from '../../electron-shared/electron';
import * as path from 'path';
import { Argv } from 'yargs';
import { AddressInfo } from 'net';
import { promises as fs } from 'fs';
import { ChildProcess, fork, ForkOptions } from 'child_process';
import { FrontendApplicationConfig } from '@theia/application-package/lib/application-props';
import URI from '../common/uri';
import { FileUri } from '../node/file-uri';
import { Deferred } from '../common/promise-util';
import { ContributionProvider } from '../common/contribution-provider';
import { ElectronSecurityTokenService } from './electron-security-token-service';
import { ElectronSecurityToken } from '../electron-common/electron-token';
import Storage = require('electron-store');
import { Disposable, DisposableCollection, Emitter, Event, isOSX, isWindows, MaybePromise, serviceIdentifier } from '../common';
import {
    RequestTitleBarStyle,
    Restart, StopReason,
    TitleBarStyleAtStartup,
    TitleBarStyleChanged
} from '../electron-common/messaging/electron-messages';
import { DEFAULT_WINDOW_HASH } from '../common/window';
import { TheiaBrowserWindowOptions, TheiaElectronWindow, TheiaElectronWindowFactory } from './theia-electron-window';
import { ElectronMainApplicationGlobals } from './electron-main-constants';
import { pushDisposableListener } from '../common/node-event-utils';

export { ElectronMainApplicationGlobals };
import { cluster } from '../node';

const createYargs: (argv?: string[], cwd?: string) => Argv = require('yargs/yargs');

/**
 * Options passed to the main/default command handler.
 */
export interface ElectronMainCommandOptions {

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
export interface ElectronMainExecutionParams {
    readonly secondInstance: boolean;
    readonly argv: string[];
    readonly cwd: string;
}

/**
 * The default entrypoint will handle a very rudimentary CLI to open workspaces by doing `app path/to/workspace`. To override this behavior, you can extend and rebind the
 * `ElectronMainApplication` class and overriding the `launch` method.
 * A JSON-RPC communication between the Electron Main Process and the Renderer Processes is available: You can bind services using the `ElectronConnectionHandler` and
 * `ElectronIpcConnectionProvider` APIs, example:
 *
 * From an `electron-main` module:
 *
 *     bind(ElectronConnectionHandler).toDynamicValue(context =>
 *          new JsonRpcConnectionHandler(electronMainWindowServicePath,
 *          () => context.container.get(ElectronMainWindowService))
 *     ).inSingletonScope();
 *
 * And from the `electron-browser` module:
 *
 *     bind(ElectronMainWindowService).toDynamicValue(context =>
 *          ElectronIpcConnectionProvider.createProxy(context.container, electronMainWindowServicePath)
 *     ).inSingletonScope();
 */
export const ElectronMainApplicationContribution = serviceIdentifier<ElectronMainApplicationContribution>('ElectronMainApplicationContribution');
export interface ElectronMainApplicationContribution {
    /**
     * The application is ready and is starting. This is the time to initialize
     * services global to this process.
     *
     * Invoked when the electron-main process starts for the first time.
     */
    onStart?(application: ElectronMainApplication): MaybePromise<void>;
    /**
     * The application is stopping. Contributions must perform only synchronous operations.
     */
    onStop?(application: ElectronMainApplication): void;
}

// Extracted and modified the functionality from `yargs@15.4.0-beta.0`.
// Based on https://github.com/yargs/yargs/blob/522b019c9a50924605986a1e6e0cb716d47bcbca/lib/process-argv.ts
@injectable()
export class ElectronMainProcessArgv {

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
        return this.isElectronApp && !(process as ElectronMainProcessArgv.ElectronMainProcess).defaultApp;
    }

    protected get isElectronApp(): boolean {
        // process.versions.electron is either set by electron, or undefined
        // see https://github.com/electron/electron/blob/master/docs/api/process.md#processversionselectron-readonly
        return !!(process as ElectronMainProcessArgv.ElectronMainProcess).versions.electron;
    }

    getProcessArgvWithoutBin(argv = process.argv): Array<string> {
        return argv.slice(this.processArgvBinIndex + 1);
    }

    getProcessArgvBin(argv = process.argv): string {
        return argv[this.processArgvBinIndex];
    }

}

export namespace ElectronMainProcessArgv {
    export interface ElectronMainProcess extends NodeJS.Process {
        readonly defaultApp: boolean;
        readonly versions: NodeJS.ProcessVersions & {
            readonly electron: string;
        };
    }
}

@injectable()
export class ElectronMainApplication {

    @inject(ContributionProvider)
    @named(ElectronMainApplicationContribution)
    protected readonly contributions: ContributionProvider<ElectronMainApplicationContribution>;

    @inject(ElectronMainApplicationGlobals)
    protected readonly globals: ElectronMainApplicationGlobals;

    @inject(ElectronMainProcessArgv)
    protected processArgv: ElectronMainProcessArgv;

    @inject(ElectronSecurityTokenService)
    protected electronSecurityTokenService: ElectronSecurityTokenService;

    @inject(ElectronSecurityToken)
    protected readonly electronSecurityToken: ElectronSecurityToken;

    @inject(TheiaElectronWindowFactory)
    protected readonly windowFactory: TheiaElectronWindowFactory;

    protected readonly electronStore = new Storage<{
        windowstate?: TheiaBrowserWindowOptions
    }>();

    protected _backendPort = new Deferred<number>();
    protected _backendProcess = new Deferred<ChildProcess>();

    protected onDidCreateTheiaWindowEmitter = new Emitter<TheiaElectronWindow>();
    protected _config: FrontendApplicationConfig | undefined;
    protected useNativeWindowFrame: boolean = true;
    protected didUseNativeWindowFrameOnStart = new Map<number, boolean>();
    protected windows = new Map<number, TheiaElectronWindow>();
    protected restarting = false;

    get backendProcess(): Promise<ChildProcess> {
        return this._backendProcess.promise;
    }

    get backendPort(): Promise<number> {
        return this._backendPort.promise;
    }

    get config(): FrontendApplicationConfig {
        if (!this._config) {
            throw new Error('You have to start the application first.');
        }
        return this._config;
    }

    /**
     * Emitted once the Theia window has finished loading.
     */
    get onDidCreateTheiaWindow(): Event<TheiaElectronWindow> {
        return this.onDidCreateTheiaWindowEmitter.event;
    }

    async start(config: FrontendApplicationConfig): Promise<void> {
        this.useNativeWindowFrame = this.getTitleBarStyle(config) === 'native';
        this._config = config;
        this.hookApplicationEvents();
        const port = await this.startBackend();
        this._backendPort.resolve(port);
        await app.whenReady();
        await this.attachElectronSecurityToken(port);
        await this.startContributions();
        await this.launch({
            secondInstance: false,
            argv: this.processArgv.getProcessArgvWithoutBin(process.argv),
            cwd: process.cwd()
        });
    }

    protected getTitleBarStyle(config: FrontendApplicationConfig): 'native' | 'custom' {
        if (isOSX) {
            return 'native';
        }
        const storedFrame = this.electronStore.get('windowstate')?.frame;
        if (storedFrame !== undefined) {
            return !!storedFrame ? 'native' : 'custom';
        }
        if (config.preferences && config.preferences['window.titleBarStyle']) {
            const titleBarStyle = config.preferences['window.titleBarStyle'];
            if (titleBarStyle === 'native' || titleBarStyle === 'custom') {
                return titleBarStyle;
            }
        }
        return isWindows ? 'custom' : 'native';
    }

    protected async launch(params: ElectronMainExecutionParams): Promise<void> {
        createYargs(params.argv, params.cwd)
            .command('$0 [file]', false,
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
    async createWindow(asyncOptions: MaybePromise<TheiaBrowserWindowOptions> = this.getDefaultTheiaWindowOptions()): Promise<BrowserWindow> {
        let options = await asyncOptions;
        options = this.avoidOverlap(options);
        const electronWindow = this.windowFactory(options, this.config);
        const { window: { id } } = electronWindow;
        this.windows.set(id, electronWindow);
        electronWindow.onDidClose(() => this.windows.delete(id));
        this.attachSaveWindowState(electronWindow.window);
        electronRemoteMain.enable(electronWindow.window.webContents);
        electronWindow.window.webContents.once('did-finish-load', () => {
            this.onDidCreateTheiaWindowEmitter.fire(electronWindow);
        });
        return electronWindow.window;
    }

    async getLastWindowOptions(): Promise<TheiaBrowserWindowOptions> {
        const previousWindowState: TheiaBrowserWindowOptions | undefined = this.electronStore.get('windowstate');
        const windowState = previousWindowState?.screenLayout === this.getCurrentScreenLayout()
            ? previousWindowState
            : this.getDefaultTheiaWindowOptions();
        return {
            frame: this.useNativeWindowFrame,
            ...this.getDefaultOptions(),
            ...windowState
        };
    }

    protected avoidOverlap(options: TheiaBrowserWindowOptions): TheiaBrowserWindowOptions {
        const existingWindowsBounds = BrowserWindow.getAllWindows().map(window => window.getBounds());
        if (existingWindowsBounds.length > 0) {
            while (existingWindowsBounds.some(window => window.x === options.x || window.y === options.y)) {
                // if the window is maximized or in fullscreen, use the default window options.
                if (options.isMaximized || options.isFullScreen) {
                    options = this.getDefaultTheiaWindowOptions();
                }
                options.x = options.x! + 30;
                options.y = options.y! + 30;
            }
        }
        return options;
    }

    protected getDefaultOptions(): TheiaBrowserWindowOptions {
        return {
            show: false,
            title: this.config.applicationName,
            minWidth: 200,
            minHeight: 120,
            webPreferences: {
                // `global` is undefined when `true`.
                contextIsolation: false,
                // https://github.com/eclipse-theia/theia/issues/2018
                nodeIntegration: true,
                // Setting the following option to `true` causes some features to break, somehow.
                // Issue: https://github.com/eclipse-theia/theia/issues/8577
                nodeIntegrationInWorker: false,
            },
            ...this.config.electron?.windowOptions || {},
        };
    }

    async openDefaultWindow(): Promise<BrowserWindow> {
        const [uri, electronWindow] = await Promise.all([this.createWindowUri(), this.createWindow()]);
        electronWindow.loadURL(uri.withFragment(DEFAULT_WINDOW_HASH).toString(true));
        return electronWindow;
    }

    protected async openWindowWithWorkspace(workspacePath: string): Promise<BrowserWindow> {
        const options = await this.getLastWindowOptions();
        const [uri, electronWindow] = await Promise.all([this.createWindowUri(), this.createWindow(options)]);
        electronWindow.loadURL(uri.withFragment(encodeURI(workspacePath)).toString(true));
        return electronWindow;
    }

    /**
     * "Gently" close all windows, application will not stop if a `beforeunload` handler returns `false`.
     */
    requestStop(): void {
        app.quit();
    }

    protected async handleMainCommand(params: ElectronMainExecutionParams, options: ElectronMainCommandOptions): Promise<void> {
        if (params.secondInstance === false) {
            await this.openWindowWithWorkspace(''); // restore previous workspace.
        } else if (options.file === undefined) {
            await this.openDefaultWindow();
        } else {
            let workspacePath: string | undefined;
            try {
                workspacePath = await fs.realpath(path.resolve(params.cwd, options.file));
            } catch {
                console.error(`Could not resolve the workspace path. "${options.file}" is not a valid 'file' option. Falling back to the default workspace location.`);
            }
            if (workspacePath === undefined) {
                await this.openDefaultWindow();
            } else {
                await this.openWindowWithWorkspace(workspacePath);
            }
        }
    }

    protected async createWindowUri(): Promise<URI> {
        return FileUri.create(this.globals.THEIA_FRONTEND_HTML_PATH)
            .withQuery(`port=${await this.backendPort}`);
    }

    protected getDefaultTheiaWindowOptions(): TheiaBrowserWindowOptions {
        // The `screen` API must be required when the application is ready.
        // See: https://electronjs.org/docs/api/screen#screen
        // We must center by hand because `browserWindow.center()` fails on multi-screen setups
        // See: https://github.com/electron/electron/issues/3490
        const { bounds } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        const height = Math.round(bounds.height * (2 / 3));
        const width = Math.round(bounds.width * (2 / 3));
        const y = Math.round(bounds.y + (bounds.height - height) / 2);
        const x = Math.round(bounds.x + (bounds.width - width) / 2);
        return {
            frame: this.useNativeWindowFrame,
            isFullScreen: false,
            isMaximized: false,
            width,
            height,
            x,
            y,
            ...this.getDefaultOptions()
        };
    }

    /**
     * Save the window geometry state on every change.
     */
    protected attachSaveWindowState(electronWindow: BrowserWindow): void {
        const windowStateListeners = new DisposableCollection();
        let delayedSaveTimeout: NodeJS.Timer | undefined;
        const saveWindowStateDelayed = () => {
            if (delayedSaveTimeout) {
                clearTimeout(delayedSaveTimeout);
            }
            delayedSaveTimeout = setTimeout(() => this.saveWindowState(electronWindow), 1000);
        };
        pushDisposableListener(windowStateListeners, electronWindow, 'close', () => {
            this.saveWindowState(electronWindow);
        });
        pushDisposableListener(windowStateListeners, electronWindow, 'resize', saveWindowStateDelayed);
        pushDisposableListener(windowStateListeners, electronWindow, 'move', saveWindowStateDelayed);
        windowStateListeners.push(Disposable.create(() => { try { this.didUseNativeWindowFrameOnStart.delete(electronWindow.id); } catch { } }));
        this.didUseNativeWindowFrameOnStart.set(electronWindow.id, this.useNativeWindowFrame);
        electronWindow.once('closed', () => windowStateListeners.dispose());
    }

    protected saveWindowState(electronWindow: BrowserWindow): void {
        // In some circumstances the `electronWindow` can be `null`
        if (!electronWindow) {
            return;
        }
        try {
            const bounds = electronWindow.getBounds();
            const options: TheiaBrowserWindowOptions = {
                isFullScreen: electronWindow.isFullScreen(),
                isMaximized: electronWindow.isMaximized(),
                width: bounds.width,
                height: bounds.height,
                x: bounds.x,
                y: bounds.y,
                frame: this.useNativeWindowFrame,
                screenLayout: this.getCurrentScreenLayout(),
            };
            this.electronStore.set('windowstate', options);
        } catch (e) {
            console.error('Error while saving window state:', e);
        }
    }

    /**
     * Return a string unique to the current display layout.
     */
    protected getCurrentScreenLayout(): string {
        return screen.getAllDisplays()
            .map(display => `${display.bounds.x}:${display.bounds.y}:${display.bounds.width}:${display.bounds.height}`)
            .sort()
            .join('-');
    }

    /**
     * Start the NodeJS backend server.
     *
     * @return Running server's port promise.
     */
    protected async startBackend(): Promise<number> {
        // We cannot use the `process.cwd()` as the application project path (the location of the `package.json` in other words)
        // in a bundled electron application because it depends on the way we start it. For instance, on OS X, these are a differences:
        // https://github.com/eclipse-theia/theia/issues/3297#issuecomment-439172274
        process.env.THEIA_APP_PROJECT_PATH = this.globals.THEIA_APP_PROJECT_PATH;
        // Set the electron version for both the dev and the production mode. (https://github.com/eclipse-theia/theia/issues/3254)
        // Otherwise, the forked backend processes will not know that they're serving the electron frontend.
        process.env.THEIA_ELECTRON_VERSION = process.versions.electron;
        if (!cluster) {
            this._backendProcess.promise.catch(() => { /* prevent `uncaughtRejection` error */ });
            this._backendProcess.reject(new Error('running the backend in the current process'));
            process.env[ElectronSecurityToken] = JSON.stringify(this.electronSecurityToken);
            // The backend server main file is supposed to export a promise resolving with the port used by the http(s) server.
            const { port }: AddressInfo = await require(this.globals.THEIA_BACKEND_MAIN_PATH);
            return port;
        } else {
            const backendProcess = fork(
                this.globals.THEIA_BACKEND_MAIN_PATH,
                this.processArgv.getProcessArgvWithoutBin(),
                await this.getForkOptions(),
            );
            this._backendProcess.resolve(backendProcess);
            return new Promise((resolve, reject) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                function messageListener(message: any): void {
                    if ('port' in message && 'address' in message) {
                        resolve(message.port);
                        cleanup();
                    }
                };
                function errorListener(error: unknown): void {
                    reject(error);
                    cleanup();
                };
                function cleanup(): void {
                    backendProcess.off('message', messageListener);
                    backendProcess.off('error', errorListener);
                };
                // The backend server main file is also supposed to send the resolved http(s) server port via IPC.
                backendProcess.on('message', messageListener);
                backendProcess.once('error', errorListener);
                app.once('quit', () => {
                    // Only issue a kill signal if the backend process is running.
                    // eslint-disable-next-line no-null/no-null
                    if (backendProcess.exitCode === null && backendProcess.signalCode === null) {
                        try {
                            // If we forked the process for the clusters, we need to manually terminate it.
                            // See: https://github.com/eclipse-theia/theia/issues/835
                            process.kill(backendProcess.pid);
                        } catch (error) {
                            // See https://man7.org/linux/man-pages/man2/kill.2.html#ERRORS
                            if (error.code === 'ESRCH') {
                                return;
                            }
                            throw error;
                        }
                    }
                });
            });
        }
    }

    protected async getForkOptions(): Promise<ForkOptions> {
        return {
            // The backend must be a process group leader on UNIX in order to kill the tree later.
            // See https://nodejs.org/api/child_process.html#child_process_options_detached
            detached: process.platform !== 'win32',
            env: {
                ...process.env,
                [ElectronSecurityToken]: JSON.stringify(this.electronSecurityToken),
            },
        };
    }

    protected async attachElectronSecurityToken(port: number): Promise<void> {
        await this.electronSecurityTokenService.setElectronSecurityTokenCookie(`http://localhost:${port}`);
    }

    protected hookApplicationEvents(): void {
        app.on('will-quit', this.onWillQuit.bind(this));
        app.on('second-instance', this.onSecondInstance.bind(this));
        app.on('window-all-closed', this.onWindowAllClosed.bind(this));

        ipcMain.on(TitleBarStyleChanged, ({ sender }, titleBarStyle: string) => {
            this.useNativeWindowFrame = titleBarStyle === 'native';
            const browserWindow = BrowserWindow.fromId(sender.id);
            if (browserWindow) {
                this.saveWindowState(browserWindow);
            } else {
                console.warn(`no BrowserWindow with id: ${sender.id}`);
            }
        });

        ipcMain.on(Restart, ({ sender }) => {
            this.restart(sender.id);
        });

        ipcMain.on(RequestTitleBarStyle, ({ sender }) => {
            sender.send(TitleBarStyleAtStartup, this.didUseNativeWindowFrameOnStart.get(sender.id) ? 'native' : 'custom');
        });
    }

    protected onWillQuit(event: ElectronEvent): void {
        this.stopContributions();
    }

    protected async onSecondInstance(event: ElectronEvent, argv: string[], cwd: string): Promise<void> {
        const electronWindows = BrowserWindow.getAllWindows();
        if (electronWindows.length > 0) {
            const electronWindow = electronWindows[0];
            if (electronWindow.isMinimized()) {
                electronWindow.restore();
            }
            electronWindow.focus();
        }
    }

    protected onWindowAllClosed(event: ElectronEvent): void {
        if (!this.restarting) {
            this.requestStop();
        }
    }

    protected async restart(id: number): Promise<void> {
        this.restarting = true;
        const window = BrowserWindow.fromId(id);
        const wrapper = this.windows.get(window?.id as number); // If it's not a number, we won't get anything.
        if (wrapper) {
            const listener = wrapper.onDidClose(async () => {
                listener.dispose();
                await this.launch({
                    secondInstance: false,
                    argv: this.processArgv.getProcessArgvWithoutBin(process.argv),
                    cwd: process.cwd()
                });
                this.restarting = false;
            });
            // If close failed or was cancelled on this occasion, don't keep listening for it.
            if (!await wrapper.close(StopReason.Restart)) {
                listener.dispose();
            }
        }
    }

    protected async startContributions(): Promise<void> {
        const promises = [];
        for (const contribution of this.contributions.getContributions()) {
            if (contribution.onStart) {
                promises.push(contribution.onStart(this));
            }
        }
        await Promise.all(promises);
    }

    protected stopContributions(): void {
        for (const contribution of this.contributions.getContributions()) {
            if (contribution.onStop) {
                contribution.onStop(this);
            }
        }
    }

}
