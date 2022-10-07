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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/indent */

import { AbstractGenerator, GeneratorOptions } from './abstract-generator';
import { existsSync, readFileSync } from 'fs';

export class FrontendGenerator extends AbstractGenerator {

    async generate(options: GeneratorOptions = {}): Promise<void> {
        const frontendModules = this.pck.targetFrontendModules;
        await this.write(this.pck.frontend('index.html'), this.compileIndexHtml(frontendModules));
        await this.write(this.pck.frontend('index.js'), this.compileIndexJs(frontendModules));
        await this.write(this.pck.frontend('secondary-window.html'), this.compileSecondaryWindowHtml());
        await this.write(this.pck.frontend('secondary-index.js'), this.compileSecondaryIndexJs(this.pck.secondaryWindowModules));
        if (this.pck.isElectron()) {
            const electronMainModules = this.pck.targetElectronMainModules;
            await this.write(this.pck.frontend('electron-main.js'), this.compileElectronMain(electronMainModules));
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
</head>

<body>
    <div class="theia-preload">${this.compileIndexPreload(frontendModules)}</div>
    <script type="text/javascript" src="./bundle.js" charset="utf-8"></script>
</body>

</html>`;
    }

    protected compileIndexHead(frontendModules: Map<string, string>): string {
        return `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>${this.pck.props.frontend.config.applicationName}</title>`;
    }

    protected compileIndexJs(frontendModules: Map<string, string>): string {
        const compiledModuleImports = this.compileFrontendModuleImports(frontendModules)
            // fix the generated indentation
            .replace(/^    /g, '        ');
        return `\
// @ts-check
${this.ifBrowser("require('es6-promise/auto');")}
require('reflect-metadata');
require('setimmediate');
const { Container } = require('inversify');
const { FrontendApplicationConfigProvider } = require('@theia/core/lib/browser/frontend-application-config-provider');

FrontendApplicationConfigProvider.set(${this.prettyStringify(this.pck.props.frontend.config)});

${this.ifMonaco(() => `
self.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
        return './editor.worker.js';
    }
}
`)}

const preloader = require('@theia/core/lib/browser/preloader');

// We need to fetch some data from the backend before the frontend starts (nls, os)
module.exports = preloader.preload().then(() => {
    const { FrontendApplication } = require('@theia/core/lib/browser');
    const { frontendApplicationModule } = require('@theia/core/lib/browser/frontend-application-module');
    const { messagingFrontendModule } = require('@theia/core/lib/${this.pck.isBrowser()
                ? 'browser/messaging/messaging-frontend-module'
                : 'electron-browser/messaging/electron-messaging-frontend-module'}');
    const { loggerFrontendModule } = require('@theia/core/lib/browser/logger-frontend-module');

    const container = new Container();
    container.load(frontendApplicationModule);
    container.load(messagingFrontendModule);
    container.load(loggerFrontendModule);

    return Promise.resolve()${compiledModuleImports}
        .then(start).catch(reason => {
            console.error('Failed to start the frontend application.');
            if (reason) {
                console.error(reason);
            }
        });

    function load(jsModule) {
        return Promise.resolve(jsModule.default)
            .then(containerModule => container.load(containerModule));
    }

    function start() {
        (window['theia'] = window['theia'] || {}).container = container;
        return container.get(FrontendApplication).start();
    }
});
`;
    }

    protected compileElectronMain(electronMainModules?: Map<string, string>): string {
        return `// @ts-check

require('reflect-metadata');
require('@theia/electron/shared/@electron/remote/main').initialize();

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
    THEIA_BACKEND_MAIN_PATH: resolve(__dirname, '..', 'backend', 'main.js'),
    THEIA_FRONTEND_HTML_PATH: resolve(__dirname, '..', '..', 'lib', 'index.html'),
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

    /** HTML for secondary windows that contain an extracted widget. */
    protected compileSecondaryWindowHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <title>Theia — Secondary Window</title>
    <style>
    html, body {
        overflow: hidden;
        -ms-overflow-style: none;
    }

    body {
        margin: 0;
    }

    html,
    head,
    body,
    .secondary-widget-root,
    #widget-host {
        width: 100% !important;
        height: 100% !important;
    }
    </style>
    <link rel="stylesheet" href="./secondary-window.css">
    <script>
    window.addEventListener('message', e => {
        // Only process messages from Theia main window
        if (e.source === window.opener) {
            // Delegate message to iframe
            document.getElementsByTagName('iframe').item(0).contentWindow.postMessage({ ...e.data }, '*');
        }
    });
    </script>
</head>

<body>
    <div id="widget-host"></div>
</body>

</html>`;
    }

    protected compileSecondaryModuleImports(secondaryWindowModules: Map<string, string>): string {
        const lines = Array.from(secondaryWindowModules.entries())
            .map(([moduleName, path]) => `    container.load(require('${path}').default);`);
        return '\n' + lines.join('\n');
    }

    protected compileSecondaryIndexJs(secondaryWindowModules: Map<string, string>): string {
        const compiledModuleImports = this.compileSecondaryModuleImports(secondaryWindowModules)
            // fix the generated indentation
            .replace(/^    /g, '        ');
        return `\
// @ts-check
require('reflect-metadata');
const { Container } = require('inversify');

const preloader = require('@theia/core/lib/browser/preloader');

module.exports = Promise.resolve().then(() => {
    const { frontendApplicationModule } = require('@theia/core/lib/browser/frontend-application-module');
    const container = new Container();
    container.load(frontendApplicationModule);
    ${compiledModuleImports}
});
`;
    }
}
