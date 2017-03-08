const paths = require('./paths');

module.exports = function (dirname) {
    return {
        output: {
            path: paths(dirname).BUILD_WEB
        },

        target: 'web',

        node: {
            fs: 'empty',
            child_process: 'empty',
            net: 'empty'
        },

        devServer: {
            inline: true,
            hot: true
        }
    };
};