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

/* eslint-disable @typescript-eslint/indent */

import { EOL } from 'os';
import { AbstractGenerator, GeneratorOptions } from './abstract-generator';
import { existsSync, readFileSync } from 'fs';
import { BundlerGenerator } from './bundler-generator';

interface WebAppManifestIcon {
    readonly src: string;
    readonly sizes: string;
    readonly type?: string;
    readonly purpose?: string;
}

interface PwaManifestConfig {
    readonly name?: string;
    readonly shortName?: string;
    readonly display?: string;
    readonly startUrl?: string;
    readonly scope?: string;
    readonly themeColor?: string;
    readonly backgroundColor?: string;
    readonly icons?: readonly WebAppManifestIcon[];
    readonly preferRelatedApplications?: boolean;
}

export class FrontendGenerator extends AbstractGenerator {

    /** Browser/OS chrome color when `prefers-color-scheme: dark` (VS Code editor background). */
    protected static readonly PWA_THEME_COLOR_DARK = '#1e1e1e';
    /** Browser/OS chrome color when `prefers-color-scheme: light`. */
    protected static readonly PWA_THEME_COLOR_LIGHT = '#ffffff';

    async generate(options?: GeneratorOptions): Promise<void> {
        await this.write(this.pck.frontend('index.html'), await this.compileIndexHtml(this.pck.targetFrontendModules));
        await this.write(this.pck.frontend('index.js'), this.compileIndexJs(this.pck.targetFrontendModules, this.pck.targetFrontendPreloadModules));
        await this.write(this.pck.frontend('secondary-window.html'), this.compileSecondaryWindowHtml());
        await this.write(this.pck.frontend('secondary-index.js'), this.compileSecondaryIndexJs(this.pck.secondaryWindowModules));
        if (this.pck.isBrowser() || this.pck.isBrowserOnly()) {
            await this.write(this.pck.frontend('manifest.webmanifest'), this.compileWebAppManifest());
        }
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
        const appIcon = this.pck.props.frontend.config.applicationIcon?.trim();
        const htmlSplashClass = appIcon ? ' class="theia-splash-branded"' : '';
        return `<!DOCTYPE html>
<html lang="en"${htmlSplashClass}>

<head>${await this.compileIndexHead(frontendModules)}
</head>

<body>
    <div class="theia-preload">${this.compileIndexPreload(frontendModules)}</div>
    <script type="text/javascript" src="./bundle.js" charset="utf-8"></script>
</body>

</html>`;
    }

    protected async compileIndexHead(frontendModules: Map<string, string>): Promise<string> {
        const preferEsbuild = await new BundlerGenerator(this.pck, this.options).preferESBuild();
        const appName = this.pck.props.frontend.config.applicationName;
        const appIcon = this.pck.props.frontend.config.applicationIcon?.trim();
        const isWebTarget = this.pck.isBrowser() || this.pck.isBrowserOnly();
        const appleTouchIcon = this.resolveAppleTouchIcon(appIcon);
        const iconLines = appIcon || appleTouchIcon
            ? `
  ${appIcon ? `<meta name="application-icon" content="${this.escapeHtmlAttribute(appIcon)}">
  <link rel="icon" href="${this.escapeHtmlAttribute(appIcon)}">` : ''}
  ${appleTouchIcon ? `<link rel="apple-touch-icon" href="${this.escapeHtmlAttribute(appleTouchIcon)}">` : ''}`
            : '';
        const splashBranding = appIcon ? this.compileSplashBrandingScript() : '';
        const pwaHead = isWebTarget ? this.compilePwaHeadFragment() : '';
        return `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${pwaHead}
  <meta name="application-name" content="${this.escapeHtmlAttribute(appName)}">${iconLines}${splashBranding}
  ${preferEsbuild ? '<link rel="stylesheet" href="./bundle.css">' : ''}
  <title>${this.escapeHtmlAttribute(appName)}</title>`;
    }

