const webpack = require('webpack');
const merge = require('webpack-merge');
const minimist = require('minimist');
const path = require('path');
const paths = require('./paths');
const rules = require('./rules');
const electronConfiguration = require('./webpack.config.electron');
const webConfiguration = require('./webpack.config.web');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const monacoEditorPath = '../../node_modules/monaco-editor-core/dev/vs';

module.exports = function (dirname, config) {
    const commonConfiguration = {

        entry: paths(dirname).ENTRY,

        output: {
            filename: 'bundle.js'
        },

        module: {
            rules: rules(dirname)
        },

        resolve: {
            extensions: ['.ts', '.js'],
            alias: {
                'vs': path.resolve(paths(dirname).BUILD_ROOT, monacoEditorPath)
            }
        },

        devtool: 'source-map',

        plugins: [
            new CopyWebpackPlugin([
                {
                    from: monacoEditorPath,
                    to: 'vs'
                }
            ])
        ]

    };
    const argv = minimist(process.argv.slice(2));
    const electron = (argv && argv.target === 'electron');
    return merge(merge(commonConfiguration, electron ? electronConfiguration(dirname) : webConfiguration(dirname)), config);
};