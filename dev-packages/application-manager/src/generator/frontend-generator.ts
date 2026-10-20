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

/* eslint-disable @stylistic/indent */

import { DefaultTheme } from '@theia/application-package/lib/application-props';
import { EOL } from 'os';
import { AbstractGenerator, GeneratorOptions } from './abstract-generator';
import { existsSync, readFileSync } from 'fs';

export class FrontendGenerator extends AbstractGenerator {

    async generate(options?: GeneratorOptions): Promise<void> {
        await this.write(this.pck.frontend('index.html'), await this.compileIndexHtml(this.pck.targetFrontendModules));
        await this.write(this.pck.frontend('index.js'), this.compileIndexJs(this.pck.targetFrontendModules, this.pck.targetFrontendPreloadModules));
        await this.write(this.pck.frontend('secondary-window.html'), this.compileSecondaryWindowHtml());
        await this.write(this.pck.frontend('secondary-index.js'), this.compileSecondaryIndexJs(this.pck.secondaryWindowModules));
        if (this.pck.isElectron()) {
            await this.write(this.pck.frontend('preload.js'), this.compilePreloadJs());
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

    protected async compileIndexHtml(frontendModules: Map<string, string>): Promise<string> {
        const template = this.compileIndexPreload(frontendModules);
        const preload = template
            ? `<div class="theia-preload">${template}</div>`
            : `<div class="theia-preload theia-preload-default">${this.compileIndexSpinner()}</div>
    <script type="text/javascript">${this.compileIndexSkeletonScript()}</script>`;
        return `<!DOCTYPE html>
<html lang="en">

<head>${await this.compileIndexHead(frontendModules)}
</head>

<body>
    ${preload}
    <script type="text/javascript" src="./bundle.js" charset="utf-8"></script>
</body>

</html>`;
    }

    protected async compileIndexHead(frontendModules: Map<string, string>): Promise<string> {
        return `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <style>${this.compileIndexCriticalCss()}</style>
  <link rel="stylesheet" href="./bundle.css">
  <title>${this.pck.props.frontend.config.applicationName}</title>`;
    }

    /**
     * The styles the page needs before `bundle.css` has loaded: the page background and the loading
     * indicator, so that the first paint does not wait for the stylesheet, which carries the icon font.
     * The `.theia-preload` rules match those of `@theia/core`.
     */
    protected compileIndexCriticalCss(): string {
        return `
    html, body { margin: 0; height: 100%; background: var(--theia-editor-background, ${DefaultTheme.defaultBackgroundColor(true)}); }
    @media (prefers-color-scheme: light) { html, body { background: var(--theia-editor-background, ${DefaultTheme.defaultBackgroundColor(false)}); } }
    .theia-preload { position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 50000; background: var(--theia-editor-background); }
    .theia-preload { display: flex; justify-content: center; align-items: center; transition: opacity 0.8s; }
    .theia-preload.theia-hidden { opacity: 0; }
    .theia-preload-spinner { width: 72px; height: 72px; color: #777; animation: theia-preload-rotate 1s linear infinite; }
    @keyframes theia-preload-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .theia-preload-skeleton { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }
    .theia-preload-skeleton > div { position: absolute; }
  `;
    }

    /**
     * The default loading indicator: an inline SVG that does not depend on the icon font.
     */
    protected compileIndexSpinner(): string {
        return '<svg class="theia-preload-spinner" viewBox="0 0 16 16" aria-hidden="true">'
            + '<path fill="currentColor" d="M13.917 7A6.002 6.002 0 0 0 2.083 7H1.071a7.002 7.002 0 0 1 13.858 0h-1.012z"/></svg>';
    }

    /**
     * Draws the workbench skeleton of the last session, stored by `StartupSkeletonContribution` of `@theia/core`
     * under the `theia.startupSkeleton` key, in place of the spinner, and applies the last background colour
     * (`theme.background`, as the theme preload contribution does later) before the bundle runs.
     */
    protected compileIndexSkeletonScript(): string {
        return `
    (function () {
        try {
            var storage = window.localStorage;
            var record = JSON.parse(storage.getItem('theia.startupSkeleton') || 'null');
            var colors = record && record.version === 1 && record.colors || {};
            var layout = record && record.version === 1 && record.layout;
            var background = colors.background || storage.getItem('theme.background')
                || (window.matchMedia('(prefers-color-scheme: dark)').matches
                    ? '${DefaultTheme.defaultBackgroundColor(true)}' : '${DefaultTheme.defaultBackgroundColor(false)}');
            document.documentElement.style.setProperty('--theia-editor-background', background);
            var preload = document.querySelector('.theia-preload.theia-preload-default');
            if (!preload || !layout) {
                return;
            }
            var skeleton = document.createElement('div');
            skeleton.className = 'theia-preload-skeleton';
            function part(color, style) {
                if (typeof color === 'string') {
                    var div = document.createElement('div');
                    div.setAttribute('style', style + 'background:' + color + ';');
                    skeleton.appendChild(div);
                }
            }
            var top = layout.top || 0, status = layout.statusBar || 0;
            var leftBar = layout.leftBar || 0, left = layout.left || 0, rightBar = layout.rightBar || 0, right = layout.right || 0;
            var middle = 'top:' + top + 'px;bottom:' + status + 'px;';
            if (top) { part(colors.titleBar, 'top:0;left:0;right:0;height:' + top + 'px;'); }
            if (status) { part(colors.statusBar, 'bottom:0;left:0;right:0;height:' + status + 'px;'); }
            if (leftBar) { part(colors.activityBar, middle + 'left:0;width:' + leftBar + 'px;'); }
            if (left) { part(colors.sideBar, middle + 'left:' + leftBar + 'px;width:' + left + 'px;'); }
            if (rightBar) { part(colors.activityBar, middle + 'right:0;width:' + rightBar + 'px;'); }
            if (right) { part(colors.sideBar, middle + 'right:' + rightBar + 'px;width:' + right + 'px;'); }
            if (layout.bottom) {
                part(colors.panel, 'bottom:' + status + 'px;left:' + (leftBar + left) + 'px;right:' + (rightBar + right) + 'px;height:' + layout.bottom + 'px;');
            }
            // Keep the spinner, centered in the editor area of the skeleton.
            var editorArea = document.createElement('div');
            editorArea.setAttribute('style', 'top:' + top + 'px;bottom:' + (status + (layout.bottom || 0)) + 'px;'
                + 'left:' + (leftBar + left) + 'px;right:' + (rightBar + right) + 'px;display:flex;align-items:center;justify-content:center;');
            var spinner = preload.querySelector('.theia-preload-spinner');
            if (spinner) {
                editorArea.appendChild(spinner);
            }
            skeleton.appendChild(editorArea);
            preload.replaceChildren(skeleton);
        } catch (error) {
            // No skeleton: the spinner stays.
        }
    })();
  `;
    }

    /**
     * Everything the emitted code requires ahead of the `await preload(container)` that ends the
     * preload phase runs while the localization data is still missing. A module of '@theia/core'
     * required there has to be listed in 'dev-packages/private-eslint-plugin/util/preload-phase-modules.json',
     * which is what the '@theia/preload-localization-check' ESLint rule checks such modules against.
     * The test of that list runs this generator and fails when the two drift apart.
     */
    protected compileIndexJs(frontendModules: Map<string, string>, frontendPreloadModules: Map<string, string>): string {
        return `\
// @ts-check
require('reflect-metadata');
${this.emitStartupLogger('Frontend', 'frontend page start')}
${this.emitStartupLog('loading modules...')}
const { Container } = require('@theia/core/shared/inversify');
const { FrontendApplicationConfigProvider } = require('@theia/core/lib/browser/frontend-application-config-provider');

FrontendApplicationConfigProvider.set(${this.prettyStringify(this.pck.props.frontend.config)});

${this.ifMonaco(() => `
self.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
        return './editor.worker.js';
    }
}`)}

function load(container, jsModule) {
    return Promise.resolve(jsModule)
        .then(containerModule => container.load(containerModule.default));
}

async function preload(container) {
    try {
${Array.from(frontendPreloadModules.values(), jsModulePath => `\
        await load(container, ${this.importOrRequire()}('${jsModulePath}'));`).join(EOL)}
        const { Preloader } = require('@theia/core/lib/browser/preload/preloader');
        const preloader = container.get(Preloader);
        await preloader.initialize();
    } catch (reason) {
        console.error('Failed to run preload scripts.');
        if (reason) {
            console.error(reason);
        }
    }
}

module.exports = (async () => {
    const { messagingFrontendModule } = require('@theia/core/lib/${this.pck.isBrowser() || this.pck.isBrowserOnly()
                ? 'browser/messaging/messaging-frontend-module'
                : 'electron-browser/messaging/electron-messaging-frontend-module'}');
    const container = new Container();
    container.load(messagingFrontendModule);
    ${this.ifBrowserOnly(`const { messagingFrontendOnlyModule } = require('@theia/core/lib/browser-only/messaging/messaging-frontend-only-module');
    container.load(messagingFrontendOnlyModule);`)}

    ${this.emitStartupLog('container created')}

    await preload(container);
    ${this.emitStartupLog('preloaded')}

    ${this.ifMonaco(() => `
    const { MonacoInit } = require('@theia/monaco/lib/browser/monaco-init');
    `)};

    const { FrontendApplication } = require('@theia/core/lib/browser');
    const { frontendApplicationModule } = require('@theia/core/lib/browser/frontend-application-module');
    const { loggerFrontendModule } = require('@theia/core/lib/browser/logger-frontend-module');

    container.load(frontendApplicationModule);
    ${this.pck.ifBrowserOnly(`const { frontendOnlyApplicationModule } = require('@theia/core/lib/browser-only/frontend-only-application-module');
    container.load(frontendOnlyApplicationModule);`)}

    container.load(loggerFrontendModule);
    ${this.ifBrowserOnly(`const { loggerFrontendOnlyModule } = require('@theia/core/lib/browser-only/logger-frontend-only-module');
    container.load(loggerFrontendOnlyModule);`)}

    ${this.emitStartupLog('core modules loaded')}

    try {
${Array.from(frontendModules.values(), jsModulePath => `\
        await load(container, ${this.importOrRequire()}('${jsModulePath}'));`).join(EOL)}
        ${this.ifMonaco(() => `
        MonacoInit.init(container);
        `)};
        ${this.emitStartupLog('modules loaded')}
        await start();
    } catch (reason) {
        console.error('Failed to start the frontend application.');
        if (reason) {
            console.error(reason);
        }
    }

    function start() {
        (window['theia'] = window['theia'] || {}).container = container;
        ${this.emitStartupLog('resolving application')}
        const application = container.get(FrontendApplication);
        ${this.emitStartupLog('application resolved')}
        return application.start();
    }
})();
`;
    }

    protected importOrRequire(): string {
        return this.options.mode !== 'production' ? 'import' : 'require';
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
</head>

<body>
    <div id="widget-host"></div>
</body>

</html>`;
    }

    protected compileSecondaryIndexJs(secondaryWindowModules: Map<string, string>): string {
        return `\
// @ts-check
require('reflect-metadata');
const { Container } = require('@theia/core/shared/inversify');

module.exports = Promise.resolve().then(() => {
    const { frontendApplicationModule } = require('@theia/core/lib/browser/frontend-application-module');
    const container = new Container();
    container.load(frontendApplicationModule);
${Array.from(secondaryWindowModules.values(), jsModulePath => `\
    container.load(require('${jsModulePath}').default);`).join(EOL)}
});
`;
    }

    compilePreloadJs(): string {
        return `\
// @ts-check
${Array.from(this.pck.preloadModules.values(), path => `require('${path}').preload();`).join(EOL)}
`;
    }
}