    /**
     * Web App Manifest for installable PWA (browser targets only).
     */
    protected compileWebAppManifest(): string {
        const pwaConfig = this.getPwaManifestConfig();
        const appName = pwaConfig?.name ?? this.pck.props.frontend.config.applicationName;
        const appIcon = this.pck.props.frontend.config.applicationIcon?.trim();
        const shortName = pwaConfig?.shortName ?? (appName.length > 12 ? appName.slice(0, 12).trimEnd() : appName);
        const manifest: Record<string, unknown> = {
            name: appName,
            short_name: shortName,
            display: pwaConfig?.display ?? 'standalone',
            start_url: pwaConfig?.startUrl ?? './',
            scope: pwaConfig?.scope ?? './',
            theme_color: pwaConfig?.themeColor ?? FrontendGenerator.PWA_THEME_COLOR_DARK,
            background_color: pwaConfig?.backgroundColor ?? FrontendGenerator.PWA_THEME_COLOR_DARK
        };
        if (pwaConfig?.preferRelatedApplications !== undefined) {
            manifest.prefer_related_applications = pwaConfig.preferRelatedApplications;
        }
        if (pwaConfig?.icons?.length) {
            manifest.icons = pwaConfig.icons;
        } else if (appIcon) {
            const mime = this.inferImageMimeType(appIcon);
            const iconEntry: { src: string; sizes: string; type?: string; purpose: string } = {
                src: appIcon,
                sizes: '192x192 512x512',
                purpose: 'any maskable'
            };
            if (mime !== undefined) {
                iconEntry.type = mime;
            }
            manifest.icons = [iconEntry];
        }
        return JSON.stringify(manifest, undefined, 4) + '\n';
    }

    protected getPwaManifestConfig(): PwaManifestConfig | undefined {
        return this.pck.props.frontend.config.pwa as PwaManifestConfig | undefined;
    }

    protected resolveAppleTouchIcon(appIcon: string | undefined): string | undefined {
        const icons = this.getPwaManifestConfig()?.icons;
        const pngIcon = icons?.find(icon => icon.type === 'image/png' && /(?:^|\s)(180x180|192x192|512x512)(?:\s|$)/.test(icon.sizes));
        return pngIcon?.src ?? appIcon;
    }

