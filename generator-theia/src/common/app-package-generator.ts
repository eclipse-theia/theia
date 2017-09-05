/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import Base = require('yeoman-generator');
import { AbstractGenerator, sortByKey } from '../common';
import { NodePackage } from "./generator-model";

export class AppPackageGenerator extends AbstractGenerator {

    generate(fs: Base.MemFsEditor): void {
        fs.writeJSON('package.json', this.compilePackage());
        if (!fs.exists('webpack.config.js')) {
            fs.write('webpack.config.js', this.compileWebpackConfig());
        }
    }

    protected compilePackage(): NodePackage {
        const scripts = this.isWeb() ? {
            "start": "yarn run build && node ./src-gen/backend/main.js --port=3000| bunyan",
            "start:debug": "yarn run build && node ./src-gen/backend/main.js --port=3000 --loglevel=debug | bunyan",
        } : {
                "start": "yarn run build && electron ./src-gen/frontend/electron-main.js --hostname=localhost | bunyan",
                "start:debug": "yarn run build && electron ./src-gen/frontend/electron-main.js --hostname=localhost --loglevel=debug | bunyan"
            };
        const devDependencies = this.isWeb() ? {
            "webpack-dev-server": "^2.5.0"
        } : {
                "electron": "^1.6.11",
                "electron-rebuild": "^1.5.11"
            };
        return {
            ...this.model.pck,
            "dependencies": sortByKey({
                ...this.model.pck.dependencies
            }),
            "scripts": sortByKey({
                "clean": "rimraf lib",
                "build": `webpack && shx cp ${this.srcGen()}/frontend/index.html lib`,
                "watch": "yarn run build && webpack --watch",
                ...scripts,
                ...this.model.pck.scripts
            }),
            "devDependencies": sortByKey({
                "rimraf": "^2.6.1",
                "concurrently": "^3.5.0",
                "bunyan": "^1.8.10",
                "webpack": "^2.2.1",
                "copy-webpack-plugin": "^4.0.1",
                "circular-dependency-plugin": "^2.0.0",
                "css-loader": "^0.28.1",
                "file-loader": "^0.11.1",
                "source-map-loader": "^0.2.1",
                "shx": "^0.2.2",
                "url-loader": "^0.5.8",
                "font-awesome-webpack": "0.0.5-beta.2",
                "less": "^2.7.2",
                ...devDependencies,
                ...this.model.pck.devDependencies
            })
        }
    }

    protected compileWebpackConfig(): string {
        return `${this.compileCopyright()}
// @ts-check
const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const CircularDependencyPlugin = require('circular-dependency-plugin');

const outputPath = path.resolve(__dirname, 'lib');

const monacoEditorPath = '${this.node_modulesPath()}/monaco-editor-core/min/vs';
const monacoLanguagesPath = '${this.node_modulesPath()}/monaco-languages/release';
const monacoCssLanguagePath = '${this.node_modulesPath()}/monaco-css/release/min';
const monacoJsonLanguagePath = '${this.node_modulesPath()}/monaco-json/release/min';
const monacoHtmlLanguagePath = '${this.node_modulesPath()}/monaco-html/release/min';${this.ifWeb(`
const requirePath = '${this.node_modulesPath()}/requirejs/require.js';

const port = require('yargs').argv.port || 3000;`)}

module.exports = {
    entry: path.resolve(__dirname, 'src-gen/frontend/index.js'),
    output: {
        filename: 'bundle.js',
        path: outputPath
    },
    target: '${this.model.target}',
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
                test: /\\.js$/,
                enforce: 'pre',
                loader: 'source-map-loader'
            },
            {
                test: /\\.woff(2)?(\\?v=[0-9]\\.[0-9]\\.[0-9])?$/,
                loader: "url-loader?limit=10000&mimetype=application/font-woff"
            }
        ],
        noParse: /vscode-languageserver-types|vscode-uri/
    },
    resolve: {
        extensions: ['.js'],
        alias: {
            'vs': path.resolve(outputPath, monacoEditorPath)
        }
    },
    devtool: 'source-map',
    plugins: [
        new webpack.HotModuleReplacementPlugin(),
        new CopyWebpackPlugin([${this.ifWeb(`
            {
                from: requirePath,
                to: '.'
            },`)}
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
            }
        ]),
        new CircularDependencyPlugin({
            exclude: /(node_modules|examples)\\/./,
            failOnError: false // https://github.com/nodejs/readable-stream/issues/280#issuecomment-297076462
        })
    ],
    stats: {
        warnings: true
    }${this.ifWeb(`,
    devServer: {
        inline: true,
        hot: true,
        proxy: {
            '/services/*': {
                target: 'ws://localhost:' + port,
                ws: true
            },
            '*': 'http://localhost:' + port,
        },
        historyApiFallback: true,
        stats: {
            colors: true,
            warnings: false
        },
        host: process.env.HOST,
        port: process.env.PORT
    }`)}
};`
    }

}