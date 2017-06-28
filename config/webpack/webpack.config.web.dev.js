const webpack = require("webpack");
const path = require("path");

module.exports = function (dirname, port = 3000, host = 'localhost') {
    return require("./webpack.config")(dirname, {
        devServer: {
            proxy: {
                '/services/*': {
                    target: `ws://${host}:${port}`,
                    ws: true
                },
                '*': `http://${host}:${port}`
            },
            historyApiFallback: true,
            hot: true,
            inline: true,
            stats: {
                colors: true,
                warnings: false
            },
            host: process.env.HOST || host,
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
}
