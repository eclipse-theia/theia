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
exports.DEFAULT_MODULES = void 0;
exports.rebuild = rebuild;
var cp = require("child_process");
var fs = require("fs-extra");
var path = require("path");
var os = require("os");
var EXIT_SIGNALS = ['SIGINT', 'SIGTERM'];
exports.DEFAULT_MODULES = [
    'node-pty',
    'native-keymap',
    'find-git-repositories',
    'drivelist',
    'keytar',
    'ssh2',
    'cpu-features'
];
/**
 * @param target What to rebuild for.
 * @param options
 */
function rebuild(target, options) {
    var _this = this;
    if (options === void 0) { options = {}; }
    var _a = options.modules, modules = _a === void 0 ? exports.DEFAULT_MODULES : _a, _b = options.cacheRoot, cacheRoot = _b === void 0 ? process.cwd() : _b, forceAbi = options.forceAbi;
    var cache = path.resolve(cacheRoot, '.browser_modules');
    var cacheExists = folderExists(cache);
    guardExit(function (token) { return __awaiter(_this, void 0, void 0, function () {
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!(target === 'electron' && !cacheExists)) return [3 /*break*/, 2];
                    _a = process;
                    return [4 /*yield*/, rebuildElectronModules(cache, modules, forceAbi, token)];
                case 1:
                    _a.exitCode = _c.sent();
                    return [3 /*break*/, 5];
                case 2:
                    if (!(target === 'browser' && cacheExists)) return [3 /*break*/, 4];
                    _b = process;
                    return [4 /*yield*/, revertBrowserModules(cache, modules)];
                case 3:
                    _b.exitCode = _c.sent();
                    return [3 /*break*/, 5];
                case 4:
                    console.log("native node modules are already rebuilt for ".concat(target));
                    _c.label = 5;
                case 5: return [2 /*return*/];
            }
        });
    }); }).catch(function (errorOrSignal) {
        if (typeof errorOrSignal === 'string' && errorOrSignal in os.constants.signals) {
            process.kill(process.pid, errorOrSignal);
        }
        else {
            throw errorOrSignal;
        }
    });
}
function folderExists(folder) {
    if (fs.existsSync(folder)) {
        if (fs.statSync(folder).isDirectory()) {
            return true;
        }
        else {
            throw new Error("\"".concat(folder, "\" exists but it is not a directory"));
        }
    }
    return false;
}
function rebuildElectronModules(browserModuleCache, modules, forceAbi, token) {
    return __awaiter(this, void 0, void 0, function () {
        var modulesJsonPath, modulesJson, success, todo, exitCode, error_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    modulesJsonPath = path.join(browserModuleCache, 'modules.json');
                    return [4 /*yield*/, fs.access(modulesJsonPath).then(function () { return fs.readJson(modulesJsonPath); }, function () { return ({}); })];
                case 1:
                    modulesJson = _a.sent();
                    success = true;
                    // Backup already built browser modules.
                    return [4 /*yield*/, Promise.all(modules.map(function (module) { return __awaiter(_this, void 0, void 0, function () {
                            var modulePath, src, dest, error_2;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        try {
                                            modulePath = require.resolve("".concat(module, "/package.json"), {
                                                paths: [process.cwd()],
                                            });
                                        }
                                        catch (_) {
                                            console.debug("Module not found: ".concat(module));
                                            return [2 /*return*/]; // Skip current module.
                                        }
                                        src = path.dirname(modulePath);
                                        dest = path.join(browserModuleCache, module);
                                        _a.label = 1;
                                    case 1:
                                        _a.trys.push([1, 4, , 5]);
                                        return [4 /*yield*/, fs.remove(dest)];
                                    case 2:
                                        _a.sent();
                                        return [4 /*yield*/, fs.copy(src, dest, { overwrite: true })];
                                    case 3:
                                        _a.sent();
                                        modulesJson[module] = {
                                            originalLocation: src,
                                        };
                                        console.debug("Processed \"".concat(module, "\""));
                                        return [3 /*break*/, 5];
                                    case 4:
                                        error_2 = _a.sent();
                                        console.error("Error while doing a backup for \"".concat(module, "\": ").concat(error_2));
                                        success = false;
                                        return [3 /*break*/, 5];
                                    case 5: return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 2:
                    // Backup already built browser modules.
                    _a.sent();
                    if (Object.keys(modulesJson).length === 0) {
                        console.debug('No module to rebuild.');
                        return [2 /*return*/, 0];
                    }
                    // Update manifest tracking the backups' original locations.
                    return [4 /*yield*/, fs.writeJson(modulesJsonPath, modulesJson, { spaces: 2 })];
                case 3:
                    // Update manifest tracking the backups' original locations.
                    _a.sent();
                    // If we failed to process a module then exit now.
                    if (!success) {
                        return [2 /*return*/, 1];
                    }
                    todo = modules.map(function (m) {
                        // electron-rebuild ignores the module namespace...
                        var slash = m.indexOf('/');
                        return m.startsWith('@') && slash !== -1
                            ? m.substring(slash + 1)
                            : m;
                    });
                    _a.label = 4;
                case 4:
                    _a.trys.push([4, 9, 10, 13]);
                    if (!process.env.THEIA_REBUILD_NO_WORKAROUND) return [3 /*break*/, 6];
                    return [4 /*yield*/, runElectronRebuild(todo, forceAbi, token)];
                case 5:
                    exitCode = _a.sent();
                    return [3 /*break*/, 8];
                case 6: return [4 /*yield*/, electronRebuildExtraModulesWorkaround(process.cwd(), todo, function () { return runElectronRebuild(todo, forceAbi, token); }, token)];
                case 7:
                    exitCode = _a.sent();
                    _a.label = 8;
                case 8: return [3 /*break*/, 13];
                case 9:
                    error_1 = _a.sent();
                    console.error(error_1);
                    return [3 /*break*/, 13];
                case 10:
                    if (!(exitCode !== 0)) return [3 /*break*/, 12];
                    return [4 /*yield*/, revertBrowserModules(browserModuleCache, modules)];
                case 11:
                    _a.sent();
                    _a.label = 12;
                case 12: return [2 /*return*/, exitCode !== null && exitCode !== void 0 ? exitCode : 1];
                case 13: return [2 /*return*/];
            }
        });
    });
}
function revertBrowserModules(browserModuleCache, modules) {
    return __awaiter(this, void 0, void 0, function () {
        var exitCode, modulesJsonPath, modulesJson;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    exitCode = 0;
                    modulesJsonPath = path.join(browserModuleCache, 'modules.json');
                    return [4 /*yield*/, fs.readJson(modulesJsonPath)];
                case 1:
                    modulesJson = _a.sent();
                    return [4 /*yield*/, Promise.all(Object.entries(modulesJson).map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                            var src, dest, error_3;
                            var moduleName = _b[0], entry = _b[1];
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0:
                                        if (!modules.includes(moduleName)) {
                                            return [2 /*return*/]; // Skip modules that weren't requested.
                                        }
                                        src = path.join(browserModuleCache, moduleName);
                                        return [4 /*yield*/, fs.pathExists(src)];
                                    case 1:
                                        if (!(_c.sent())) {
                                            delete modulesJson[moduleName];
                                            console.error("Missing backup for ".concat(moduleName, "!"));
                                            exitCode = 1;
                                            return [2 /*return*/];
                                        }
                                        dest = entry.originalLocation;
                                        _c.label = 2;
                                    case 2:
                                        _c.trys.push([2, 6, , 7]);
                                        return [4 /*yield*/, fs.remove(dest)];
                                    case 3:
                                        _c.sent();
                                        return [4 /*yield*/, fs.copy(src, dest, { overwrite: false })];
                                    case 4:
                                        _c.sent();
                                        return [4 /*yield*/, fs.remove(src)];
                                    case 5:
                                        _c.sent();
                                        delete modulesJson[moduleName];
                                        console.debug("Reverted \"".concat(moduleName, "\""));
                                        return [3 /*break*/, 7];
                                    case 6:
                                        error_3 = _c.sent();
                                        console.error("Error while reverting \"".concat(moduleName, "\": ").concat(error_3));
                                        exitCode = 1;
                                        return [3 /*break*/, 7];
                                    case 7: return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 2:
                    _a.sent();
                    if (!(Object.keys(modulesJson).length === 0)) return [3 /*break*/, 4];
                    // We restored everything, so we can delete the cache.
                    return [4 /*yield*/, fs.remove(browserModuleCache)];
                case 3:
                    // We restored everything, so we can delete the cache.
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4: 
                // Some things were not restored, so we update the manifest.
                return [4 /*yield*/, fs.writeJson(modulesJsonPath, modulesJson, { spaces: 2 })];
                case 5:
                    // Some things were not restored, so we update the manifest.
                    _a.sent();
                    _a.label = 6;
                case 6: return [2 /*return*/, exitCode];
            }
        });
    });
}
function runElectronRebuild(modules, forceAbi, token) {
    return __awaiter(this, void 0, void 0, function () {
        var todo;
        var _this = this;
        return __generator(this, function (_a) {
            todo = modules.join(',');
            return [2 /*return*/, new Promise(function (resolve, reject) { return __awaiter(_this, void 0, void 0, function () {
                    var command, electronRebuild;
                    return __generator(this, function (_a) {
                        command = "npx --no-install electron-rebuild -f -w=".concat(todo, " -o=").concat(todo);
                        if (forceAbi) {
                            command += " --force-abi ".concat(forceAbi);
                        }
                        electronRebuild = cp.spawn(command, {
                            stdio: 'inherit',
                            shell: true,
                        });
                        token.onSignal(function (signal) { return electronRebuild.kill(signal); });
                        electronRebuild.on('error', reject);
                        electronRebuild.on('close', function (code, signal) {
                            if (signal) {
                                reject(new Error("electron-rebuild exited with \"".concat(signal, "\"")));
                            }
                            else {
                                resolve(code);
                            }
                        });
                        return [2 /*return*/];
                    });
                }); })];
        });
    });
}
/**
 * `electron-rebuild` is supposed to accept a list of modules to build, even when not part of the dependencies.
 * But there is a bug that causes `electron-rebuild` to not correctly process this list of modules.
 *
 * This workaround will temporarily modify the current package.json file.
 *
 * PR with fix: https://github.com/electron/electron-rebuild/pull/888
 *
 * TODO: Remove this workaround.
 */
function electronRebuildExtraModulesWorkaround(cwd, extraModules, run, token) {
    return __awaiter(this, void 0, void 0, function () {
        var packageJsonPath, packageJsonCopyPath_1, packageJson, _i, extraModules_1, extraModule, packageJson, _a, extraModules_2, extraModule;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    packageJsonPath = path.resolve(cwd, 'package.json');
                    return [4 /*yield*/, fs.pathExists(packageJsonPath)];
                case 1:
                    if (!_b.sent()) return [3 /*break*/, 12];
                    packageJsonCopyPath_1 = "".concat(packageJsonPath, ".copy");
                    return [4 /*yield*/, fs.readJson(packageJsonPath)];
                case 2:
                    packageJson = _b.sent();
                    return [4 /*yield*/, fs.copy(packageJsonPath, packageJsonCopyPath_1)];
                case 3:
                    _b.sent();
                    return [4 /*yield*/, throwIfSignal(token, function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, fs.unlink(packageJsonCopyPath_1)];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 4:
                    _b.sent();
                    if (typeof packageJson.dependencies !== 'object') {
                        packageJson.dependencies = {};
                    }
                    for (_i = 0, extraModules_1 = extraModules; _i < extraModules_1.length; _i++) {
                        extraModule = extraModules_1[_i];
                        if (!packageJson.dependencies[extraModule]) {
                            packageJson.dependencies[extraModule] = '*';
                        }
                    }
                    _b.label = 5;
                case 5:
                    _b.trys.push([5, , 9, 11]);
                    return [4 /*yield*/, fs.writeJson(packageJsonPath, packageJson, { spaces: 2 })];
                case 6:
                    _b.sent();
                    return [4 /*yield*/, throwIfSignal(token)];
                case 7:
                    _b.sent();
                    return [4 /*yield*/, run(token)];
                case 8: return [2 /*return*/, _b.sent()];
                case 9: return [4 /*yield*/, fs.move(packageJsonCopyPath_1, packageJsonPath, { overwrite: true })];
                case 10:
                    _b.sent();
                    return [7 /*endfinally*/];
                case 11: return [3 /*break*/, 19];
                case 12:
                    packageJson = {
                        name: 'theia-rebuild-workaround',
                        version: '0.0.0',
                        dependencies: {},
                    };
                    for (_a = 0, extraModules_2 = extraModules; _a < extraModules_2.length; _a++) {
                        extraModule = extraModules_2[_a];
                        packageJson.dependencies[extraModule] = '*';
                    }
                    _b.label = 13;
                case 13:
                    _b.trys.push([13, , 17, 19]);
                    return [4 /*yield*/, fs.writeJson(packageJsonPath, packageJson)];
                case 14:
                    _b.sent();
                    return [4 /*yield*/, throwIfSignal(token)];
                case 15:
                    _b.sent();
                    return [4 /*yield*/, run(token)];
                case 16: return [2 /*return*/, _b.sent()];
                case 17: return [4 /*yield*/, fs.unlink(packageJsonPath)];
                case 18:
                    _b.sent();
                    return [7 /*endfinally*/];
                case 19: return [2 /*return*/];
            }
        });
    });
}
/**
 * Temporarily install hooks to **try** to prevent the process from exiting while `run` is running.
 *
 * Note that it is still possible to kill the process and prevent cleanup logic (e.g. SIGKILL, computer forced shutdown, etc).
 */
