/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { AbstractGenerator } from "./abstract-generator";

export class FrontendGenerator extends AbstractGenerator {

    async generate(): Promise<void> {
        const frontendModules = this.pck.targetFrontendModules;
        await this.write(this.pck.frontend('index.html'), this.compileIndexHtml(frontendModules));
        await this.write(this.pck.frontend('index.js'), this.compileIndexJs(frontendModules));
        if (this.pck.isElectron()) {
            await this.write(this.pck.frontend('electron-main.js'), this.compileElectronMain());
        }
    }

    protected compileIndexHtml(frontendModules: Map<string, string>): string {
        return `<!DOCTYPE html>
<html>

<head>${this.compileIndexHead(frontendModules)}${this.ifBrowser(`
  <script type="text/javascript" src="./require.js" charset="utf-8"></script>`)}
  <script type="text/javascript" src="./bundle.js" charset="utf-8"></script>
</head>

<body>
</body>

</html>`;
    }

    protected compileIndexHead(frontendModules: Map<string, string>): string {
        return `
  <meta charset="UTF-8">
  <link href="http://maxcdn.bootstrapcdn.com/font-awesome/4.2.0/css/font-awesome.min.css" rel="stylesheet">
  <script type="text/javascript" src="https://www.promisejs.org/polyfills/promise-6.1.0.js" charset="utf-8"></script>`
    }

    protected compileIndexJs(frontendModules: Map<string, string>): string {
        return `// @ts-check
require('reflect-metadata');
const { Container } = require('inversify');
const { FrontendApplication } = require('@theia/core/lib/browser');
const { frontendApplicationModule } = require('@theia/core/lib/browser/frontend-application-module');
const { messagingFrontendModule } = require('@theia/core/lib/browser/messaging/messaging-frontend-module');
const { loggerFrontendModule } = require('@theia/core/lib/browser/logger-frontend-module');

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
        return `// @ts-check
const cluster = require('cluster');
if (cluster.isMaster) {
    // Workaround for https://github.com/electron/electron/issues/9225. Chrome has an issue where
    // in certain locales (e.g. PL), image metrics are wrongly computed. We explicitly set the
    // LC_NUMERIC to prevent this from happening (selects the numeric formatting category of the
    // C locale, http://en.cppreference.com/w/cpp/locale/LC_categories).
    if (process.env.LC_ALL) {
        process.env.LC_ALL = 'C';
    }
    process.env.LC_NUMERIC = 'C';
    const electron = require('electron');
    const path = require('path');
    electron.app.on('window-all-closed', function () {
        if (process.platform !== 'darwin') {
            electron.app.quit();
        }
    });
    electron.app.on('ready', function () {
        const mainWindow = new electron.BrowserWindow({ width: 1024, height: 728 });
        require("../backend/main").then(address => {
            mainWindow.loadURL(\`file://\${path.join(__dirname, '../../lib/index.html')}?port=\${address.port}\`);
        }).catch(() => {
            electron.app.exit(1);
        });
        mainWindow.on('closed', function () {
            electron.app.exit(0);
        });
    });
} else {
    require("../backend/main");
}
`;
    }

}
