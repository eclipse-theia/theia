// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { AbstractGenerator } from './abstract-generator';

export class BackendGenerator extends AbstractGenerator {

    async generate(): Promise<void> {
        const backendModules = this.pck.targetBackendModules;
        await this.write(this.pck.backend('server.js'), this.compileServer(backendModules));
        await this.write(this.pck.backend('main.js'), this.compileMain(backendModules));
        if (this.pck.isElectron()) {
            await this.write(this.pck.backend('electron-main.js'), this.compileElectronMain(this.pck.targetElectronMainModules));
        }
    }

    protected compileElectronMain(electronMainModules?: Map<string, string>): string {
        return `// @ts-check

require('reflect-metadata');

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

const { default: electronMainApplicationModule } = require('@theia/core/lib/electron-main/electron-main-application-module');
const { ElectronMainApplication, ElectronMainApplicationGlobals } = require('@theia/core/lib/electron-main/electron-main-application');
const { Container } = require('inversify');
const { resolve } = require('path');
const { app } = require('electron');

// Fix the window reloading issue, see: https://github.com/electron/electron/issues/22119
app.allowRendererProcessReuse = false;

const config = ${this.prettyStringify(this.pck.props.frontend.config)};
const isSingleInstance = ${this.pck.props.backend.config.singleInstance === true ? 'true' : 'false'};

if (isSingleInstance && !app.requestSingleInstanceLock()) {
    // There is another instance running, exit now. The other instance will request focus.
    app.quit();
    return;
}

const container = new Container();
container.load(electronMainApplicationModule);
container.bind(ElectronMainApplicationGlobals).toConstantValue({
    THEIA_APP_PROJECT_PATH: resolve(__dirname, '..', '..'),
    THEIA_BACKEND_MAIN_PATH: resolve(__dirname, 'main.js'),
    THEIA_FRONTEND_HTML_PATH: resolve(__dirname, '..', '..', 'lib', 'frontend', 'index.html'),
});

function load(raw) {
    return Promise.resolve(raw.default).then(module =>
        container.load(module)
    );
}

async function start() {
    const application = container.get(ElectronMainApplication);
    await application.start(config);
}

module.exports = Promise.resolve()${this.compileElectronMainModuleImports(electronMainModules)}
    .then(start).catch(reason => {
        console.error('Failed to start the electron application.');
        if (reason) {
            console.error(reason);
        }
    });
`;
    }

    protected compileServer(backendModules: Map<string, string>): string {
        return `// @ts-check
require('reflect-metadata');${this.ifElectron(`

// Patch electron version if missing, see https://github.com/eclipse-theia/theia/pull/7361#pullrequestreview-377065146
if (typeof process.versions.electron === 'undefined' && typeof process.env.THEIA_ELECTRON_VERSION === 'string') {
    process.versions.electron = process.env.THEIA_ELECTRON_VERSION;
}`)}

// Erase the ELECTRON_RUN_AS_NODE variable from the environment, else Electron apps started using Theia will pick it up.
if ('ELECTRON_RUN_AS_NODE' in process.env) {
    delete process.env.ELECTRON_RUN_AS_NODE;
}

const path = require('path');
const express = require('express');
const { Container } = require('inversify');
const { BackendApplication, BackendApplicationServer, CliManager } = require('@theia/core/lib/node');
const { backendApplicationModule } = require('@theia/core/lib/node/backend-application-module');
const { messagingBackendModule } = require('@theia/core/lib/node/messaging/messaging-backend-module');
const { loggerBackendModule } = require('@theia/core/lib/node/logger-backend-module');

const container = new Container();
container.load(backendApplicationModule);
container.load(messagingBackendModule);
container.load(loggerBackendModule);

function defaultServeStatic(app) {
    app.use(express.static(path.resolve(__dirname, '../../lib/frontend')))
}

function load(raw) {
    return Promise.resolve(raw.default).then(
        module => container.load(module)
    );
}

function start(port, host, argv = process.argv) {
    if (!container.isBound(BackendApplicationServer)) {
        container.bind(BackendApplicationServer).toConstantValue({ configure: defaultServeStatic });
    }
    return container.get(CliManager).initializeCli(argv).then(() => {
        return container.get(BackendApplication).start(port, host);
    });
}

module.exports = (port, host, argv) => Promise.resolve()${this.compileBackendModuleImports(backendModules)}
    .then(() => start(port, host, argv)).catch(error => {
        console.error('Failed to start the backend application:');
        console.error(error);
        process.exitCode = 1;
        throw error;
    });
`;
    }

    protected compileMain(backendModules: Map<string, string>): string {
        return `// @ts-check
const { BackendApplicationConfigProvider } = require('@theia/core/lib/node/backend-application-config-provider');
const main = require('@theia/core/lib/node/main');

BackendApplicationConfigProvider.set(${this.prettyStringify(this.pck.props.backend.config)});

const serverModule = require('./server');
const serverAddress = main.start(serverModule());

serverAddress.then(({ port, address }) => {
    if (process && process.send) {
        process.send({ port, address });
    }
});

globalThis.serverAddress = serverAddress;
`;
    }

}
