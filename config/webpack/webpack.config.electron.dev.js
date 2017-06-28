const webpack = require("webpack");

module.exports = function (dirname) {
    return require("./webpack.config")(dirname, {
        plugins: [
            new webpack.HotModuleReplacementPlugin()
        ]
    });
}