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

import { AbstractGenerator } from './abstract-generator';

export class FrontendGenerator extends AbstractGenerator {

    async generate(): Promise<void> {
        const frontendModules = this.pck.targetFrontendModules;

        if (this.package.isHybrid()) {
            await this.write(this.pck.frontend('browser', 'index.html'), this.compileIndexHtml(this.package.frontendModules));
            await this.write(this.pck.frontend('electron', 'index.html'), this.compileIndexHtml(this.package.frontendElectronModules));
            await this.write(this.pck.frontend('browser', 'index.js'), this.compileIndexJs(this.package.frontendModules));
            await this.write(this.pck.frontend('electron', 'index.js'), this.compileIndexJs(this.package.frontendElectronModules));
        } else {
            await this.write(this.pck.frontend('index.html'), this.compileIndexHtml(frontendModules));
            await this.write(this.pck.frontend('index.js'), this.compileIndexJs(frontendModules));
        }

        if (this.pck.isElectron()) {
            await this.write(this.pck.frontend('electron-main.js'), this.compileElectronMain());
        }
    }

    protected compileIndexHtml(frontendModules: Map<string, string>): string {
        return `\
<!DOCTYPE html>
<html>

<head>${this.compileIndexHead(frontendModules)}
  <script type="text/javascript" src="./bundle.js" charset="utf-8"></script>
</head>

<body>
  <div class="theia-preload"></div>
</body>

</html>`;
    }

    protected compileIndexHead(frontendModules: Map<string, string>): string {
        return `
  <meta charset="UTF-8">`;
    }

    protected compileIndexJs(frontendModules: Map<string, string>): string {
        return `\
// @ts-check
${this.ifBrowser(`require('es6-promise/auto');
`)}\
require('reflect-metadata');
const { Container } = require('inversify');
const { FrontendApplication } = require('@theia/core/lib/browser');
const { frontendApplicationModule } = require('@theia/core/lib/browser/frontend-application-module');
const { messagingFrontendModule } = require('@theia/core/lib/browser/messaging/messaging-frontend-module');
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
    const themeService = ThemeService.get();
    themeService.loadUserTheme();

    const application = container.get(FrontendApplication);
    application.start();
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
        return `\
// @ts-check
// Workaround for https://github.com/electron/electron/issues/9225. Chrome has an issue where
// in certain locales (e.g. PL), image metrics are wrongly computed. We explicitly set the
// LC_NUMERIC to prevent this from happening (selects the numeric formatting category of the
// C locale, http://en.cppreference.com/w/cpp/locale/LC_categories).
if (process.env.LC_ALL) {
    process.env.LC_ALL = 'C';
}
process.env.LC_NUMERIC = 'C';

const { join } = require('path');
const { isMaster } = require('cluster');
const { fork } = require('child_process');
const { app, BrowserWindow, ipcMain } = require('electron');
const EventEmitter = require('events');
const fileSchemeTester = /^file:/;

const localUriEvent = new EventEmitter();
let localUri = undefined;
const windows = [];

function setLocalUri(uri) {
    localUriEvent.emit('update', localUri = uri);
}
function resolveLocalUriFromPort(port) {
    setLocalUri('file://' + join(__dirname, '../../lib/index.html') + '?port=' + port);
}

function createNewWindow(theUrl) {
    const config = {
        width: 1024,
        height: 728,
        show: !!theUrl
    };

    // Converts 'localhost' to the running local backend endpoint
    if (localUri && theUrl === 'localhost') {
        theUrl = localUri;
    }

    if (!!theUrl && !fileSchemeTester.test(theUrl)) {
        config.webPreferences = {
            // nodeIntegration: false,
            // contextIsolation: true,
        };
    };

    const newWindow = new BrowserWindow(config);
    if (windows.length === 0) {
        newWindow.webContents.on('new-window', (event, url, frameName, disposition, options) => {
            // If the first electron window isn't visible, then all other new windows will remain invisible.
            // https://github.com/electron/electron/issues/3751
            Object.assign(options, config);
        });
    }
    windows.push(newWindow);
    if (!!theUrl) {
        newWindow.loadURL(theUrl);
    } else {
        newWindow.on('ready-to-show', () => newWindow.show());
    }
    newWindow.on('closed', () => {
        const index = windows.indexOf(newWindow);
        if (index !== -1) {
            windows.splice(index, 1);
        }
        if (windows.length === 0) {
            app.exit(0);
        }
    });
    return newWindow;
}

if (isMaster) {
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
    ipcMain.on('create-new-window', (event, url) => {
        createNewWindow(url);
    });
    app.on('ready', () => {
        // Check whether we are in bundled application or development mode.
        const devMode = process.defaultApp || /node_modules[\\/]electron[\\/]/.test(process.execPath);

        const mainWindow = createNewWindow();
        const loadMainWindow = (uri) => {
            // mainWindow.loadURL(\`http://localhost:\${port}\`);
            mainWindow.loadURL(uri);
        };
        localUriEvent.once('update', loadMainWindow);

        const mainPath = join(__dirname, '..', 'backend', 'main');
        // We need to distinguish between bundled application and development mode when starting the clusters.
        // See: https://github.com/electron/electron/issues/6337#issuecomment-230183287
        if (devMode) {
            require(mainPath).then(address => {
                resolveLocalUriFromPort(address.port)
            }).catch((error) => {
                console.error(error);
                app.exit(1);
            });
        } else {
            const cp = fork(mainPath);
            cp.on('message', (message) => {
                resolveLocalUriFromPort(message);
            });
            cp.on('error', (error) => {
                console.error(error);
                app.exit(1);
            });
            app.on('quit', () => {
                // If we forked the process for the clusters, we need to manually terminate it.
                // See: https://github.com/theia-ide/theia/issues/835
                process.kill(cp.pid);
            });
        }
    });
} else {
    require('../backend/main');
}
`;
    }

}
