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
        return `<!DOCTYPE html>
<html lang="en">

<head>${await this.compileIndexHead(frontendModules)}
</head>

<body>
    <div class="theia-preload">${this.compileIndexPreload(frontendModules)}</div>
    <script type="text/javascript" src="./bundle.js" charset="utf-8"></script>
</body>

</html>`;
    }

    protected async compileIndexHead(frontendModules: Map<string, string>): Promise<string> {
        return `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <link rel="stylesheet" href="./bundle.css">
  <title>${this.pck.props.frontend.config.applicationName}</title>`;
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
import 'reflect-metadata';
import { Container } from '@theia/core/shared/inversify';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
${this.emitStartupLogger('Frontend', 'frontend page start')}
${this.emitStartupLog('loading modules...')}

FrontendApplicationConfigProvider.set(${this.prettyStringify(this.pck.props.frontend.config)});

${this.ifMonaco(() => `
self.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
        return './editor.worker.js';
    }
}`)}

/**
 * Logs how long a step of the start-up took, in the format of the \`Stopwatch\`, and records it as a user timing
 * measure, so that it shows both in the start-up reports and in a performance trace.
 */
function measureStartup(activity, startTime) {
    const endTime = performance.now();
    performance.measure(\`Frontend \${activity}\`, { start: startTime, end: endTime });
    console.debug(\`Frontend \${activity}: \${(endTime - startTime).toFixed(1)} ms [\${(endTime / 1000).toFixed(3)} s since frontend page start]\`);
}

let taskStartTime = performance.now();

/**
 * Yields to the event loop when the current task has run for longer than ${this.moduleLoadingTaskBudget()} ms, so that the page can
 * paint and handle events between the modules instead of being blocked until all of them are loaded.
 */
function yieldIfDue() {
    if (performance.now() - taskStartTime < ${this.moduleLoadingTaskBudget()}) {
        return undefined;
    }
    const scheduler = self['scheduler'];
    const yielded = scheduler && typeof scheduler.yield === 'function'
        ? scheduler.yield()
        : new Promise(resolve => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => {
                channel.port1.close();
                resolve(undefined);
            };
            channel.port2.postMessage(undefined);
        });
    return yielded.then(() => {
        taskStartTime = performance.now();
    });
}

/**
 * Loads a container module and measures it. The time includes the evaluation of every module that it is the first to require.
 */
async function load(container, name, loadModule) {
    const startTime = performance.now();
    const containerModule = await loadModule();
    container.load(containerModule.default);
    measureStartup(\`module \${name}\`, startTime);
    await yieldIfDue();
}

function reportError(message, reason) {
    console.error(message);
    if (reason) {
        console.error(reason);
    }
}

/**
 * Loads the \`frontendPreload\` modules and runs the \`Preloader\`.
 * Resolves to \`false\` if the frontend cannot start.
 */
async function preload(container) {
    let preloadModulesLoaded = false;
    try {
${Array.from(frontendPreloadModules.values(), jsModulePath => `\
        await load(container, '${jsModulePath}', () => import('${jsModulePath}'));`).join(EOL)}
        preloadModulesLoaded = true;
    } catch (reason) {
        reportError('Failed to run preload scripts.', reason);
    }
${this.ifElectron(`
    // The window loads while the backend is still starting, and the Preloader makes the first connection to it.
    // The port is resolved once the preload modules are loaded, so that they can rebind the resolver.
    try {
        const { ElectronBackendPortResolver } = await import('@theia/core/lib/electron-browser/messaging/electron-backend-port-resolver');
        await container.get(ElectronBackendPortResolver).resolve();
        ${this.emitStartupLog('backend port resolved')}
    } catch (reason) {
        reportError('Failed to resolve the backend port.', reason);
        return false;
    }
`)}
    if (preloadModulesLoaded) {
        try {
            const { Preloader } = await import('@theia/core/lib/browser/preload/preloader');
            const preloader = container.get(Preloader);
            await preloader.initialize();
        } catch (reason) {
            reportError('Failed to run preload scripts.', reason);
        }
    }
    return true;
}

export default (async () => {
    const { messagingFrontendModule } = await import('@theia/core/lib/${this.pck.isBrowser() || this.pck.isBrowserOnly()
                ? 'browser/messaging/messaging-frontend-module'
                : 'electron-browser/messaging/electron-messaging-frontend-module'}');
    const container = new Container();
    container.load(messagingFrontendModule);
    ${this.ifBrowserOnly(`const { messagingFrontendOnlyModule } = await import('@theia/core/lib/browser-only/messaging/messaging-frontend-only-module');
    container.load(messagingFrontendOnlyModule);`)}

    ${this.emitStartupLog('container created')}

    const preloadStartTime = performance.now();
    if (!await preload(container)) {
        return;
    }
    measureStartup('preload', preloadStartTime);
    ${this.emitStartupLog('preloaded')}

    ${this.ifMonaco(() => `
    const monacoStartTime = performance.now();
    const { MonacoInit } = await import('@theia/monaco/lib/browser/monaco-init');
    measureStartup('Monaco module', monacoStartTime);
    await yieldIfDue();
    `)};

    const coreModulesStartTime = performance.now();
    const { FrontendApplication } = await import('@theia/core/lib/browser');
    const { frontendApplicationModule } = await import('@theia/core/lib/browser/frontend-application-module');
    const { loggerFrontendModule } = await import('@theia/core/lib/browser/logger-frontend-module');

    container.load(frontendApplicationModule);
    ${this.pck.ifBrowserOnly(`const { frontendOnlyApplicationModule } = await import('@theia/core/lib/browser-only/frontend-only-application-module');
    container.load(frontendOnlyApplicationModule);`)}

    container.load(loggerFrontendModule);
    ${this.ifBrowserOnly(`const { loggerFrontendOnlyModule } = await import('@theia/core/lib/browser-only/logger-frontend-only-module');
    container.load(loggerFrontendOnlyModule);`)}

    measureStartup('core modules', coreModulesStartTime);
    ${this.emitStartupLog('core modules loaded')}

    try {
        await yieldIfDue();
        const modulesStartTime = performance.now();
${Array.from(frontendModules.values(), jsModulePath => `\
        await load(container, '${jsModulePath}', () => import('${jsModulePath}'));`).join(EOL)}
        ${this.ifMonaco(() => `
        MonacoInit.init(container);
        `)};
        measureStartup('modules', modulesStartTime);
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
        const resolveStartTime = performance.now();
        const application = container.get(FrontendApplication);
        measureStartup('application resolution', resolveStartTime);
        ${this.emitStartupLog('application resolved')}
        return application.start();
    }
})();
`;
    }

    /**
     * The time in milliseconds after which the loading of the frontend modules yields to the event loop.
     * Loading a module is not interrupted, so a task can run longer when a module takes longer to load.
     */
    protected moduleLoadingTaskBudget(): number {
        return 50;
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
        display: flex;
        flex-direction: column;
    }

    html,
    head,
    body {
        width: 100% !important;
        height: 100% !important;
    }

    #theia-top-panel {
        flex: 0 0 auto;
    }

    #theia-top-panel:empty {
        display: none;
    }

    #widget-host {
        width: 100% !important;
        flex: 1 1 auto;
        overflow: hidden;
    }

    .secondary-widget-root {
        width: 100% !important;
        height: 100% !important;
    }
    </style>
    <link rel="stylesheet" href="./bundle.css">
    <link rel="stylesheet" href="./secondary-window.css">
</head>

<body>
    <div id="theia-top-panel"></div>
    <div id="widget-host"></div>
</body>

</html>`;
    }

    protected compileSecondaryIndexJs(secondaryWindowModules: Map<string, string>): string {
        return `\
// @ts-check
import 'reflect-metadata';
import { Container } from '@theia/core/shared/inversify';

export default (async () => {
    const { frontendApplicationModule } = await import('@theia/core/lib/browser/frontend-application-module');
    const container = new Container();
    container.load(frontendApplicationModule);
${Array.from(secondaryWindowModules.values(), jsModulePath => `\
    container.load((await import('${jsModulePath}')).default);`).join(EOL)}
})();
`;
    }

    compilePreloadJs(): string {
        const preloadModules = Array.from(this.pck.preloadModules.values());
        return `\
// @ts-check
${preloadModules.map((path, index) => `import { preload as preload${index} } from '${path}';`).join(EOL)}

${preloadModules.map((_, index) => `preload${index}();`).join(EOL)}
`;
    }
}
