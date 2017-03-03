const webpack = require("webpack");

module.exports = require("../../config/webpack/webpack.config")(__dirname, {
    devServer: {
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