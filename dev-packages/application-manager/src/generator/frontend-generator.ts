/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

/* eslint-disable @typescript-eslint/indent */

import { AbstractGenerator } from './abstract-generator';
import { existsSync, readFileSync } from 'fs';

export class FrontendGenerator extends AbstractGenerator {

    async generate(): Promise<void> {
        const frontendModules = this.pck.targetFrontendModules;
        await this.write(this.pck.frontend('index.html'), this.compileIndexHtml(frontendModules));
        await this.write(this.pck.frontend('index.js'), this.compileIndexJs(frontendModules));
        if (this.pck.isElectron()) {
            await this.write(this.pck.frontend('electron-main.js'), this.compileElectronMain());
        }
    }

    protected compileIndexPreload(frontendModules: Map<string, string>): string {
        const template = this.pck.props.generator.config.preloadTemplate;
        if (!template) {
            return '';
        }

        // Support path to html file
        if (existsSync(template)) {
            return readFileSync(template).toString();
        }

        return template;
    }

    protected compileIndexHtml(frontendModules: Map<string, string>): string {
        return `<!DOCTYPE html>
<html lang="en">

<head>${this.compileIndexHead(frontendModules)}
  <script type="text/javascript" src="./bundle.js" charset="utf-8"></script>
</head>

<body>
  <div class="theia-preload">${this.compileIndexPreload(frontendModules)}</div>
</body>

</html>`;
    }

    protected compileIndexHead(frontendModules: Map<string, string>): string {
        return `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="apple-mobile-web-app-capable" content="yes">`;
    }

    protected compileIndexJs(frontendModules: Map<string, string>): string {
        return `// @ts-check
${this.ifBrowser("require('es6-promise/auto');")}
require('reflect-metadata');
const { Container } = require('inversify');
const { FrontendApplication } = require('@theia/core/lib/browser');
const { frontendApplicationModule } = require('@theia/core/lib/browser/frontend-application-module');
const { messagingFrontendModule } = require('@theia/core/lib/${this.pck.isBrowser()
                ? 'browser/messaging/messaging-frontend-module'
                : 'electron-browser/messaging/electron-messaging-frontend-module'}');
const { loggerFrontendModule } = require('@theia/core/lib/browser/logger-frontend-module');
const { ThemeService } = require('@theia/core/lib/browser/theming');
const { FrontendApplicationConfigProvider } = require('@theia/core/lib/browser/frontend-application-config-provider');

FrontendApplicationConfigProvider.set(${this.prettyStringify(this.pck.props.frontend.config)});

const container = new Container();
container.load(frontendApplicationModule);
container.load(messagingFrontendModule);
container.load(loggerFrontendModule);

function load(raw) {
    return Promise.resolve(raw.default).then(module =>
        container.load(module)
    )
}

function start() {
    (window['theia'] = window['theia'] || {}).container = container;

    const themeService = ThemeService.get();
    themeService.loadUserTheme();

    const application = container.get(FrontendApplication);
    return application.start();
}

module.exports = Promise.resolve()${this.compileFrontendModuleImports(frontendModules)}
    .then(start).catch(reason => {
        console.error('Failed to start the frontend application.');
        if (reason) {
            console.error(reason);
        }
    });`;
    }

