const paths = require('./paths');

module.exports = function (dirname) {
    return {
        output: {
            path: paths(dirname).BUILD_ELECTRON
        },

        target: 'electron',

        node: {
            __dirname: false,
            __filename: false
        }
    };
};