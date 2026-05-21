"use strict";
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
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FrontendGenerator = void 0;
/* eslint-disable @typescript-eslint/indent */
var os_1 = require("os");
var abstract_generator_1 = require("./abstract-generator");
var fs_1 = require("fs");
var bundler_generator_1 = require("./bundler-generator");
var FrontendGenerator = /** @class */ (function (_super) {
    __extends(FrontendGenerator, _super);
    function FrontendGenerator() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    FrontendGenerator.prototype.generate = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = this.write;
                        _b = [this.pck.frontend('index.html')];
                        return [4 /*yield*/, this.compileIndexHtml(this.pck.targetFrontendModules)];
                    case 1: return [4 /*yield*/, _a.apply(this, _b.concat([_c.sent()]))];
                    case 2:
                        _c.sent();
                        return [4 /*yield*/, this.write(this.pck.frontend('index.js'), this.compileIndexJs(this.pck.targetFrontendModules, this.pck.targetFrontendPreloadModules))];
                    case 3:
                        _c.sent();
                        return [4 /*yield*/, this.write(this.pck.frontend('secondary-window.html'), this.compileSecondaryWindowHtml())];
                    case 4:
                        _c.sent();
                        return [4 /*yield*/, this.write(this.pck.frontend('secondary-index.js'), this.compileSecondaryIndexJs(this.pck.secondaryWindowModules))];
                    case 5:
                        _c.sent();
                        if (!(this.pck.isBrowser() || this.pck.isBrowserOnly())) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.write(this.pck.frontend('manifest.webmanifest'), this.compileWebAppManifest())];
                    case 6:
                        _c.sent();
                        _c.label = 7;
                    case 7:
                        if (!this.pck.isElectron()) return [3 /*break*/, 9];
                        return [4 /*yield*/, this.write(this.pck.frontend('preload.js'), this.compilePreloadJs())];
                    case 8:
                        _c.sent();
                        _c.label = 9;
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    FrontendGenerator.prototype.compileIndexPreload = function (frontendModules) {
        var template = this.pck.props.generator.config.preloadTemplate;
        if (!template) {
            return '';
        }
        // Support path to html file
        if ((0, fs_1.existsSync)(template)) {
            return (0, fs_1.readFileSync)(template).toString();
        }
        return template;
    };
    FrontendGenerator.prototype.compileIndexHtml = function (frontendModules) {
        return __awaiter(this, void 0, void 0, function () {
            var appIcon, htmlSplashClass, _a, _b;
            var _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        appIcon = (_c = this.pck.props.frontend.config.applicationIcon) === null || _c === void 0 ? void 0 : _c.trim();
                        htmlSplashClass = appIcon ? ' class="theia-splash-branded"' : '';
                        _b = (_a = "<!DOCTYPE html>\n<html lang=\"en\"".concat(htmlSplashClass, ">\n\n<head>")).concat;
                        return [4 /*yield*/, this.compileIndexHead(frontendModules)];
                    case 1: return [2 /*return*/, _b.apply(_a, [_d.sent(), "\n</head>\n\n<body>\n    <div class=\"theia-preload\">"]).concat(this.compileIndexPreload(frontendModules), "</div>\n    <script type=\"text/javascript\" src=\"./bundle.js\" charset=\"utf-8\"></script>\n</body>\n\n</html>")];
                }
            });
        });
    };
    FrontendGenerator.prototype.compileIndexHead = function (frontendModules) {
        return __awaiter(this, void 0, void 0, function () {
            var preferEsbuild, appName, appIcon, isWebTarget, iconLines, splashBranding, pwaHead;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, new bundler_generator_1.BundlerGenerator(this.pck, this.options).preferESBuild()];
                    case 1:
                        preferEsbuild = _b.sent();
                        appName = this.pck.props.frontend.config.applicationName;
                        appIcon = (_a = this.pck.props.frontend.config.applicationIcon) === null || _a === void 0 ? void 0 : _a.trim();
                        isWebTarget = this.pck.isBrowser() || this.pck.isBrowserOnly();
                        iconLines = appIcon
                            ? "\n  <meta name=\"application-icon\" content=\"".concat(this.escapeHtmlAttribute(appIcon), "\">\n  <link rel=\"icon\" href=\"").concat(this.escapeHtmlAttribute(appIcon), "\">\n  <link rel=\"apple-touch-icon\" href=\"").concat(this.escapeHtmlAttribute(appIcon), "\">")
                            : '';
                        splashBranding = appIcon ? this.compileSplashBrandingScript() : '';
                        pwaHead = isWebTarget ? this.compilePwaHeadFragment() : '';
                        return [2 /*return*/, "\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content\">".concat(pwaHead, "\n  <meta name=\"application-name\" content=\"").concat(this.escapeHtmlAttribute(appName), "\">").concat(iconLines).concat(splashBranding, "\n  ").concat(preferEsbuild ? '<link rel="stylesheet" href="./bundle.css">' : '', "\n  <title>").concat(this.escapeHtmlAttribute(appName), "</title>")];
                }
            });
        });
    };
    /**
     * Web App Manifest for installable PWA (browser targets only). Icons reuse `applicationIcon`.
     */
    FrontendGenerator.prototype.compileWebAppManifest = function () {
        var _a;
        var appName = this.pck.props.frontend.config.applicationName;
        var appIcon = (_a = this.pck.props.frontend.config.applicationIcon) === null || _a === void 0 ? void 0 : _a.trim();
        var shortName = appName.length > 12 ? appName.slice(0, 12).trimEnd() : appName;
        var manifest = {
            name: appName,
            short_name: shortName,
            display: 'standalone',
            start_url: './',
            scope: './',
            theme_color: FrontendGenerator.PWA_THEME_COLOR_DARK,
            background_color: FrontendGenerator.PWA_THEME_COLOR_DARK
        };
        if (appIcon) {
            var mime_1 = this.inferImageMimeType(appIcon);
            var iconEntry = {
                src: appIcon,
                sizes: '192x192 512x512',
                purpose: 'any maskable'
            };
            if (mime_1 !== undefined) {
                iconEntry.type = mime_1;
            }
            manifest.icons = [iconEntry];
        }
        return JSON.stringify(manifest, undefined, 4) + '\n';
    };
    FrontendGenerator.prototype.inferImageMimeType = function (iconPath) {
        var lower = iconPath.split('?')[0].toLowerCase();
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
    };
    FrontendGenerator.prototype.compilePwaHeadFragment = function () {
        var light = FrontendGenerator.PWA_THEME_COLOR_LIGHT;
        var js = [
            '(function(){',
            "function syncPwaChrome(){var d=window.matchMedia('(prefers-color-scheme: dark)').matches;",
            "var tc=d?".concat(JSON.stringify(FrontendGenerator.PWA_THEME_COLOR_DARK), ":").concat(JSON.stringify(light), ";"),
            "var sb=d?'black-translucent':'default';",
            'var m=document.querySelector(\'meta[name="theme-color"]\');if(m){m.setAttribute(\'content\',tc);}',
            'm=document.querySelector(\'meta[name="apple-mobile-web-app-status-bar-style"]\');if(m){m.setAttribute(\'content\',sb);}',
            '}',
            'syncPwaChrome();',
            'try{window.matchMedia(\'(prefers-color-scheme: dark)\').addEventListener(\'change\',syncPwaChrome);}catch(_){}',
            '})();'
        ].join('');
        return "\n  <link rel=\"manifest\" href=\"./manifest.webmanifest\">\n  <meta name=\"apple-mobile-web-app-capable\" content=\"yes\">\n  <meta name=\"theme-color\" content=\"".concat(light, "\">\n  <meta name=\"apple-mobile-web-app-status-bar-style\" content=\"default\">\n  <script type=\"text/javascript\">").concat(js, "</script>");
    };
    /**
     * Resolves `meta[name="application-icon"]` against `document.baseURI`, then sets `--theia-preload-logo-url`,
     * `--theia-workbench-brand-logo-url` (empty editor watermark), and the favicon link. Relative paths in `url()`
     * inside `bundle.css` would otherwise resolve against the stylesheet URL and can fail for `./media/...`;
     * an absolute URL avoids that.
     */
    FrontendGenerator.prototype.compileSplashBrandingScript = function () {
        var js = [
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
        return "\n  <script type=\"text/javascript\">".concat(js, "</script>");
    };
    FrontendGenerator.prototype.compileIndexJs = function (frontendModules, frontendPreloadModules) {
        var _this = this;
        return "// @ts-check\nrequire('reflect-metadata');\n".concat(this.emitStartupLogger('Frontend', 'frontend page start'), "\n").concat(this.emitStartupLog('loading modules...'), "\nconst { Container } = require('@theia/core/shared/inversify');\nconst { FrontendApplicationConfigProvider } = require('@theia/core/lib/browser/frontend-application-config-provider');\n\nfunction applyApplicationNameFromMeta(cfg) {\n    try {\n        const meta = typeof document !== 'undefined' && document.querySelector('meta[name=\"application-name\"]');\n        const fromMeta = meta && meta.getAttribute('content');\n        if (fromMeta && fromMeta.trim()) {\n            cfg.applicationName = fromMeta.trim();\n        }\n    } catch {\n        /* ignore: meta may be unavailable in non-browser contexts */\n    }\n}\nfunction applyApplicationIconFromMeta(cfg) {\n    try {\n        const meta = typeof document !== 'undefined' && document.querySelector('meta[name=\"application-icon\"]');\n        const fromMeta = meta && meta.getAttribute('content');\n        if (fromMeta && fromMeta.trim()) {\n            cfg.applicationIcon = fromMeta.trim();\n        }\n    } catch {\n        /* ignore: meta may be unavailable in non-browser contexts */\n    }\n}\nconst __theiaFrontendConfig = ").concat(this.prettyStringify(this.pck.props.frontend.config), ";\napplyApplicationNameFromMeta(__theiaFrontendConfig);\napplyApplicationIconFromMeta(__theiaFrontendConfig);\nFrontendApplicationConfigProvider.set(__theiaFrontendConfig);\n\n").concat(this.ifMonaco(function () { return "\nself.MonacoEnvironment = {\n    getWorkerUrl: function (moduleId, label) {\n        return './editor.worker.js';\n    }\n}"; }), "\n\nfunction load(container, jsModule) {\n    return Promise.resolve(jsModule)\n        .then(containerModule => container.load(containerModule.default));\n}\n\nasync function preload(container) {\n    try {\n").concat(Array.from(frontendPreloadModules.values(), function (jsModulePath) { return "        await load(container, ".concat(_this.importOrRequire(), "('").concat(jsModulePath, "'));"); }).join(os_1.EOL), "\n        const { Preloader } = require('@theia/core/lib/browser/preload/preloader');\n        const preloader = container.get(Preloader);\n        await preloader.initialize();\n    } catch (reason) {\n        console.error('Failed to run preload scripts.');\n        if (reason) {\n            console.error(reason);\n        }\n    }\n}\n\nmodule.exports = (async () => {\n    const { messagingFrontendModule } = require('@theia/core/lib/").concat(this.pck.isBrowser() || this.pck.isBrowserOnly()
            ? 'browser/messaging/messaging-frontend-module'
            : 'electron-browser/messaging/electron-messaging-frontend-module', "');\n    const container = new Container();\n    container.load(messagingFrontendModule);\n    ").concat(this.ifBrowserOnly("const { messagingFrontendOnlyModule } = require('@theia/core/lib/browser-only/messaging/messaging-frontend-only-module');\n    container.load(messagingFrontendOnlyModule);"), "\n\n    ").concat(this.emitStartupLog('container created'), "\n\n    await preload(container);\n    ").concat(this.emitStartupLog('preloaded'), "\n\n    ").concat(this.ifMonaco(function () { return "\n    const { MonacoInit } = require('@theia/monaco/lib/browser/monaco-init');\n    "; }), ";\n\n    const { FrontendApplication } = require('@theia/core/lib/browser');\n    const { frontendApplicationModule } = require('@theia/core/lib/browser/frontend-application-module');\n    const { loggerFrontendModule } = require('@theia/core/lib/browser/logger-frontend-module');\n\n    container.load(frontendApplicationModule);\n    ").concat(this.pck.ifBrowserOnly("const { frontendOnlyApplicationModule } = require('@theia/core/lib/browser-only/frontend-only-application-module');\n    container.load(frontendOnlyApplicationModule);"), "\n\n    container.load(loggerFrontendModule);\n    ").concat(this.ifBrowserOnly("const { loggerFrontendOnlyModule } = require('@theia/core/lib/browser-only/logger-frontend-only-module');\n    container.load(loggerFrontendOnlyModule);"), "\n\n    ").concat(this.emitStartupLog('core modules loaded'), "\n\n    try {\n").concat(Array.from(frontendModules.values(), function (jsModulePath) { return "        await load(container, ".concat(_this.importOrRequire(), "('").concat(jsModulePath, "'));"); }).join(os_1.EOL), "\n        ").concat(this.ifMonaco(function () { return "\n        MonacoInit.init(container);\n        "; }), ";\n        ").concat(this.emitStartupLog('modules loaded'), "\n        await start();\n    } catch (reason) {\n        console.error('Failed to start the frontend application.');\n        if (reason) {\n            console.error(reason);\n        }\n    }\n\n    function start() {\n        (window['theia'] = window['theia'] || {}).container = container;\n        ").concat(this.emitStartupLog('resolving application'), "\n        const application = container.get(FrontendApplication);\n        ").concat(this.emitStartupLog('application resolved'), "\n        return application.start();\n    }\n})();\n");
    };
    FrontendGenerator.prototype.importOrRequire = function () {
        return this.options.mode !== 'production' ? 'import' : 'require';
    };
    /** HTML for secondary windows that contain an extracted widget. */
    FrontendGenerator.prototype.compileSecondaryWindowHtml = function () {
        var _a;
        var appIcon = (_a = this.pck.props.frontend.config.applicationIcon) === null || _a === void 0 ? void 0 : _a.trim();
        var iconLines = appIcon
            ? "\n    <meta name=\"application-icon\" content=\"".concat(this.escapeHtmlAttribute(appIcon), "\">\n    <link rel=\"icon\" href=\"").concat(this.escapeHtmlAttribute(appIcon), "\">").concat(this.compileSplashBrandingScript())
            : '';
        return "<!DOCTYPE html>\n<html lang=\"en\">\n\n<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"application-name\" content=\"".concat(this.escapeHtmlAttribute(this.pck.props.frontend.config.applicationName), "\">").concat(iconLines, "\n    <title>").concat(this.pck.props.frontend.config.applicationName, " \u2014 Secondary Window</title>\n    <style>\n    html, body {\n        overflow: hidden;\n        -ms-overflow-style: none;\n    }\n\n    body {\n        margin: 0;\n    }\n\n    html,\n    head,\n    body,\n    .secondary-widget-root,\n    #widget-host {\n        width: 100% !important;\n        height: 100% !important;\n    }\n    </style>\n    <link rel=\"stylesheet\" href=\"./secondary-window.css\">\n</head>\n\n<body>\n    <div id=\"widget-host\"></div>\n</body>\n\n</html>");
    };
    FrontendGenerator.prototype.compileSecondaryIndexJs = function (secondaryWindowModules) {
        return "// @ts-check\nrequire('reflect-metadata');\nconst { Container } = require('@theia/core/shared/inversify');\n\nmodule.exports = Promise.resolve().then(() => {\n    const { frontendApplicationModule } = require('@theia/core/lib/browser/frontend-application-module');\n    const container = new Container();\n    container.load(frontendApplicationModule);\n".concat(Array.from(secondaryWindowModules.values(), function (jsModulePath) { return "    container.load(require('".concat(jsModulePath, "').default);"); }).join(os_1.EOL), "\n});\n");
    };
    FrontendGenerator.prototype.compilePreloadJs = function () {
        return "// @ts-check\n".concat(Array.from(this.pck.preloadModules.values(), function (path) { return "require('".concat(path, "').preload();"); }).join(os_1.EOL), "\n");
    };
    /** Browser/OS chrome color when `prefers-color-scheme: dark` (VS Code editor background). */
    FrontendGenerator.PWA_THEME_COLOR_DARK = '#1e1e1e';
    /** Browser/OS chrome color when `prefers-color-scheme: light`. */
    FrontendGenerator.PWA_THEME_COLOR_LIGHT = '#ffffff';
    return FrontendGenerator;
}(abstract_generator_1.AbstractGenerator));
exports.FrontendGenerator = FrontendGenerator;
