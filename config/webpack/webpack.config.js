const webpack = require('webpack');
const merge = require('webpack-merge');
const minimist = require('minimist');
const paths = require('./paths');
const rules = require('./rules');
const electronConfiguration = require('./webpack.config.electron');
const webConfiguration = require('./webpack.config.web');

module.exports = function (dirname, config) {
    const root = paths(dirname).PROJECT_ROOT;
    const commonConfiguration = {

        entry: paths(dirname).ENTRY,

        output: {
            filename: 'bundle.js'
        },

        module: {
            rules: rules(dirname)
        },

        resolve: {
            extensions: ['.ts', '.js']
        }

    };
    const argv = minimist(process.argv.slice(2));
    const electron = (argv && argv.target === 'electron');
    return merge(merge(commonConfiguration, electron ? electronConfiguration(dirname) : webConfiguration(dirname)), config);
};