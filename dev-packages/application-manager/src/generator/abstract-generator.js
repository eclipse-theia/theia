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
exports.AbstractGenerator = void 0;
var fs = require("fs-extra");
var AbstractGenerator = /** @class */ (function () {
    function AbstractGenerator(pck, options) {
        if (options === void 0) { options = {}; }
        this.pck = pck;
        this.options = options;
    }
    AbstractGenerator.prototype.ifBrowser = function (value, defaultValue) {
        if (defaultValue === void 0) { defaultValue = ''; }
        return this.pck.ifBrowser(value, defaultValue);
    };
    AbstractGenerator.prototype.ifElectron = function (value, defaultValue) {
        if (defaultValue === void 0) { defaultValue = ''; }
        return this.pck.ifElectron(value, defaultValue);
    };
    AbstractGenerator.prototype.ifBrowserOnly = function (value, defaultValue) {
        if (defaultValue === void 0) { defaultValue = ''; }
        return this.pck.ifBrowserOnly(value, defaultValue);
    };
    AbstractGenerator.prototype.write = function (path, content) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fs.ensureFile(path)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, fs.writeFile(path, content)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    AbstractGenerator.prototype.ifMonaco = function (value, defaultValue) {
        if (defaultValue === void 0) { defaultValue = function () { return ''; }; }
        return this.ifPackage([
            '@theia/monaco',
            '@theia/monaco-editor-core'
        ], value, defaultValue);
    };
    AbstractGenerator.prototype.ifPackage = function (packageName, value, defaultValue) {
        if (defaultValue === void 0) { defaultValue = ''; }
        var packages = Array.isArray(packageName) ? packageName : [packageName];
        if (this.pck.extensionPackages.some(function (e) { return packages.includes(e.name); })) {
            return typeof value === 'string' ? value : value();
        }
        else {
            return typeof defaultValue === 'string' ? defaultValue : defaultValue();
        }
    };
    AbstractGenerator.prototype.prettyStringify = function (object) {
        return JSON.stringify(object, undefined, 4);
    };
    /** Escape text for use in an HTML attribute value. */
    AbstractGenerator.prototype.escapeHtmlAttribute = function (value) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/'/g, '&#39;');
    };
    /** Escape a URL or path for safe use inside a CSS `url("…")` value. */
    AbstractGenerator.prototype.escapeCssUrlFragment = function (value) {
        return value
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
    };
    AbstractGenerator.prototype.emitStartupLogger = function (component, epochLabel, options) {
        var perfImport = (options === null || options === void 0 ? void 0 : options.requirePerformance) ? 'const { performance } = require(\'perf_hooks\');\n' : '';
        return "".concat(perfImport, "const startupLog = (milestone) => console.debug(`").concat(component, ": ${milestone} [${(performance.now() / 1000).toFixed(3)} s since ").concat(epochLabel, "]`);");
    };
    AbstractGenerator.prototype.emitStartupLog = function (milestone) {
        return "startupLog('".concat(milestone, "');");
    };
    return AbstractGenerator;
}());
exports.AbstractGenerator = AbstractGenerator;
