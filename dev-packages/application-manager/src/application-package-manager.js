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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplicationPackageManager = void 0;
var path = require("path");
var fs = require("fs-extra");
var semver = require("semver");
var application_package_1 = require("@theia/application-package");
var generator_1 = require("./generator");
var application_process_1 = require("./application-process");
var AbortError = /** @class */ (function (_super) {
    __extends(AbortError, _super);
    function AbortError() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var _this = _super.apply(this, args) || this;
        Object.setPrototypeOf(_this, AbortError.prototype);
        return _this;
    }
    return AbortError;
}(Error));
var ApplicationPackageManager = /** @class */ (function () {
    function ApplicationPackageManager(options) {
        this.pck = new application_package_1.ApplicationPackage(options);
        this.process = new application_process_1.ApplicationProcess(this.pck, options.projectPath);
        this.__process = new application_process_1.ApplicationProcess(this.pck, path.join(__dirname, '..'));
    }
    ApplicationPackageManager.defineGeneratorOptions = function (cli) {
        return cli
            .option('mode', {
            description: 'Generation mode to use',
            choices: ['development', 'production'],
            default: 'production',
        })
            .option('split-frontend', {
            description: 'Split frontend modules into separate chunks. By default enabled in the `development` mode and disabled in the `production` mode.',
            type: 'boolean'
        });
    };
    ApplicationPackageManager.prototype.remove = function (fsPath) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fs.pathExists(fsPath)];
                    case 1:
                        if (!_a.sent()) return [3 /*break*/, 3];
                        return [4 /*yield*/, fs.remove(fsPath)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    ApplicationPackageManager.prototype.clean = function () {
        return __awaiter(this, void 0, void 0, function () {
            var bundlerGenerator;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        bundlerGenerator = new generator_1.BundlerGenerator(this.pck);
                        return [4 /*yield*/, Promise.all([
                                this.remove(this.pck.lib()),
                                this.remove(this.pck.srcGen()),
                                this.remove(bundlerGenerator.genConfigPath),
                                this.remove(bundlerGenerator.genNodeConfigPath),
                                this.remove(bundlerGenerator.genESBuildBrowserPath),
                                this.remove(bundlerGenerator.genESBuildNodePath),
                                this.remove(bundlerGenerator.genESBuildElectronPath),
                            ])];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ApplicationPackageManager.prototype.prepare = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.pck.isElectron()) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.prepareElectron()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    ApplicationPackageManager.prototype.generate = function () {
        return __awaiter(this, arguments, void 0, function (options) {
            var error_1;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.prepare()];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        if (error_1 instanceof AbortError) {
                            console.warn(error_1.message);
                            process.exit(1);
                        }
                        throw error_1;
                    case 3: return [4 /*yield*/, Promise.all([
                            new generator_1.BundlerGenerator(this.pck, options).generate(),
                            new generator_1.BackendGenerator(this.pck, options).generate(),
                            new generator_1.FrontendGenerator(this.pck, options).generate(),
                        ])];
                    case 4:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ApplicationPackageManager.prototype.copy = function () {
        return __awaiter(this, void 0, void 0, function () {
            var webManifest, secondaryHtml, appMedia;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fs.ensureDir(this.pck.lib('frontend'))];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, fs.copy(this.pck.frontend('index.html'), this.pck.lib('frontend', 'index.html'))];
                    case 2:
                        _a.sent();
                        webManifest = this.pck.frontend('manifest.webmanifest');
                        return [4 /*yield*/, fs.pathExists(webManifest)];
                    case 3:
                        if (!_a.sent()) return [3 /*break*/, 5];
                        return [4 /*yield*/, fs.copy(webManifest, this.pck.lib('frontend', 'manifest.webmanifest'))];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5:
                        secondaryHtml = this.pck.frontend('secondary-window.html');
                        return [4 /*yield*/, fs.pathExists(secondaryHtml)];
                    case 6:
                        if (!_a.sent()) return [3 /*break*/, 8];
                        return [4 /*yield*/, fs.copy(secondaryHtml, this.pck.lib('frontend', 'secondary-window.html'))];
                    case 7:
                        _a.sent();
                        _a.label = 8;
                    case 8:
                        appMedia = this.pck.path('media');
                        return [4 /*yield*/, fs.pathExists(appMedia)];
                    case 9:
                        if (!_a.sent()) return [3 /*break*/, 11];
                        return [4 /*yield*/, fs.copy(appMedia, this.pck.lib('frontend', 'media'))];
                    case 10:
                        _a.sent();
                        _a.label = 11;
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Regenerate static frontend files (HTML/entry) from the current application props (including `.env`)
     * and copy them into `lib/frontend`. Does not run webpack. After one full `build`, each `start` refreshes
     * HTML (and meta) so `IDE_APPLICATION_NAME` / `IDE_APPLICATION_ICON` apply without rebundling; optional
     * `media/` next to `package.json` is synced to `lib/frontend/media` for paths like `./media/icon.png`.
     * Browser targets also refresh `manifest.webmanifest` for the PWA.
     */
    ApplicationPackageManager.prototype.refreshFrontendStaticFiles = function () {
        return __awaiter(this, arguments, void 0, function (options) {
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, new generator_1.FrontendGenerator(this.pck, options).generate()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.copy()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ApplicationPackageManager.prototype.build = function () {
        return __awaiter(this, arguments, void 0, function (args, options) {
            var bundlerGenerator, process_1;
            if (args === void 0) { args = []; }
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        bundlerGenerator = new generator_1.BundlerGenerator(this.pck);
                        return [4 /*yield*/, this.generate(options)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.copy()];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, bundlerGenerator.preferESBuild()];
                    case 3:
                        if (_a.sent()) {
                            process_1 = this.__process.spawn('node', __spreadArray([bundlerGenerator.esbuildPath], args, true));
                            return [2 /*return*/, this.__process.promisify('esbuild', process_1)];
                        }
                        else {
                            return [2 /*return*/, this.__process.run('webpack', args)];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    ApplicationPackageManager.prototype.start = function (args) {
        if (args === void 0) { args = []; }
        if (this.pck.isElectron()) {
            return this.startElectron(args);
        }
        else if (this.pck.isBrowserOnly()) {
            return this.startBrowserOnly(args);
        }
        return this.startBrowser(args);
    };
    ApplicationPackageManager.prototype.startBrowserOnly = function (args) {
        var _a = this.adjustBrowserOnlyArgs(args), command = _a.command, mainArgs = _a.mainArgs, options = _a.options;
        return this.__process.spawnBin(command, mainArgs, options);
    };
    ApplicationPackageManager.prototype.adjustBrowserOnlyArgs = function (args) {
        var _a = this.adjustArgs(args), mainArgs = _a.mainArgs, options = _a.options;
        // first parameter: path to generated frontend
        // second parameter: disable cache to support watching
        mainArgs = __spreadArray(['lib/frontend', '-c-1'], mainArgs, true);
        var portIndex = mainArgs.findIndex(function (v) { return v.startsWith('--port'); });
        if (portIndex === -1) {
            mainArgs.push('--port=3000');
        }
        return { command: 'http-server', mainArgs: mainArgs, options: options };
    };
    ApplicationPackageManager.prototype.startElectron = function (args) {
        // If possible, pass the project root directory to electron rather than the script file so that Electron
        // can determine the app name. This requires that the package.json has a main field.
        var appPath = this.pck.projectPath;
        if (!this.pck.pck.main) {
            // Try the bundled electron app first
            appPath = this.pck.lib('backend', 'electron-main.js');
            if (!fs.existsSync(appPath)) {
                // Fallback to the generated electron app in src-gen
                appPath = this.pck.backend('electron-main.js');
            }
            console.warn("WARNING: ".concat(this.pck.packagePath, " does not have a \"main\" entry.\n") +
                'Please add the following line:\n' +
                '    "main": "lib/backend/electron-main.js"');
        }
        var _a = this.adjustArgs(__spreadArray([appPath], args, true)), mainArgs = _a.mainArgs, options = _a.options;
        var electronCli = require.resolve('electron/cli.js', { paths: [this.pck.projectPath] });
        return this.__process.fork(electronCli, mainArgs, options);
    };
    ApplicationPackageManager.prototype.startBrowser = function (args) {
        var _a = this.adjustArgs(args), mainArgs = _a.mainArgs, options = _a.options;
        // The backend must be a process group leader on UNIX in order to kill the tree later.
        // See https://nodejs.org/api/child_process.html#child_process_options_detached
        options.detached = process.platform !== 'win32';
        // Try the bundled backend app first
        var mainPath = this.pck.lib('backend', 'main.js');
        if (!fs.existsSync(mainPath)) {
            // Fallback to the generated backend file in src-gen
            mainPath = this.pck.backend('main.js');
        }
        return this.__process.fork(mainPath, mainArgs, options);
    };
    /**
     * Inject Theia's Electron-specific dependencies into the application's package.json.
     *
     * Only overwrite the Electron range if the current minimum supported version is lower than the recommended one.
     */
    ApplicationPackageManager.prototype.prepareElectron = function () {
        return __awaiter(this, void 0, void 0, function () {
            var theiaElectron, error_2, expectedRange, appPackageJsonPath, appPackageJson, currentRange, ffmpeg;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('@theia/electron'); })];
                    case 1:
                        theiaElectron = _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_2 = _a.sent();
                        if (error_2.code === 'ERR_MODULE_NOT_FOUND') {
                            throw new AbortError('Please install @theia/electron as part of your Theia Electron application');
                        }
                        throw error_2;
                    case 3:
                        expectedRange = theiaElectron.electronRange;
                        appPackageJsonPath = this.pck.path('package.json');
                        return [4 /*yield*/, fs.readJSON(appPackageJsonPath)];
                    case 4:
                        appPackageJson = _a.sent();
                        if (!appPackageJson.devDependencies) {
                            appPackageJson.devDependencies = {};
                        }
                        currentRange = appPackageJson.devDependencies.electron;
                        if (!(!currentRange || semver.compare(semver.minVersion(currentRange), semver.minVersion(expectedRange)) < 0)) return [3 /*break*/, 6];
                        // Update the range with the recommended one and write it on disk.
                        appPackageJson.devDependencies = this.insertAlphabetically(appPackageJson.devDependencies, 'electron', expectedRange);
                        return [4 /*yield*/, fs.writeJSON(appPackageJsonPath, appPackageJson, { spaces: 2 })];
                    case 5:
                        _a.sent();
                        throw new AbortError('Updated dependencies, please run "install" again');
                    case 6:
                        if (!theiaElectron.electronVersion || !semver.satisfies(theiaElectron.electronVersion, currentRange)) {
                            throw new AbortError('Dependencies are out of sync, please run "install" again');
                        }
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('@theia/ffmpeg'); })];
                    case 7:
                        ffmpeg = _a.sent();
                        return [4 /*yield*/, ffmpeg.replaceFfmpeg()];
                    case 8:
                        _a.sent();
                        return [4 /*yield*/, ffmpeg.checkFfmpeg()];
                    case 9:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ApplicationPackageManager.prototype.insertAlphabetically = function (object, key, value) {
        var updated = {};
        for (var _i = 0, _a = Object.keys(object); _i < _a.length; _i++) {
            var property = _a[_i];
            if (property.localeCompare(key) > 0) {
                updated[key] = value;
            }
            updated[property] = object[property];
        }
        if (!(key in updated)) {
            updated[key] = value;
        }
        return updated;
    };
    ApplicationPackageManager.prototype.adjustArgs = function (args, forkOptions) {
        if (forkOptions === void 0) { forkOptions = {}; }
        var options = __assign(__assign({}, this.forkOptions), { forkOptions: forkOptions });
        var mainArgs = __spreadArray([], args, true);
        var inspectIndex = mainArgs.findIndex(function (v) { return v.startsWith('--inspect'); });
        if (inspectIndex !== -1) {
            var inspectArg = mainArgs.splice(inspectIndex, 1)[0];
            options.execArgv = ['--nolazy', inspectArg];
        }
        return {
            mainArgs: mainArgs,
            options: options
        };
    };
    Object.defineProperty(ApplicationPackageManager.prototype, "forkOptions", {
        get: function () {
            return {
                stdio: [0, 1, 2, 'ipc'],
                env: __assign(__assign({}, process.env), { THEIA_PARENT_PID: String(process.pid) })
            };
        },
        enumerable: false,
        configurable: true
    });
    return ApplicationPackageManager;
}());
exports.ApplicationPackageManager = ApplicationPackageManager;
