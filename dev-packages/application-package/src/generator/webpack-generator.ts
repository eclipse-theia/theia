/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
const CopyWebpackPlugin = require('copy-webpack-plugin');
const CircularDependencyPlugin = require('circular-dependency-plugin');

const outputPath = path.resolve(__dirname, 'lib');
const development = process.env.NODE_ENV === 'development';${this.ifMonaco(() => `

const monacoEditorPath = development ? '${this.resolve('monaco-editor-core', 'dev/vs')}' : '${this.resolve('monaco-editor-core', 'min/vs')}';
const monacoLanguagesPath = '${this.resolve('monaco-languages', 'release')}';
const monacoCssLanguagePath = '${this.resolve('monaco-css', 'release/min')}';
const monacoJsonLanguagePath = '${this.resolve('monaco-json', 'release/min')}';
const monacoHtmlLanguagePath = '${this.resolve('monaco-html', 'release/min')}';`)}${this.ifBrowser(`

const requirePath = '${this.resolve('requirejs', 'require.js')}';`)}

module.exports = {
    entry: path.resolve(__dirname, 'src-gen/frontend/index.js'),
    output: {
        filename: 'bundle.js',
        path: outputPath
    },
    target: '${this.ifBrowser('web', 'electron-renderer')}',
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
                test: /\\.css$/,
                loader: 'style-loader!css-loader'
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
                test: /node_modules.+xterm.+\.map$/,
                loader: 'ignore-loader'
            },
            {
                /* Get rid of :

                   @theia/example-electron: WARNING in /home/emaisin/src/theia/~/xterm/lib/addons/attach/index.html
                   @theia/example-electron: Module parse failed: /home/emaisin/src/theia/node_modules/xterm/lib/addons/attach/index.html Unexpected token (1:0)
                   @theia/example-electron: You may need an appropriate loader to handle this file type.

                   See: https://github.com/theia-ide/theia/pull/688#issuecomment-338289418
                */

                test: /node_modules\\/xterm\\/lib\\/addons\\/attach\\/index\\.html/,
                loader: 'ignore-loader',
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
                exclude: /jsonc-parser/
            },
            {
                test: /\\.woff(2)?(\\?v=[0-9]\\.[0-9]\\.[0-9])?$/,
                loader: "url-loader?limit=10000&mimetype=application/font-woff"
            }
        ],
        noParse: /vscode-languageserver-types|vscode-uri|jsonc-parser/
    },
    resolve: {
        extensions: ['.js']${this.ifMonaco(() => `,
        alias: {
            'vs': path.resolve(outputPath, monacoEditorPath)
        }`)}
    },
    devtool: 'source-map',
    plugins: [
        new webpack.HotModuleReplacementPlugin(),
        new CopyWebpackPlugin([${this.ifBrowser(`
            {
                from: requirePath,
                to: '.'
            },`)}${this.ifMonaco(() => `
            {
                from: monacoEditorPath,
                to: 'vs'
            },
            {
                from: monacoLanguagesPath,
                to: 'vs/basic-languages'
            },
            {
                from: monacoCssLanguagePath,
                to: 'vs/language/css'
            },
            {
                from: monacoJsonLanguagePath,
                to: 'vs/language/json'
            },
            {
                from: monacoHtmlLanguagePath,
                to: 'vs/language/html'
            }`)}
        ]),
        new CircularDependencyPlugin({
            exclude: /(node_modules|examples)\\/./,
            failOnError: false // https://github.com/nodejs/readable-stream/issues/280#issuecomment-297076462
        })
    ],
    stats: {
        warnings: true
    }
};`;
    }

}
