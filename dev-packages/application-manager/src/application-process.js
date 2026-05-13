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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplicationProcess = void 0;
var path = require("path");
var fs = require("fs-extra");
var cp = require("child_process");
var ApplicationProcess = /** @class */ (function () {
    function ApplicationProcess(pck, binProjectPath) {
        this.pck = pck;
        this.binProjectPath = binProjectPath;
        this.defaultOptions = {
            cwd: this.pck.projectPath,
            env: process.env
        };
    }
    ApplicationProcess.prototype.spawn = function (command, args, options) {
        return cp.spawn(command, args || [], Object.assign({}, this.defaultOptions, __assign(__assign({}, options), { shell: true })));
    };
    ApplicationProcess.prototype.fork = function (modulePath, args, options) {
        return cp.fork(modulePath, args, Object.assign({}, this.defaultOptions, options));
    };
    ApplicationProcess.prototype.canRun = function (command) {
        var binPath = this.resolveBin(this.binProjectPath, command);
        return !!binPath && fs.existsSync(binPath);
    };
    ApplicationProcess.prototype.run = function (command, args, options) {
        var commandProcess = this.spawnBin(command, args, options);
        return this.promisify(command, commandProcess);
    };
    ApplicationProcess.prototype.spawnBin = function (command, args, options) {
        var binPath = this.resolveBin(this.binProjectPath, command);
        if (!binPath) {
            throw new Error("Could not resolve ".concat(command, " relative to ").concat(this.binProjectPath));
        }
        return this.spawn(binPath, args, __assign(__assign({}, options), { shell: true }));
    };
    ApplicationProcess.prototype.resolveBin = function (rootPath, command) {
        var commandPath = path.resolve(rootPath, 'node_modules', '.bin', command);
        if (process.platform === 'win32') {
            commandPath = commandPath + '.cmd';
        }
        if (fs.existsSync(commandPath)) {
            return commandPath;
        }
        var parentDir = path.dirname(rootPath);
        if (parentDir === rootPath) {
            return undefined;
        }
        return this.resolveBin(parentDir, command);
    };
    ApplicationProcess.prototype.promisify = function (command, p) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            p.stdout.on('data', function (data) { return _this.pck.log(data.toString()); });
            p.stderr.on('data', function (data) { return _this.pck.error(data.toString()); });
            p.on('error', reject);
            p.on('close', function (code, signal) {
                if (signal) {
                    reject(new Error("".concat(command, " exited with an unexpected signal: ").concat(signal, ".")));
                    return;
                }
                if (code === 0) {
                    resolve();
                }
                else {
                    reject(new Error("".concat(command, " exited with an unexpected code: ").concat(code, ".")));
                }
            });
        });
    };
    return ApplicationProcess;
}());
exports.ApplicationProcess = ApplicationProcess;
