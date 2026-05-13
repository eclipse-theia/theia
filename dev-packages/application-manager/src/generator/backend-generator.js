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
exports.BackendGenerator = void 0;
var os_1 = require("os");
var abstract_generator_1 = require("./abstract-generator");
var BackendGenerator = /** @class */ (function (_super) {
    __extends(BackendGenerator, _super);
    function BackendGenerator() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    BackendGenerator.prototype.generate = function () {
        return __awaiter(this, void 0, void 0, function () {
            var backendModules;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.pck.isBrowserOnly()) {
                            // no backend generation in case of browser-only target
                            return [2 /*return*/];
                        }
                        backendModules = this.pck.targetBackendModules;
                        return [4 /*yield*/, this.write(this.pck.backend('server.js'), this.compileServer(backendModules))];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.write(this.pck.backend('main.js'), this.compileMain(backendModules))];
                    case 2:
                        _a.sent();
                        if (!this.pck.isElectron()) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.write(this.pck.backend('electron-main.js'), this.compileElectronMain(this.pck.targetElectronMainModules))];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    BackendGenerator.prototype.compileElectronMain = function (electronMainModules) {
        var _a;
        return "// @ts-check\n\nrequire('@theia/core/shared/reflect-metadata');\n".concat(this.emitStartupLogger('Electron main', 'electron main start', { requirePerformance: true }), "\n").concat(this.emitStartupLog('loading modules...'), "\n\n// Workaround for https://github.com/electron/electron/issues/9225. Chrome has an issue where\n// in certain locales (e.g. PL), image metrics are wrongly computed. We explicitly set the\n// LC_NUMERIC to prevent this from happening (selects the numeric formatting category of the\n// C locale, http://en.cppreference.com/w/cpp/locale/LC_categories).\nif (process.env.LC_ALL) {\n    process.env.LC_ALL = 'C';\n}\nprocess.env.LC_NUMERIC = 'C';\n\n(async () => {\n    // Useful for Electron/NW.js apps as GUI apps on macOS doesn't inherit the `$PATH` define\n    // in your dotfiles (.bashrc/.bash_profile/.zshrc/etc).\n    // https://github.com/electron/electron/issues/550#issuecomment-162037357\n    // https://github.com/eclipse-theia/theia/pull/3534#issuecomment-439689082\n    (await require('@theia/core/electron-shared/fix-path')).default();\n\n    const { resolve } = require('path');\n    const theiaAppProjectPath = resolve(__dirname, '..', '..');\n    process.env.THEIA_APP_PROJECT_PATH = theiaAppProjectPath;\n    const { default: electronMainApplicationModule } = require('@theia/core/lib/electron-main/electron-main-application-module');\n    const { ElectronMainApplication, ElectronMainApplicationGlobals } = require('@theia/core/lib/electron-main/electron-main-application');\n    const { Container } = require('@theia/core/shared/inversify');\n    const { app } = require('electron');\n\n    const config = ").concat(this.prettyStringify(this.pck.props.frontend.config), ";\n    const isSingleInstance = ").concat(this.pck.props.backend.config.singleInstance === true ? 'true' : 'false', ";\n\n    if (isSingleInstance && !app.requestSingleInstanceLock(process.argv)) {\n        // There is another instance running, exit now. The other instance will request focus.\n        app.quit();\n        return;\n    }\n\n    const container = new Container();\n    container.load(electronMainApplicationModule);\n    container.bind(ElectronMainApplicationGlobals).toConstantValue({\n        THEIA_APP_PROJECT_PATH: theiaAppProjectPath,\n        THEIA_BACKEND_MAIN_PATH: resolve(__dirname, 'main.js'),\n        THEIA_FRONTEND_HTML_PATH: resolve(__dirname, '..', '..', 'lib', 'frontend', 'index.html'),\n        THEIA_SECONDARY_WINDOW_HTML_PATH: resolve(__dirname, '..', '..', 'lib', 'frontend', 'secondary-window.html')\n    });\n    ").concat(this.emitStartupLog('container created'), "\n\n    function load(raw) {\n        return Promise.resolve(raw.default).then(module =>\n            container.load(module)\n        );\n    }\n\n    async function start() {\n        ").concat(this.emitStartupLog('resolving application'), "\n        const application = container.get(ElectronMainApplication);\n        ").concat(this.emitStartupLog('application resolved'), "\n        await application.start(config);\n    }\n\n    try {\n").concat(Array.from((_a = electronMainModules === null || electronMainModules === void 0 ? void 0 : electronMainModules.values()) !== null && _a !== void 0 ? _a : [], function (jsModulePath) { return "        await load(require('".concat(jsModulePath, "'));"); }).join(os_1.EOL), "\n        ").concat(this.emitStartupLog('modules loaded'), "\n        await start();\n    } catch (reason) {\n        if (typeof reason !== 'number') {\n            console.error('Failed to start the electron application.');\n            if (reason) {\n                console.error(reason);\n            }\n        }\n        app.quit();\n    };\n})();\n");
    };
    BackendGenerator.prototype.compileServer = function (backendModules) {
        return "// @ts-check\nrequire('reflect-metadata');\n".concat(this.emitStartupLogger('Backend server', 'backend process start', { requirePerformance: true }), "\n").concat(this.emitStartupLog('loading modules...')).concat(this.ifElectron("\n\n// Patch electron version if missing, see https://github.com/eclipse-theia/theia/pull/7361#pullrequestreview-377065146\nif (typeof process.versions.electron === 'undefined' && typeof process.env.THEIA_ELECTRON_VERSION === 'string') {\n    process.versions.electron = process.env.THEIA_ELECTRON_VERSION;\n}"), "\n\n// Erase the ELECTRON_RUN_AS_NODE variable from the environment, else Electron apps started using Theia will pick it up.\nif ('ELECTRON_RUN_AS_NODE' in process.env) {\n    delete process.env.ELECTRON_RUN_AS_NODE;\n}\n\nconst path = require('path');\nprocess.env.THEIA_APP_PROJECT_PATH = path.resolve(__dirname, '..', '..')\nconst express = require('@theia/core/shared/express');\nconst { Container } = require('@theia/core/shared/inversify');\nconst { BackendApplication, BackendApplicationServer, CliManager } = require('@theia/core/lib/node');\nconst { backendApplicationModule } = require('@theia/core/lib/node/backend-application-module');\nconst { messagingBackendModule } = require('@theia/core/lib/node/messaging/messaging-backend-module');\nconst { loggerBackendModule } = require('@theia/core/lib/node/logger-backend-module');\n\nconst container = new Container();\ncontainer.load(backendApplicationModule);\ncontainer.load(messagingBackendModule);\ncontainer.load(loggerBackendModule);\n").concat(this.emitStartupLog('container created'), "\n\nfunction defaultServeStatic(app) {\n    app.use(express.static(path.resolve(__dirname, '../../lib/frontend')))\n}\n\nfunction load(raw) {\n    return Promise.resolve(raw).then(\n        module => container.load(module.default)\n    );\n}\n\nasync function start(port, host, argv = process.argv) {\n    if (!container.isBound(BackendApplicationServer)) {\n        container.bind(BackendApplicationServer).toConstantValue({ configure: defaultServeStatic });\n    }\n    let result = undefined;\n    await container.get(CliManager).initializeCli(argv.slice(2),\n        () => {\n            ").concat(this.emitStartupLog('resolving application'), "\n            const application = container.get(BackendApplication);\n            ").concat(this.emitStartupLog('application resolved'), "\n            return application.configured;\n        },\n        async () => {\n            result = container.get(BackendApplication).start(port, host);\n        });\n    if (result) {\n        return result;\n    } else {\n        return Promise.reject(0);\n    }\n}\n\nmodule.exports = async (port, host, argv) => {\n    try {\n").concat(Array.from(backendModules.values(), function (jsModulePath) { return "        await load(require('".concat(jsModulePath, "'));"); }).join(os_1.EOL), "\n        ").concat(this.emitStartupLog('modules loaded'), "\n        return await start(port, host, argv);\n    } catch (error) {\n        if (typeof error !== 'number') {\n            console.error('Failed to start the backend application:');\n            console.error(error);\n            process.exitCode = 1;\n        }\n        throw error;\n    }\n}\n");
    };
    BackendGenerator.prototype.compileMain = function (backendModules) {
        return "// @ts-check\n".concat(this.emitStartupLogger('Backend main', 'backend process start', { requirePerformance: true }), "\n").concat(this.emitStartupLog('entry point loaded'), "\nconst { BackendApplicationConfigProvider } = require('@theia/core/lib/node/backend-application-config-provider');\nconst main = require('@theia/core/lib/node/main');\n\nBackendApplicationConfigProvider.set(").concat(this.prettyStringify(this.pck.props.backend.config), ");\n\nglobalThis.extensionInfo = ").concat(this.prettyStringify(this.pck.extensionPackages.map(function (_a) {
            var name = _a.name, version = _a.version;
            return ({ name: name, version: version });
        })), ";\n\nconst serverModule = require('./server');\nconst serverAddress = main.start(serverModule());\n\nserverAddress.then((addressInfo) => {\n    if (process && process.send && addressInfo) {\n        process.send(addressInfo);\n    }\n});\n\nglobalThis.serverAddress = serverAddress;\n");
    };
    return BackendGenerator;
}(abstract_generator_1.AbstractGenerator));
exports.BackendGenerator = BackendGenerator;
