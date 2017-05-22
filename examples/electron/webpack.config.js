const webpack = require("webpack");

module.exports = require("../../config/webpack/webpack.config")(__dirname, {
    plugins: [
        new webpack.HotModuleReplacementPlugin()
    ]
});