    protected inferImageMimeType(iconPath: string): string | undefined {
        const lower = iconPath.split('?')[0].toLowerCase();
        if (lower.endsWith('.svg')) {
            return 'image/svg+xml';
        }
        if (lower.endsWith('.png')) {
            return 'image/png';
        }
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
            return 'image/jpeg';
        }
        if (lower.endsWith('.webp')) {
            return 'image/webp';
        }
        if (lower.endsWith('.ico')) {
            return 'image/x-icon';
        }
        return undefined;
    }

    protected compilePwaHeadFragment(): string {
        const light = FrontendGenerator.PWA_THEME_COLOR_LIGHT;
        const js = [
            '(function(){',
            `function syncPwaChrome(){var d=window.matchMedia('(prefers-color-scheme: dark)').matches;`,
            `var tc=d?${JSON.stringify(FrontendGenerator.PWA_THEME_COLOR_DARK)}:${JSON.stringify(light)};`,
            `var sb=d?'black-translucent':'default';`,
            'var m=document.querySelector(\'meta[name="theme-color"]\');if(m){m.setAttribute(\'content\',tc);}',
            'm=document.querySelector(\'meta[name="apple-mobile-web-app-status-bar-style"]\');if(m){m.setAttribute(\'content\',sb);}',
            '}',
            'syncPwaChrome();',
            'try{window.matchMedia(\'(prefers-color-scheme: dark)\').addEventListener(\'change\',syncPwaChrome);}catch(_){}',
            '})();'
        ].join('');
        return `
  <link rel="manifest" href="./manifest.webmanifest">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="theme-color" content="${light}">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <script type="text/javascript">${js}</script>`;
    }

    /**
     * Resolves `meta[name="application-icon"]` against `document.baseURI`, then sets `--theia-preload-logo-url`,
     * `--theia-workbench-brand-logo-url` (empty editor watermark), and the favicon link. Relative paths in `url()`
     * inside `bundle.css` would otherwise resolve against the stylesheet URL and can fail for `./media/...`;
     * an absolute URL avoids that.
     */
    protected compileSplashBrandingScript(): string {
        const js = [
            '(function(){try{',
            'var m=document.querySelector(\'meta[name="application-icon"]\');',
            'var r=m&&m.getAttribute(\'content\');',
            'if(!r)return;',
            'var h=r.trim();',
            'if(!h)return;',
            'var u=(/^https?:\\/\\//i.test(h)||h.startsWith(\'data:\')||h.startsWith(\'/\'))?h:new URL(h,document.baseURI).href;',
            'document.documentElement.classList.add(\'theia-splash-branded\');',
            'document.documentElement.style.setProperty(\'--theia-preload-spinner-content\',\'none\');',
            'document.documentElement.style.setProperty(\'--theia-preload-spinner-animation\',\'none\');',
            'document.documentElement.style.setProperty(\'--theia-preload-logo-url\',\'url(\' + JSON.stringify(u) + \')\');',
            'document.documentElement.style.setProperty(\'--theia-workbench-brand-logo-url\',\'url(\' + JSON.stringify(u) + \')\');',
            'var l=document.querySelector(\'link[rel="icon"]\');',
            'if(l){l.setAttribute(\'href\',u);}',
            '}catch(_){}})();'
        ].join('');
        return `\n  <script type="text/javascript">${js}</script>`;
    }

    protected compileIndexJs(frontendModules: Map<string, string>, frontendPreloadModules: Map<string, string>): string {
        return `\
// @ts-check
require('reflect-metadata');
${this.emitStartupLogger('Frontend', 'frontend page start')}
${this.emitStartupLog('loading modules...')}
const { Container } = require('@theia/core/shared/inversify');
const { FrontendApplicationConfigProvider } = require('@theia/core/lib/browser/frontend-application-config-provider');

function applyApplicationNameFromMeta(cfg) {
    try {
        const meta = typeof document !== 'undefined' && document.querySelector('meta[name="application-name"]');
        const fromMeta = meta && meta.getAttribute('content');
        if (fromMeta && fromMeta.trim()) {
            cfg.applicationName = fromMeta.trim();
        }
    } catch {
        /* ignore: meta may be unavailable in non-browser contexts */
    }
}
function applyApplicationIconFromMeta(cfg) {
    try {
        const meta = typeof document !== 'undefined' && document.querySelector('meta[name="application-icon"]');
        const fromMeta = meta && meta.getAttribute('content');
        if (fromMeta && fromMeta.trim()) {
            cfg.applicationIcon = fromMeta.trim();
        }
    } catch {
        /* ignore: meta may be unavailable in non-browser contexts */
    }
}
const __theiaFrontendConfig = ${this.prettyStringify(this.pck.props.frontend.config)};
applyApplicationNameFromMeta(__theiaFrontendConfig);
applyApplicationIconFromMeta(__theiaFrontendConfig);
FrontendApplicationConfigProvider.set(__theiaFrontendConfig);

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
        const appIcon = this.pck.props.frontend.config.applicationIcon?.trim();
        const iconLines = appIcon
            ? `
    <meta name="application-icon" content="${this.escapeHtmlAttribute(appIcon)}">
    <link rel="icon" href="${this.escapeHtmlAttribute(appIcon)}">${this.compileSplashBrandingScript()}`
            : '';
        return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="application-name" content="${this.escapeHtmlAttribute(this.pck.props.frontend.config.applicationName)}">${iconLines}
    <title>${this.pck.props.frontend.config.applicationName} — Secondary Window</title>
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
