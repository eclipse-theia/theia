/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as paths from 'path';
import { AbstractGenerator } from './abstract-generator';

export class WebpackGenerator extends AbstractGenerator {

    async generate(): Promise<void> {
        await this.write(this.configPath, this.compileWebpackConfig());
    }

    get configPath(): string {
        return this.pck.path('webpack.config.js');
    }

    protected resolve(moduleName: string, path: string): string {
        return this.pck.resolveModulePath(moduleName, path).split(paths.sep).join('/');
    }

    protected compileWebpackConfig(): string {
        return `// @ts-check
const path = require('path');
const webpack = require('webpack');
const yargs = require('yargs');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const CircularDependencyPlugin = require('circular-dependency-plugin');

const outputPath = path.resolve(__dirname, 'lib');
const { mode }  = yargs.option('mode', {
    description: "Mode to use",
    choices: ["development", "production"],
    default: "production"
}).argv;
const development = mode === 'development';${this.ifMonaco(() => `

const monacoEditorCorePath = development ? '${this.resolve('monaco-editor-core', 'dev/vs')}' : '${this.resolve('monaco-editor-core', 'min/vs')}';
const monacoCssLanguagePath = '${this.resolve('monaco-css', 'release/min')}';
const monacoHtmlLanguagePath = '${this.resolve('monaco-html', 'release/min')}';`)}

module.exports = {
    entry: path.resolve(__dirname, 'src-gen/frontend/index.js'),
    output: {
        filename: 'bundle.js',
        path: outputPath
    },
    target: '${this.ifBrowser('web', 'electron-renderer')}',
    mode,
    node: {${this.ifElectron(`
        __dirname: false,
        __filename: false`, `
        fs: 'empty',
        child_process: 'empty',
        net: 'empty',
        crypto: 'empty'`)}
    },
    module: {
        rules: [
            {
                test: /worker-main\\.js$/,
                loader: 'worker-loader',
                options: {
                    name: 'worker-ext.[hash].js'
                }
            },
            {
                test: /\\.css$/,
                exclude: /\\.useable\\.css$/,
                loader: 'style-loader!css-loader'
            },
            {
                test: /\\.useable\\.css$/,
                loader: 'style-loader/useable!css-loader'
            },
            {
                test: /\\.(ttf|eot|svg)(\\?v=\\d+\\.\\d+\\.\\d+)?$/,
                loader: 'url-loader?limit=10000&mimetype=image/svg+xml'
            },
            {
                test: /\.(jpg|png|gif)$/,
                loader: 'file-loader',
                options: {
                    name: '[path][name].[hash].[ext]',
                }
            },
            {
                // see https://github.com/theia-ide/theia/issues/556
                test: /source-map-support/,
                loader: 'ignore-loader'
            },
            {
                test: /\\.js$/,
                enforce: 'pre',
                loader: 'source-map-loader',
                exclude: /jsonc-parser|fast-plist|onigasm|(monaco-editor.*)/
            },
            {
                test: /\\.woff(2)?(\\?v=[0-9]\\.[0-9]\\.[0-9])?$/,
                loader: "url-loader?limit=10000&mimetype=application/font-woff"
            },
            {
                test: /node_modules[\\\\|\/](vscode-languageserver-types|vscode-uri|jsonc-parser)/,
                use: { loader: 'umd-compat-loader' }
            },
            {
                test: /\.wasm$/,
                loader: "file-loader",
                type: "javascript/auto",
            }
        ]
    },
    resolve: {
        extensions: ['.js']${this.ifMonaco(() => `,
        alias: {
            'vs': path.resolve(outputPath, monacoEditorCorePath)
        }`)}
    },
    devtool: 'source-map',
    plugins: [
        new CopyWebpackPlugin([${this.ifMonaco(() => `
            {
                from: monacoEditorCorePath,
                to: 'vs'
            },
            {
                from: monacoCssLanguagePath,
                to: 'vs/language/css'
            },
            {
                from: monacoHtmlLanguagePath,
                to: 'vs/language/html'
            }`)}
        ]),
        new CircularDependencyPlugin({
            exclude: /(node_modules|examples)\\/./,
            failOnError: false // https://github.com/nodejs/readable-stream/issues/280#issuecomment-297076462
        }),
    ],
    stats: {
        warnings: true
    }
};`;
    }

}
