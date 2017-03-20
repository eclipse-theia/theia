const webpack = require("webpack");

module.exports = require("../config/webpack/webpack.config")(__dirname, {
    devServer: {
        proxy: {
            '/fileSystem/*': {
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
        host: process.env.HOST || '0.0.0.0',
        port: process.env.PORT
    }, plugins: [
        new webpack.HotModuleReplacementPlugin()
    ]
});