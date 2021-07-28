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

export class BackendGenerator extends AbstractGenerator {

    async generate(): Promise<void> {
        const backendModules = this.pck.targetBackendModules;
        await this.write(this.pck.backend('server.js'), this.compileServer(backendModules));
        await this.write(this.pck.backend('main.js'), this.compileMain(backendModules));
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
    app.use(express.static(path.resolve(__dirname, '../../lib')))
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

module.exports = serverAddress;
`;
    }

}
