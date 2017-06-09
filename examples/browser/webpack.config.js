const webpack = require("webpack");
const path = require("path");

module.exports = require("../../config/webpack/webpack.config")(__dirname, {
    devServer: {
        proxy: {
            '/filesystem/*': {
                target: 'ws://localhost:3000',
                ws: true
            },
            '/languages/*': {
                target: 'ws://localhost:3000',
                ws: true
            },
            '/terminals/*': {
                target: 'ws://localhost:3000',
                ws: true
            },
            '/logger/*': {
                target: 'ws://localhost:3000',
                ws: true
            },

            '*': 'http://localhost:3000'
        },
        historyApiFallback: true,
        hot: true,
        inline: true,
        stats: {
            colors: true,
            warnings: false
        },
        host: process.env.HOST || '127.0.0.1',
        port: process.env.PORT
    }, plugins: [
        new webpack.HotModuleReplacementPlugin()
    ],
    resolve: {
	// These shims are needed for bunyan
	alias: {
            'dtrace-provider': path.resolve(__dirname, './webpack_empty.js'),
	    'safe-json-stringify': path.resolve(__dirname, './webpack_empty.js'),
            mv: path.resolve(__dirname, './webpack_empty.js'),
            'source-map-support': path.resolve(__dirname, './webpack_empty.js')
	}
    }
});
