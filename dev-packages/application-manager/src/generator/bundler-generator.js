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
exports.BundlerGenerator = void 0;
var paths = require("path");
var fs = require("fs-extra");
var abstract_generator_1 = require("./abstract-generator");
var BundlerGenerator = /** @class */ (function (_super) {
    __extends(BundlerGenerator, _super);
    function BundlerGenerator() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    BundlerGenerator.prototype.generate = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.preferESBuild()];
                    case 1:
                        if (!_a.sent()) return [3 /*break*/, 9];
                        return [4 /*yield*/, this.write(this.genESBuildBrowserPath, this.compileESBuildBrowserConfig())];
                    case 2:
                        _a.sent();
                        if (!!this.pck.isBrowserOnly()) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.write(this.genESBuildNodePath, this.compileESBuildNodeConfig())];
                    case 3:
                        _a.sent();
                        if (!this.pck.isElectron()) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.write(this.genESBuildElectronPath, this.compileESBuildElectronConfig())];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5: return [4 /*yield*/, this.shouldGenerateUserESBuildConfig()];
                    case 6:
                        if (!_a.sent()) return [3 /*break*/, 8];
                        return [4 /*yield*/, this.write(this.esbuildPath, this.compileESBuildUserConfig())];
                    case 7:
                        _a.sent();
                        _a.label = 8;
                    case 8: return [3 /*break*/, 15];
                    case 9: return [4 /*yield*/, this.write(this.genConfigPath, this.compileWebpackConfig())];
                    case 10:
                        _a.sent();
                        if (!!this.pck.isBrowserOnly()) return [3 /*break*/, 12];
                        return [4 /*yield*/, this.write(this.genNodeConfigPath, this.compileNodeWebpackConfig())];
                    case 11:
                        _a.sent();
                        _a.label = 12;
                    case 12: return [4 /*yield*/, this.shouldGenerateUserWebpackConfig()];
                    case 13:
                        if (!_a.sent()) return [3 /*break*/, 15];
                        return [4 /*yield*/, this.write(this.configPath, this.compileUserWebpackConfig())];
                    case 14:
                        _a.sent();
                        _a.label = 15;
                    case 15: return [2 /*return*/];
                }
            });
        });
    };
    BundlerGenerator.prototype.preferESBuild = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fs.pathExists(this.esbuildPath)];
                    case 1:
                        // If an esbuild file already exists, prefer esbuild
                        if (_a.sent()) {
                            return [2 /*return*/, true];
                        }
                        return [4 /*yield*/, fs.pathExists(this.configPath)];
                    case 2:
                        // If a webpack file already exists, prefer webpack
                        if (_a.sent()) {
                            return [2 /*return*/, false];
                        }
                        // Otherwise, prefer ESBuild (for performance)
                        return [2 /*return*/, true];
                }
            });
        });
    };
    BundlerGenerator.prototype.shouldGenerateUserWebpackConfig = function () {
        return __awaiter(this, void 0, void 0, function () {
            var content;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fs.pathExists(this.configPath)];
                    case 1:
                        if (!(_a.sent())) {
                            return [2 /*return*/, true];
                        }
                        return [4 /*yield*/, fs.readFile(this.configPath, 'utf8')];
                    case 2:
                        content = _a.sent();
                        return [2 /*return*/, !content.includes('gen-webpack')];
                }
            });
        });
    };
    BundlerGenerator.prototype.shouldGenerateUserESBuildConfig = function () {
        return __awaiter(this, void 0, void 0, function () {
            var content;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fs.pathExists(this.esbuildPath)];
                    case 1:
                        if (!(_a.sent())) {
                            return [2 /*return*/, true];
                        }
                        return [4 /*yield*/, fs.readFile(this.esbuildPath, 'utf8')];
                    case 2:
                        content = _a.sent();
                        return [2 /*return*/, !content.includes('gen-esbuild')];
                }
            });
        });
    };
    Object.defineProperty(BundlerGenerator.prototype, "configPath", {
        get: function () {
            return this.pck.path('webpack.config.js');
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(BundlerGenerator.prototype, "genConfigPath", {
        get: function () {
            return this.pck.path('gen-webpack.config.js');
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(BundlerGenerator.prototype, "genNodeConfigPath", {
        get: function () {
            return this.pck.path('gen-webpack.node.config.js');
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(BundlerGenerator.prototype, "esbuildPath", {
        get: function () {
            return this.pck.path('esbuild.mjs');
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(BundlerGenerator.prototype, "genESBuildBrowserPath", {
        get: function () {
            return this.pck.path('gen-esbuild.browser.mjs');
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(BundlerGenerator.prototype, "genESBuildNodePath", {
        get: function () {
            return this.pck.path('gen-esbuild.node.mjs');
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(BundlerGenerator.prototype, "genESBuildElectronPath", {
        get: function () {
            return this.pck.path('gen-esbuild.electron.mjs');
        },
        enumerable: false,
        configurable: true
    });
    BundlerGenerator.prototype.compileWebpackConfig = function () {
        return "/**\n * Don't touch this file. It will be regenerated by theia build.\n * To customize webpack configuration change ".concat(this.configPath, "\n */\n// @ts-check\nconst path = require('path');\nconst webpack = require('webpack');\nconst yargs = require('yargs');\nconst resolvePackagePath = require('resolve-package-path');\nconst CopyWebpackPlugin = require('copy-webpack-plugin');\nconst CompressionPlugin = require('compression-webpack-plugin');\nconst MiniCssExtractPlugin = require('mini-css-extract-plugin');\nconst { MonacoWebpackPlugin } = require('@theia/bundle-plugin');\n\nconst outputPath = path.resolve(__dirname, 'lib', 'frontend');\nconst { mode, staticCompression }  = yargs.option('mode', {\n    description: \"Mode to use\",\n    choices: [\"development\", \"production\"],\n    default: \"production\"\n}).option('static-compression', {\n    description: 'Controls whether to enable compression of static artifacts.',\n    type: 'boolean',\n    default: true\n}).argv;\nconst development = mode === 'development';\n\nconst plugins = [\n    new CopyWebpackPlugin({\n        patterns: [\n            {\n                // copy secondary window html file to lib folder\n                from: path.resolve(__dirname, 'src-gen/frontend/secondary-window.html')\n            }").concat(this.ifPackage('@theia/plugin-ext', ",\n            {\n                // copy webview files to lib folder\n                from: path.join(resolvePackagePath('@theia/plugin-ext', __dirname), '..', 'src', 'main', 'browser', 'webview', 'pre'),\n                to: path.resolve(__dirname, 'lib', 'webview', 'pre')\n            }"), "\n            ").concat(this.ifPackage('@theia/plugin-ext-vscode', ",\n            {\n                // copy frontend plugin host files\n                from: path.join(resolvePackagePath('@theia/plugin-ext-vscode', __dirname), '..', 'lib', 'node', 'context', 'plugin-vscode-init-fe.js'),\n                to: path.resolve(__dirname, 'lib', 'frontend', 'context', 'plugin-vscode-init-fe.js')\n            }"), "\n            ").concat(this.ifPackage('@theia/terminal', ",\n            {\n                // copy shell integration scripts\n                from: path.join(resolvePackagePath('@theia/terminal', __dirname), '..', 'src', 'node', 'shell-integrations'),\n                to: path.resolve(__dirname, 'lib', 'backend', 'shell-integrations')\n            }"), "\n        ]\n    }),\n    new webpack.ProvidePlugin({\n        // the Buffer class doesn't exist in the browser but some dependencies rely on it\n        Buffer: ['buffer', 'Buffer']\n    }), \n    new MonacoWebpackPlugin()\n];\n// it should go after copy-plugin in order to compress monaco as well\nif (staticCompression) {\n    plugins.push(new CompressionPlugin({}));\n}\n\nmodule.exports = [{\n    mode,\n    plugins,\n    devtool: 'source-map',\n    entry: {\n        bundle: path.resolve(__dirname, 'src-gen/frontend/index.js'),\n        ").concat(this.ifPackage('@theia/plugin-ext', "'plugin-worker': '@theia/plugin-ext/lib/hosted/browser/worker/worker-main.js',"), "\n    },\n    output: {\n        filename: '[name].js',\n        path: outputPath,\n        devtoolModuleFilenameTemplate: 'webpack:///[resource-path]?[loaders]',\n        globalObject: 'self'\n    },\n    target: 'web',\n    cache: staticCompression,\n    module: {\n        rules: [\n            {\n                test: /\\.css$/,\n                use: ['style-loader', 'css-loader']\n            },\n            {\n                test: /\\.(ttf|eot|svg)(\\?v=\\d+\\.\\d+\\.\\d+)?$/,\n                type: 'asset',\n                parser: {\n                    dataUrlCondition: {\n                        maxSize: 10000,\n                    }\n                },\n                generator: {\n                    dataUrl: {\n                        mimetype: 'image/svg+xml'\n                    }\n                }\n            },\n            {\n                test: /\\.(jpg|png|gif)$/,\n                type: 'asset/resource',\n                generator: {\n                    filename: '[hash].[ext]'\n                }\n            },\n            {\n                // see https://github.com/eclipse-theia/theia/issues/556\n                test: /source-map-support/,\n                loader: 'ignore-loader'\n            },\n            {\n                test: /\\.d\\.ts$/,\n                loader: 'ignore-loader'\n            },\n            {\n                test: /\\.js$/,\n                enforce: 'pre',\n                loader: 'source-map-loader',\n                exclude: /jsonc-parser|fast-plist|onigasm/\n            },\n            {\n                test: /\\.woff(2)?(\\?v=[0-9]\\.[0-9]\\.[0-9])?$/,\n                type: 'asset',\n                parser: {\n                    dataUrlCondition: {\n                        maxSize: 10000,\n                    }\n                },\n                generator: {\n                    dataUrl: {\n                        mimetype: 'image/svg+xml'\n                    }\n                }\n            },\n            {\n                test: /node_modules[\\\\|/](vscode-languageserver-types|vscode-uri|jsonc-parser|vscode-languageserver-protocol)/,\n                loader: 'umd-compat-loader'\n            },\n            {\n                test: /\\.wasm$/,\n                type: 'asset/resource'\n            },\n            {\n                test: /\\.plist$/,\n                type: 'asset/resource'\n            }\n        ]\n    },\n    resolve: {\n        fallback: {\n            'child_process': false,\n            'crypto': false,\n            'net': false,\n            'path': require.resolve('path-browserify'),\n            'process': false,\n            'os': false,\n            'timers': false\n        },\n        ").concat(this.ifMonaco(function () { return "alias: {\n            // Replace Monaco's nls module with Theia's localization-aware version.\n            // ESM exports are immutable so we cannot override localize/localize2 at runtime.\n            // Using the resolved absolute path ensures that both external imports\n            // (e.g. '@theia/monaco-editor-core/esm/vs/nls') and internal relative\n            // imports within Monaco (e.g. '../nls.js') are redirected.\n            [path.join(resolvePackagePath('@theia/monaco-editor-core', __dirname), '..', 'esm', 'vs', 'nls.js')]:\n                path.join(resolvePackagePath('@theia/monaco', __dirname), '..', 'lib', 'browser', 'monaco-nls.js')\n        },"; }), "\n        extensions: ['.js']\n    },\n    stats: {\n        warnings: true,\n        children: true\n    },\n    ignoreWarnings: [\n        // Some packages do not have source maps, that's ok\n        /Failed to parse source map/,\n        {\n            // Monaco uses 'require' in a non-standard way\n            module: /@theia\\/monaco-editor-core/,\n            message: /require function is used in a way in which dependencies cannot be statically extracted/\n        }\n    ]\n},\n").concat(this.ifMonaco(function () { return "{\n    // The Monaco editor worker must be built separately without the NLS alias.\n    // The NLS alias redirects to monaco-nls.ts which imports from @theia/core,\n    // and those modules are not available in the web worker context.\n    mode,\n    devtool: 'source-map',\n    entry: {\n        'editor.worker': '@theia/monaco-editor-core/esm/vs/editor/common/services/editorWebWorkerMain.js'\n    },\n    output: {\n        filename: '[name].js',\n        path: outputPath,\n        devtoolModuleFilenameTemplate: 'webpack:///[resource-path]?[loaders]',\n        globalObject: 'self'\n    },\n    target: 'webworker',\n    cache: staticCompression,\n    resolve: {\n        extensions: ['.js']\n    },\n    ignoreWarnings: [\n        {\n            module: /@theia\\/monaco-editor-core/,\n            message: /require function is used in a way in which dependencies cannot be statically extracted/\n        }\n    ]\n},"; }), "\n{\n    mode,\n    plugins: [\n        new MiniCssExtractPlugin({\n            // Options similar to the same options in webpackOptions.output\n            // both options are optional\n            filename: \"[name].css\",\n            chunkFilename: \"[id].css\",\n        }),\n        new MonacoWebpackPlugin(),\n    ],\n    devtool: 'source-map',\n    entry: {\n        \"secondary-window\": path.resolve(__dirname, 'src-gen/frontend/secondary-index.js'),\n    },\n    output: {\n        filename: '[name].js',\n        path: outputPath,\n        devtoolModuleFilenameTemplate: 'webpack:///[resource-path]?[loaders]',\n        globalObject: 'self'\n    },\n    target: 'web',\n    cache: staticCompression,\n    module: {\n        rules: [\n            {\n                test: /.css$/i,\n                use: [MiniCssExtractPlugin.loader, \"css-loader\"]\n            },\n            {\n                test: /.wasm$/,\n                type: 'asset/resource'\n            }\n        ]\n    },\n    resolve: {\n        fallback: {\n            'child_process': false,\n            'crypto': false,\n            'net': false,\n            'path': require.resolve('path-browserify'),\n            'process': false,\n            'os': false,\n            'timers': false\n        },\n        ").concat(this.ifMonaco(function () { return "alias: {\n            // Replace Monaco's nls module with Theia's localization-aware version.\n            // ESM exports are immutable so we cannot override localize/localize2 at runtime.\n            // Using the resolved absolute path ensures that both external imports\n            // (e.g. '@theia/monaco-editor-core/esm/vs/nls') and internal relative\n            // imports within Monaco (e.g. '../nls.js') are redirected.\n            [path.join(resolvePackagePath('@theia/monaco-editor-core', __dirname), '..', 'esm', 'vs', 'nls.js')]:\n                path.join(resolvePackagePath('@theia/monaco', __dirname), '..', 'lib', 'browser', 'monaco-nls.js')\n        },"; }), "\n        extensions: ['.js']\n    },\n    stats: {\n        warnings: true,\n        children: true\n    },\n    ignoreWarnings: [\n        {\n            // Monaco uses 'require' in a non-standard way\n            module: /@theia\\/monaco-editor-core/,\n            message: /require function is used in a way in which dependencies cannot be statically extracted/\n        }\n    ]\n}").concat(this.ifElectron(", {\n    mode,\n    devtool: 'source-map',\n    entry: {\n        \"preload\": path.resolve(__dirname, 'src-gen/frontend/preload.js'),\n    },\n    output: {\n        filename: '[name].js',\n        path: outputPath,\n        devtoolModuleFilenameTemplate: 'webpack:///[resource-path]?[loaders]',\n        globalObject: 'self'\n    },\n    target: 'electron-preload',\n    cache: staticCompression,\n    stats: {\n        warnings: true,\n        children: true\n    }\n}"), "];");
    };
    BundlerGenerator.prototype.compileUserWebpackConfig = function () {
        return "/**\n * This file can be edited to customize webpack configuration.\n * To reset delete this file and rerun theia build again.\n */\n// @ts-check\nconst configs = require('./".concat(paths.basename(this.genConfigPath), "');\n").concat(this.ifBrowserOnly('', "const nodeConfig = require('./".concat(paths.basename(this.genNodeConfigPath), "');")), "\n\n/**\n * Expose bundled modules on window.theia.moduleName namespace, e.g.\n * window['theia']['@theia/core/lib/common/uri'].\n * Such syntax can be used by external code, for instance, for testing.\nconfigs[0].module.rules.push({\n    test: /\\.js$/,\n    loader: require.resolve('@theia/application-manager/lib/expose-loader')\n}); */\n\n").concat(this.ifBrowserOnly('module.exports = configs;', "module.exports = [\n    ...configs,\n    nodeConfig.config\n];"), "\n");
    };
    BundlerGenerator.prototype.compileNodeWebpackConfig = function () {
        return "/**\n * Don't touch this file. It will be regenerated by theia build.\n * To customize webpack configuration change ".concat(this.configPath, "\n */\n// @ts-check\nconst path = require('path');\nconst yargs = require('yargs');\nconst webpack = require('webpack');\nconst TerserPlugin = require('terser-webpack-plugin');\nconst { NativeWebpackPlugin, MonacoWebpackPlugin } = require('@theia/bundle-plugin');\n\nconst { mode } = yargs.option('mode', {\n    description: \"Mode to use\",\n    choices: [\"development\", \"production\"],\n    default: \"production\"\n}).argv;\n\nconst production = mode === 'production';\n\n/** @type {import('webpack').EntryObject} */\nconst commonJsLibraries = {};\nfor (const [entryPointName, entryPointPath] of Object.entries({\n    ").concat(this.ifPackage('@theia/plugin-ext', "'backend-init-theia': '@theia/plugin-ext/lib/hosted/node/scanners/backend-init-theia',"), "\n    ").concat(this.ifPackage('@theia/filesystem', "'parcel-watcher': '@theia/filesystem/lib/node/parcel-watcher',"), "\n    ").concat(this.ifPackage('@theia/plugin-ext-vscode', "'plugin-vscode-init': '@theia/plugin-ext-vscode/lib/node/plugin-vscode-init',"), "\n    ").concat(this.ifPackage('@theia/api-provider-sample', "'gotd-api-init': '@theia/api-provider-sample/lib/plugin/gotd-api-init',"), "\n})) {\n    commonJsLibraries[entryPointName] = {\n        import: require.resolve(entryPointPath),\n        library: {\n            type: 'commonjs2',\n        },\n    };\n}\n\nconst ignoredResources = new Set();\n\nif (process.platform !== 'win32') {\n    ignoredResources.add('@vscode/windows-ca-certs');\n    ignoredResources.add('@vscode/windows-ca-certs/build/Release/crypt32.node');\n}\n\nconst nativePlugin = new NativeWebpackPlugin({\n    out: 'native',\n    trash: ").concat(this.ifPackage('@theia/filesystem', 'true', 'false'), ",\n    ripgrep: ").concat(this.ifPackage(['@theia/search-in-workspace', '@theia/file-search'], 'true', 'false'), ",\n    pty: ").concat(this.ifPackage('@theia/process', 'true', 'false'), ",\n    nativeBindings: {\n        drivelist: 'drivelist/build/Release/drivelist.node'\n    }\n});\n\n").concat(this.ifPackage('@theia/process', function () { return "// Ensure that node-pty is correctly hoisted\ntry {\n    require.resolve('node-pty');\n} catch {\n    console.error('\"node-pty\" dependency is not installed correctly. Ensure that it is available in the root node_modules directory.');\n    console.error('Exiting webpack build process.');\n    process.exit(1);\n}"; }), "\n\n/** @type {import('webpack').Configuration} */\nconst config = {\n    mode,\n    devtool: mode === 'development' ? 'source-map' : false,\n    target: 'node',\n    node: {\n        global: false,\n        __filename: false,\n        __dirname: false\n    },\n    resolve: {\n        extensions: ['.js', '.json', '.wasm', '.node'],\n    },\n    output: {\n        filename: '[name].js',\n        path: path.resolve(__dirname, 'lib', 'backend'),\n        devtoolModuleFilenameTemplate: 'webpack:///[absolute-resource-path]?[loaders]',\n    },").concat(this.ifElectron("\n    externals: {\n        electron: 'require(\"electron\")'\n    },"), "\n    entry: {\n        // Main entry point of the Theia application backend:\n        'main': require.resolve('./src-gen/backend/main'),\n        // Theia's IPC mechanism:\n        'ipc-bootstrap': require.resolve('@theia/core/lib/node/messaging/ipc-bootstrap'),\n        ").concat(this.ifPackage('@theia/plugin-ext', function () { return "// VS Code extension support:\n        'plugin-host': require.resolve('@theia/plugin-ext/lib/hosted/node/plugin-host'),"; }), "\n        ").concat(this.ifPackage('@theia/plugin-ext-headless', function () { return "// Theia Headless Plugin support:\n        'plugin-host-headless': require.resolve('@theia/plugin-ext-headless/lib/hosted/node/plugin-host-headless'),"; }), "\n        ").concat(this.ifPackage('@theia/process', function () { return "// Make sure the node-pty thread workers can be executed:\n        'worker/conoutSocketWorker': require.resolve('node-pty/lib/worker/conoutSocketWorker'),\n        'conpty_console_list_agent': require.resolve('node-pty/lib/conpty_console_list_agent'),"; }), "        \n        ").concat(this.ifElectron("'electron-main': require.resolve('./src-gen/backend/electron-main'),"), "\n        ").concat(this.ifPackage('@theia/dev-container', function () { return "// VS Code Dev-Container communication:\n        'dev-container-server': require.resolve('@theia/dev-container/lib/dev-container-server/dev-container-server'),"; }), "\n        ...commonJsLibraries\n    },\n    module: {\n        rules: [\n            // Make sure we can still find and load our native addons.\n            {\n                test: /\\.node$/,\n                loader: 'node-loader',\n                options: {\n                    name: 'native/[name].[ext]'\n                }\n            },\n            {\n                test: /\\.d\\.ts$/,\n                loader: 'ignore-loader'\n            },\n            {\n                test: /\\.js$/,\n                enforce: 'pre',\n                loader: 'source-map-loader'\n            },\n            // node-pty uses a dynamic require which needs to be rewritten to work with webpack.\n            {\n                test: /node_modules[/\\\\]node-pty[/\\\\]lib[/\\\\]utils.js$/,\n                loader: 'string-replace-loader',\n                options: {\n                    search: /require\\(/,\n                    replace: '__non_webpack_require__(',\n                    flags: 'g'\n                }\n            },\n            // jsonc-parser exposes its UMD implementation by default, which\n            // confuses Webpack leading to missing js in the bundles.\n            {\n                test: /node_modules[\\/](jsonc-parser)/,\n                loader: 'umd-compat-loader'\n            }\n        ]\n    },\n    plugins: [\n        // Some native dependencies need special handling\n        nativePlugin,\n        // Optional node dependencies can be safely ignored\n        new webpack.IgnorePlugin({\n            checkResource: resource => ignoredResources.has(resource)\n        }),\n        new MonacoWebpackPlugin()\n    ],\n    optimization: {\n        // Split and reuse code across the various entry points\n        splitChunks: {\n            chunks: 'all'\n        },\n        // Only minimize if we run webpack in production mode\n        minimize: production,\n        minimizer: [\n            new TerserPlugin({\n                exclude: /^(lib|builtins)\\//").concat(this.ifPackage(['@theia/scanoss', '@theia/ai-anthropic', '@theia/ai-openai'], function () { return ",\n                terserOptions: {\n                    keep_classnames: /AbortSignal/\n                }"; }), "\n            })\n        ]\n    },\n    ignoreWarnings: [\n        // Some packages do not have source maps, that's ok\n        /Failed to parse source map/,\n        // require with expressions are not supported\n        /the request of a dependency is an expression/,\n        // Some packages use dynamic requires, we can safely ignore them (they are handled by the native webpack plugin)\n        /require function is used in a way in which dependencies cannot be statically extracted/, {\n            module: /yargs/\n        }, {\n            module: /node-pty/\n        }, {\n            module: /require-main-filename/\n        }, {\n            module: /ws/\n        }, {\n            module: /express/\n        }, {\n            module: /cross-spawn/\n        }, {\n            module: /@parcel\\/watcher/\n        }\n    ]\n};\n\nmodule.exports = {\n    config,\n    nativePlugin,\n    ignoredResources\n};\n");
    };
    BundlerGenerator.prototype.compileESBuildBrowserConfig = function () {
        return "/**\n * Don't touch this file. It will be regenerated by theia build.\n * To customize the build process, change ./esbuild.mjs\n */\nimport { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill';\nimport { copy } from 'esbuild-plugin-copy';\nimport { monacoNlsPlugin, problemMatcherPlugin } from '@theia/bundle-plugin';\nimport yargs from 'yargs';\nimport resolvePackagePath from 'resolve-package-path';\nimport path from 'node:path';\nimport { fileURLToPath } from 'node:url';\n\nexport const __dirname = path.dirname(fileURLToPath(import.meta.url));\n\nexport function join(...parts) {\n    return path.join(...parts).replace(/\\\\/g, '/');\n}\n\nconst { mode, watch } = yargs.option('mode', {\n    description: \"Mode to use\",\n    choices: [\"development\", \"production\"],\n    default: \"production\"\n}).option('watch', {\n    description: 'Controls whether to enable watch mode',\n    type: 'boolean',\n    default: false\n}).argv;\n\nconst production = mode === 'production';\nconst sourcemap = production ? false : 'linked';\nconst minify = production;\n\nexport { mode, watch, sourcemap, minify };\n\n/**\n * @type {Record<string, import('esbuild').Loader>}\n */\nexport const loader = {\n    '.css': 'css',\n    '.ttf': 'dataurl',\n    '.eot': 'dataurl',\n    '.svg': 'dataurl',\n    '.woff': 'dataurl',\n    '.woff2': 'dataurl',\n    '.jpg': 'dataurl',\n    '.png': 'dataurl',\n    '.gif': 'dataurl',\n    '.wasm': 'dataurl',\n    '.plist': 'dataurl',\n    '.node': 'file'\n};\n\n/**\n * @type {import('esbuild').BuildOptions}\n */\nexport const browserOptions = {\n    entryPoints: {\n        'bundle': './src-gen/frontend/index.js',\n        'secondary-window': './src-gen/frontend/secondary-index.js',\n        ".concat(this.ifMonaco(function () { return "'editor.worker': '@theia/monaco-editor-core/esm/vs/editor/common/services/editorWebWorkerMain.js',"; }), "\n        ").concat(this.ifPackage('@theia/plugin-ext', "'plugin-worker': '@theia/plugin-ext/lib/hosted/browser/worker/worker-main.js',"), "\n    },\n    assetNames: '[name]',\n    bundle: true,\n    outdir: 'lib/frontend',\n    platform: 'browser',\n    // Support UMD libraries\n    // but ensure that we also prioritize browser exports where possible\n    mainFields: ['browser', 'module', 'main'],\n    loader,\n    minify,\n    sourcemap,\n    plugins: [\n        problemMatcherPlugin(watch, 'browser'),\n        ").concat(this.ifMonaco(function () { return 'monacoNlsPlugin(),'; }), "\n        nodeModulesPolyfillPlugin({\n            globals: {\n                Buffer: true,\n                process: false\n            }\n        }),\n        copy({\n            assets: [\n                {\n                    // copy secondary window html file to lib folder\n                    from: join(__dirname, 'src-gen/frontend/secondary-window.html'),\n                    to: join(__dirname, 'lib', 'frontend')\n                }").concat(this.ifPackage('@theia/plugin-ext', ",\n                {\n                    // copy webview files to lib folder\n                    from: join(resolvePackagePath('@theia/plugin-ext', __dirname), '..', 'src', 'main', 'browser', 'webview', 'pre', '*'),\n                    to: join(__dirname, 'lib', 'webview', 'pre')\n                }")).concat(this.ifPackage('@theia/plugin-ext-vscode', ",\n                {\n                    // copy frontend plugin host files\n                    from: join(resolvePackagePath('@theia/plugin-ext-vscode', __dirname), '..', 'lib', 'node', 'context', 'plugin-vscode-init-fe.js'),\n                    to: join(__dirname, 'lib', 'frontend', 'context')\n                }"), "\n            ]\n        })\n    ]\n};\n");
    };
    BundlerGenerator.prototype.compileESBuildNodeConfig = function () {
        return "/**\n * Don't touch this file. It will be regenerated by theia build.\n * To customize the build process, change ./esbuild.mjs\n */\nimport { nativeDependenciesPlugin, problemMatcherPlugin } from '@theia/bundle-plugin';\nimport { watch, loader, minify, sourcemap, join, __dirname } from './gen-esbuild.browser.mjs';\nimport { copy } from 'esbuild-plugin-copy';\nimport resolvePackagePath from 'resolve-package-path';\n\n/**\n * @type {Record<string, string>}\n */\nexport const nativeBindings = {\n    drivelist: 'drivelist/build/Release/drivelist.node'\n};\n\n/**\n * @type {import('esbuild').BuildOptions}\n */\nexport const nodeOptions = {\n    entryPoints: {\n        'main': './src-gen/backend/main',\n        'ipc-bootstrap': '@theia/core/lib/node/messaging/ipc-bootstrap',\n        ".concat(this.ifElectron("'electron-main': './src-gen/backend/electron-main',"), "\n        ").concat(this.ifPackage('@theia/plugin-ext', function () { return "// VS Code extension support:\n        'plugin-host': '@theia/plugin-ext/lib/hosted/node/plugin-host',"; }), "\n        ").concat(this.ifPackage('@theia/plugin-ext-headless', function () { return "// Theia Headless Plugin support:\n        'plugin-host-headless': '@theia/plugin-ext-headless/lib/hosted/node/plugin-host-headless',"; }), "\n        ").concat(this.ifPackage('@theia/process', function () { return "// Make sure the node-pty thread workers can be executed:\n        'worker/conoutSocketWorker': 'node-pty/lib/worker/conoutSocketWorker',\n        'conpty_console_list_agent': 'node-pty/lib/conpty_console_list_agent',"; }), "\n        ").concat(this.ifPackage('@theia/dev-container', function () { return "// VS Code Dev-Container communication:\n        'dev-container-server': '@theia/dev-container/lib/dev-container-server/dev-container-server',"; }), "\n        ").concat(this.ifPackage('@theia/plugin-ext', "'backend-init-theia': '@theia/plugin-ext/lib/hosted/node/scanners/backend-init-theia',"), "\n        ").concat(this.ifPackage('@theia/filesystem', "'parcel-watcher': '@theia/filesystem/lib/node/parcel-watcher',"), "\n        ").concat(this.ifPackage('@theia/plugin-ext-vscode', "'plugin-vscode-init': '@theia/plugin-ext-vscode/lib/node/plugin-vscode-init',"), "\n        ").concat(this.ifPackage('@theia/api-provider-sample', "'gotd-api-init': '@theia/api-provider-sample/lib/plugin/gotd-api-init',"), "\n        ").concat(this.ifPackage('@theia/git', "'git-locator-host': '@theia/git/lib/node/git-locator/git-locator-host',"), "\n    },\n    assetNames: 'native/[name]',\n    bundle: true,\n    outdir: 'lib/backend',\n    platform: 'node',\n    mainFields: ['node', 'module', 'main'],\n    external: ['electron'],\n    loader,\n    minify,\n    sourcemap,\n    plugins: [\n        problemMatcherPlugin(watch, 'node'),\n        nativeDependenciesPlugin({\n            pty: ").concat(this.ifPackage('@theia/process', 'true', 'false'), ",\n            ripgrep: ").concat(this.ifPackage(['@theia/search-in-workspace', '@theia/file-search'], 'true', 'false'), ",\n            trash: ").concat(this.ifPackage('@theia/filesystem', 'true', 'false'), ",\n            nativeBindings\n        }),\n        copy({\n            assets: [").concat(this.ifPackage('@theia/terminal', "\n                {\n                    // copy shell integration scripts\n                    from: join(resolvePackagePath('@theia/terminal', __dirname), '..', 'src', 'node', 'shell-integrations', '**', '*'),\n                    to: join(__dirname, 'lib', 'backend', 'shell-integrations')\n                },"), "\n            ]\n        })\n    ]\n};\n");
    };
    BundlerGenerator.prototype.compileESBuildUserConfig = function () {
        return "/**\n * This file can be edited to adjust the ESBuild build process.\n * To reset, delete this file and rerun theia build again.\n */\nimport { browserOptions, watch } from './gen-esbuild.browser.mjs';\n".concat(this.ifBrowserOnly("import esbuild from 'esbuild';\n\nconst browserContext = await esbuild.context(browserOptions);\n\nif (watch) {\n    await browserContext.watch();\n} else {\n    try {\n        await browserContext.rebuild();\n        await browserContext.dispose();\n    } catch {\n        process.exit(1);\n    }\n}", "import { nodeOptions } from './gen-esbuild.node.mjs';\n".concat(this.ifElectron("import { electronOptions } from './gen-esbuild.electron.mjs';"), "\nimport esbuild from 'esbuild';\n\nconst browserContext = await esbuild.context(browserOptions);\nconst nodeContext = await esbuild.context(nodeOptions);\n").concat(this.ifElectron('const electronContext = await esbuild.context(electronOptions);'), "\n\nif (watch) {\n    await Promise.all([\n        browserContext.watch(),\n        nodeContext.watch(),").concat(this.ifElectron("\n        electronContext.watch(),"), "\n    ]);\n} else {\n    try {\n        await browserContext.rebuild();\n        await browserContext.dispose();\n        await nodeContext.rebuild();\n        await nodeContext.dispose();").concat(this.ifElectron("\n        await electronContext.rebuild();\n        await electronContext.dispose();"), "\n    } catch {\n        process.exit(1);\n    }\n}")), "\n");
    };
    BundlerGenerator.prototype.compileESBuildElectronConfig = function () {
        return "/**\n * Don't touch this file. It will be regenerated by theia build.\n * To customize the build process, change ./esbuild.mjs\n */\nimport { problemMatcherPlugin } from '@theia/bundle-plugin';\nimport { watch, loader, minify, sourcemap } from './gen-esbuild.browser.mjs';\n\n/**\n * @type {import('esbuild').BuildOptions}\n */\nexport const electronOptions = {\n    entryPoints: {\n        'preload': './src-gen/frontend/preload'\n    },\n    bundle: true,\n    outdir: 'lib/frontend',\n    platform: 'node',\n    mainFields: ['node', 'module', 'main'],\n    external: ['electron'],\n    loader,\n    minify,\n    sourcemap,\n    plugins: [\n        problemMatcherPlugin(watch, 'electron')\n    ]\n};\n";
    };
    return BundlerGenerator;
}(abstract_generator_1.AbstractGenerator));
exports.BundlerGenerator = BundlerGenerator;
