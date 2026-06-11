/**
 * This file can be edited to customize webpack configuration.
 * To reset delete this file and rerun theia build again.
 */
// @ts-check
const path = require('path');
const resolvePackagePath = require('resolve-package-path');
const configs = require('./gen-webpack.config.js');
const nodeConfig = require('./gen-webpack.node.config.js');

/** Off-main-thread transcript markdown (markdown-it + DOMPurify). */
const qaapTranscriptMarkdownWorkerEntry = path.join(
    path.dirname(resolvePackagePath('@theia/qaap-mobile-shell', __dirname)),
    'lib/browser/qaap-transcript-markdown-worker.js',
);

/**
 * Expose bundled modules on window.theia.moduleName namespace, e.g.
 * window['theia']['@theia/core/lib/common/uri'].
 * Such syntax can be used by external code, for instance, for testing.
 */
configs[0].module.rules.push({
    test: /\.js$/,
    loader: require.resolve('@theia/application-manager/lib/expose-loader')
});


module.exports = [
    ...configs,
    {
        mode: configs[0].mode,
        devtool: 'source-map',
        entry: {
            'qaap-transcript-markdown-worker': qaapTranscriptMarkdownWorkerEntry,
        },
        output: {
            filename: '[name].js',
            path: configs[0].output.path,
            devtoolModuleFilenameTemplate: 'webpack:///[resource-path]?[loaders]',
            globalObject: 'self',
        },
        target: 'webworker',
        resolve: {
            extensions: ['.js'],
            fallback: {
                child_process: false,
                crypto: false,
                net: false,
                path: require.resolve('path-browserify'),
                process: false,
                os: false,
                timers: false,
            },
        },
        module: {
            rules: configs[0].module.rules.filter(rule => {
                const test = rule.test && rule.test.toString();
                return !test || test.includes('\\.js') || test.includes('wasm');
            }),
        },
        ignoreWarnings: configs[0].ignoreWarnings,
    },
    nodeConfig.config
];
