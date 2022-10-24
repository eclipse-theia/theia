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

import { AbstractGenerator, GeneratorOptions } from './abstract-generator';
import { existsSync, readFileSync } from 'fs';

export class FrontendGenerator extends AbstractGenerator {

    async generate(options: GeneratorOptions = {}): Promise<void> {
        const frontendModules = this.pck.targetFrontendModules;
        await this.write(this.pck.frontend('index.html'), this.compileIndexHtml(frontendModules));
        await this.write(this.pck.frontend('index.js'), this.compileIndexJs(frontendModules));
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
  <script type="text/javascript" src="./bundle.js" charset="utf-8"></script>
</head>
<script>
fetch(window.location.href, {method:'GET'}).then(res => {
  if (res.headers.has('w-webide-ext')) {
      fetch('/api/v1/echo', { method: 'GET'}).then(res => {
          var userId = 'not_identified';
          if (res.header('w-webide-echo')) {
              var header = res.headers.get('x-webide-echo');
              if (header !== ''){
                  header = header.split('.')[1];
                  header = atob(header);
                  var user = JSON.parse(header);
                  userId  = user.uname;
              }
          }
          var bodyElemnt = document.getElementsByTagName('body')[0];
          var watermarkElement = document.createElement("p");
          watermarkElement.id = 'watermarkId';
          watermarkElement.style['color'] = 'rgba(128, 128, 128, 0.2)';
          watermarkElement.style['left'] = '0';
          watermarkElement.style['width'] = '120%';
          watermarkElement.style['height'] = '100%';
          watermarkElement.style['line-height'] = '7';
          watermarkElement.style['margin'] = '0';
          watermarkElement.style['position'] = 'fixed';
          watermarkElement.style['top'] = '0';
          watermarkElement.style['transform'] = 'rotate(-30deg)';
          watermarkElement.style['transform-origin'] = '0 100%';
          watermarkElement.style['word-spacing'] = '10px';
          watermarkElement.style['z-index'] = '10000';
          watermarkElement.style['pointer-events'] = 'none';
          watermarkElement.style['user-select'] = 'none';
          bodyElemnt.appendChild(watermarkElement);
          
          var watermarkText = '';
          var n = 10000;
          for (var i = 0; i < n; i++) {
              watermarkText += '' +userId;
          }
          document.getElementById('watermarkId').innerHTML = watermarkText;
      });
  }
});
</script>
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

const { ThemeService } = require('@theia/core/lib/browser/theming');
ThemeService.get().loadUserTheme();

const nls = require('@theia/core/lib/browser/nls');

// nls translations MUST be loaded before requiring any code that uses them
module.exports = nls.loadTranslations().then(() => {
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
        (window['theia'] = window['theia'] || {}).container = container;
        return container.get(FrontendApplication).start();
    }
});
`;
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

}
