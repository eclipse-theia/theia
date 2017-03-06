module.exports = function (config, dirname, argv) {

    const webpack = require('webpack');
    const paths = require('../webpack/paths')(dirname);
    const webpackConfig = require('../webpack/webpack.config')(dirname);
    if (!argv) {
        argv = {
            grep: '*'
        }
    }

    config.set({
        basePath: dirname,
        frameworks: ['mocha'],
        files: [
            'test/path.spec.ts' //This is relative to the base path.
        ],
        exclude: [
        ],
        preprocessors: {
            'test/path.spec.ts': ['webpack', 'sourcemap']
        },
        mime: {
            'text/x-typescript': ['ts','tsx'] // Supports PhantomJS for TS.
        },
        webpack: {
            module: webpackConfig.module,
            resolve: webpackConfig.resolve,
            devtool: 'inline-source-map',
            plugins: [
                new webpack.SourceMapDevToolPlugin({
                    filename: null,
                    test: /\.(ts|js)($|\?)/i,
                    moduleFilenameTemplate: "[absolute-resource-path]",
                    fallbackModuleFilenameTemplate: "[absolute-resource-path]?[hash]"
                })
            ],
            node: {
                fs: 'empty',
                child_process: 'empty'
            },
            stats: {
                warnings: false
            }
        },
        webpackServer: {
            noInfo: true
        },
        client: {
            mocha: {
                grep: argv.grep
            }
        },
        reporters: ['mocha'],
        port: 9876,
        colors: true,
        logLevel: config.LOG_INFO,
        autoWatch: true,
        browsers: ['Chrome'],
        singleRun: false,
        concurrency: Infinity
    });

    return config;
};