function guardExit(run) {
    return __awaiter(this, void 0, void 0, function () {
        var token, signalListener, _i, EXIT_SIGNALS_1, signal, _a, EXIT_SIGNALS_2, signal;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    token = new ExitTokenImpl();
                    signalListener = function (signal) { return token._emitSignal(signal); };
                    for (_i = 0, EXIT_SIGNALS_1 = EXIT_SIGNALS; _i < EXIT_SIGNALS_1.length; _i++) {
                        signal = EXIT_SIGNALS_1[_i];
                        process.on(signal, signalListener);
                    }
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, , 3, 4]);
                    return [4 /*yield*/, run(token)];
                case 2: return [2 /*return*/, _b.sent()];
                case 3:
                    for (_a = 0, EXIT_SIGNALS_2 = EXIT_SIGNALS; _a < EXIT_SIGNALS_2.length; _a++) {
                        signal = EXIT_SIGNALS_2[_a];
                        // FIXME we have a type clash here between Node, Electron and Mocha.
                        // Typescript is resolving here to Electron's Process interface which extends the NodeJS.EventEmitter interface
                        // However instead of the actual NodeJS.EventEmitter interface it resolves to an empty stub of Mocha
                        // Therefore it can't find the correct "off" signature and throws an error
                        // By casting to the NodeJS.EventEmitter ourselves, we short circuit the resolving and it succeeds
                        process.off(signal, signalListener);
                    }
                    return [7 /*endfinally*/];
                case 4: return [2 /*return*/];
            }
        });
    });
}
var ExitTokenImpl = /** @class */ (function () {
    function ExitTokenImpl() {
        this._listeners = new Set();
    }
    ExitTokenImpl.prototype.onSignal = function (callback) {
        this._listeners.add(callback);
    };
    ExitTokenImpl.prototype.getLastSignal = function () {
        return this._lastSignal;
    };
    ExitTokenImpl.prototype._emitSignal = function (signal) {
        this._lastSignal = signal;
        for (var _i = 0, _a = this._listeners; _i < _a.length; _i++) {
            var listener = _a[_i];
            listener(signal);
        }
    };
    return ExitTokenImpl;
}());
/**
 * Throw `signal` if one was received, runs `cleanup` before doing so.
 */
function throwIfSignal(token, cleanup) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!token.getLastSignal()) return [3 /*break*/, 4];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, , 3, 4]);
                    return [4 /*yield*/, (cleanup === null || cleanup === void 0 ? void 0 : cleanup())];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3: 
                // eslint-disable-next-line no-throw-literal
                throw token.getLastSignal();
                case 4: return [2 /*return*/];
            }
        });
    });
}