    protected compileElectronMain(): string {
        return `// @ts-check

// Useful for Electron/NW.js apps as GUI apps on macOS doesn't inherit the \`$PATH\` define
// in your dotfiles (.bashrc/.bash_profile/.zshrc/etc).
// https://github.com/electron/electron/issues/550#issuecomment-162037357
// https://github.com/eclipse-theia/theia/pull/3534#issuecomment-439689082
require('fix-path')();

// Workaround for https://github.com/electron/electron/issues/9225. Chrome has an issue where
// in certain locales (e.g. PL), image metrics are wrongly computed. We explicitly set the
// LC_NUMERIC to prevent this from happening (selects the numeric formatting category of the
// C locale, http://en.cppreference.com/w/cpp/locale/LC_categories).
if (process.env.LC_ALL) {
    process.env.LC_ALL = 'C';
}
process.env.LC_NUMERIC = 'C';

const uuid = require('uuid');
const electron = require('electron');
const { join, resolve } = require('path');
const { fork } = require('child_process');
const { app, dialog, shell, BrowserWindow, ipcMain, Menu, globalShortcut } = electron;
const { ElectronSecurityToken } = require('@theia/core/lib/electron-common/electron-token');

const applicationName = \`${this.pck.props.frontend.config.applicationName}\`;
const isSingleInstance = ${this.pck.props.backend.config.singleInstance === true ? 'true' : 'false'};
const disallowReloadKeybinding = ${this.pck.props.frontend.config.disallowReloadKeybinding === true ? 'true' : 'false'};

if (isSingleInstance && !app.requestSingleInstanceLock()) {
    // There is another instance running, exit now. The other instance will request focus.
    app.quit();
    return;
}

const nativeKeymap = require('native-keymap');
const Storage = require('electron-store');
const electronStore = new Storage();

const electronSecurityToken = {
    value: uuid.v4(),
};

app.on('ready', () => {

    if (disallowReloadKeybinding) {
        globalShortcut.register('CmdOrCtrl+R', () => {});
    }

    // Explicitly set the app name to have better menu items on macOS. ("About", "Hide", and "Quit")
    // See: https://github.com/electron-userland/electron-builder/issues/2468
    app.setName(applicationName);

    const { screen } = electron;

    // Remove the default electron menus, waiting for the application to set its own.
    Menu.setApplicationMenu(Menu.buildFromTemplate([{
        role: 'help', submenu: [{ role: 'toggledevtools'}]
    }]));

    function createNewWindow(theUrl) {

        // We must center by hand because \`browserWindow.center()\` fails on multi-screen setups
        // See: https://github.com/electron/electron/issues/3490
        const { bounds } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        const height = Math.floor(bounds.height * (2/3));
        const width = Math.floor(bounds.width * (2/3));

        const y = Math.floor(bounds.y + (bounds.height - height) / 2);
        const x = Math.floor(bounds.x + (bounds.width - width) / 2);

        const WINDOW_STATE = 'windowstate';
        const windowState = electronStore.get(WINDOW_STATE, {
            width, height, x, y
        });

        let windowOptions = {
            show: false,
            title: applicationName,
            width: windowState.width,
            height: windowState.height,
            minWidth: 200,
            minHeight: 120,
            x: windowState.x,
            y: windowState.y,
            isMaximized: windowState.isMaximized
        };

        // Always hide the window, we will show the window when it is ready to be shown in any case.
        const newWindow = new BrowserWindow(windowOptions);
        if (windowOptions.isMaximized) {
            newWindow.maximize();
        }
        newWindow.on('ready-to-show', () => newWindow.show());

        // Prevent calls to "window.open" from opening an ElectronBrowser window,
        // and rather open in the OS default web browser.
        newWindow.webContents.on('new-window', (event, url) => {
            event.preventDefault();
            shell.openExternal(url);
        });

        // Save the window geometry state on every change
        const saveWindowState = () => {
            try {
                let bounds;
                if (newWindow.isMaximized()) {
                    bounds = electronStore.get(WINDOW_STATE, {});
                } else {
                    bounds = newWindow.getBounds();
                }
                electronStore.set(WINDOW_STATE, {
                    isMaximized: newWindow.isMaximized(),
                    width: bounds.width,
                    height: bounds.height,
                    x: bounds.x,
                    y: bounds.y
                });
            } catch (e) {
                console.error("Error while saving window state.", e);
            }
        };
        let delayedSaveTimeout;
        const saveWindowStateDelayed = () => {
            if (delayedSaveTimeout) {
                clearTimeout(delayedSaveTimeout);
            }
            delayedSaveTimeout = setTimeout(saveWindowState, 1000);
        };
        newWindow.on('close', saveWindowState);
        newWindow.on('resize', saveWindowStateDelayed);
        newWindow.on('move', saveWindowStateDelayed);

        // Fired when a beforeunload handler tries to prevent the page unloading
        newWindow.webContents.on('will-prevent-unload', event => {
            const preventStop = 0 !== dialog.showMessageBox(newWindow, {
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

        // Notify the renderer process on keyboard layout change
        nativeKeymap.onDidChangeKeyboardLayout(() => {
            if (!newWindow.isDestroyed()) {
                const newLayout = {
                    info: nativeKeymap.getCurrentKeyboardLayout(),
                    mapping: nativeKeymap.getKeyMap()
                };
                newWindow.webContents.send('keyboardLayoutChanged', newLayout);
            }
        });

        if (!!theUrl) {
            newWindow.loadURL(theUrl);
        }
        return newWindow;
    }

    app.on('window-all-closed', () => {
        app.quit();
    });
    ipcMain.on('create-new-window', (event, url) => {
        createNewWindow(url);
    });
    ipcMain.on('open-external', (event, url) => {
        shell.openExternal(url);
    });

    // Check whether we are in bundled application or development mode.
    // @ts-ignore
    const devMode = process.defaultApp || /node_modules[\/]electron[\/]/.test(process.execPath);
    // Check if we should run everything as one process.
    const noBackendFork = process.argv.includes('--no-cluster');
    const mainWindow = createNewWindow();

    if (isSingleInstance) {
        app.on('second-instance', (event, commandLine, workingDirectory) => {
            // Someone tried to run a second instance, we should focus our window.
            if (mainWindow && !mainWindow.isDestroyed()) {
                if (mainWindow.isMinimized()) {
                    mainWindow.restore();
                }
                mainWindow.focus()
            }
        })
    }

    const loadMainWindow = (port) => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.session.cookies.set({
                url: \`http://localhost:\${port}/\`,
                name: ElectronSecurityToken,
                value: JSON.stringify(electronSecurityToken),
            }, error => {
                if (error) {
                    console.error(error);
                } else {
                    mainWindow.loadURL('file://' + join(__dirname, '../../lib/index.html') + '?port=' + port);
                }
            });
        }
    };

    // We cannot use the \`process.cwd()\` as the application project path (the location of the \`package.json\` in other words)
    // in a bundled electron application because it depends on the way we start it. For instance, on OS X, these are a differences:
    // https://github.com/eclipse-theia/theia/issues/3297#issuecomment-439172274
    process.env.THEIA_APP_PROJECT_PATH = resolve(__dirname, '..', '..');

    // Set the electron version for both the dev and the production mode. (https://github.com/eclipse-theia/theia/issues/3254)
    // Otherwise, the forked backend processes will not know that they're serving the electron frontend.
    // The forked backend should patch its \`process.versions.electron\` with this value if it is missing.
    process.env.THEIA_ELECTRON_VERSION = process.versions.electron;

    const mainPath = join(__dirname, '..', 'backend', 'main');
    // We spawn a separate process for the backend for Express to not run in the Electron main process.
    // See: https://github.com/eclipse-theia/theia/pull/7361#issuecomment-601272212
    // But when in debugging we want to run everything in the same process to make things easier.
    if (noBackendFork) {
        process.env[ElectronSecurityToken] = JSON.stringify(electronSecurityToken);
        require(mainPath).then(address => {
            loadMainWindow(address.port);
        }).catch((error) => {
            console.error(error);
            app.exit(1);
        });
    } else {
        // We want to pass flags passed to the Electron app to the backend process.
        // Quirk: When developing from sources, we execute Electron as \`electron.exe electron-main.js ...args\`, but when bundled,
        // the command looks like \`bundled-application.exe ...args\`.
        const cp = fork(mainPath, process.argv.slice(devMode ? 2 : 1), { env: Object.assign({
            [ElectronSecurityToken]: JSON.stringify(electronSecurityToken),
        }, process.env) });
        cp.on('message', (address) => {
            loadMainWindow(address.port);
        });
        cp.on('error', (error) => {
            console.error(error);
            app.exit(1);
        });
        app.on('quit', () => {
            // If we forked the process for the clusters, we need to manually terminate it.
            // See: https://github.com/eclipse-theia/theia/issues/835
            process.kill(cp.pid);
        });
    }
});
`;
    }

}
