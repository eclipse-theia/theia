/**
 * This file can be edited to customize webpack configuration.
 * To reset delete this file and rerun theia build again.
 */
// @ts-check
const webpack = require('webpack');
const configs = require('./gen-webpack.config.js');
const nodeConfig = require('./gen-webpack.node.config.js');
const { fileURLToPath } = require('url');
const { MonacoWebpackPlugin } = require('@theia/native-webpack-plugin/lib/monaco-webpack-plugins.js');

/**
 * Expose bundled modules on window.theia.moduleName namespace, e.g.
 * window['theia']['@theia/core/lib/common/uri'].
 * Such syntax can be used by external code, for instance, for testing.
 */
configs[0].module.rules.push({
    test: /\.js$/,
    loader: require.resolve('@theia/application-manager/lib/expose-loader')
});

const plugin2 = new MonacoWebpackPlugin();

// @ts-ignore
configs[0].plugins.push(plugin2);
// @ts-ignore
configs[1].plugins.push(plugin2);

module.exports = [
    ...configs,
    nodeConfig.config
];
