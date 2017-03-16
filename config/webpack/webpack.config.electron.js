const paths = require('./paths');

module.exports = function (dirname) {
    return {

        entry: paths(dirname).ENTRY_ELECTRON,

        output: {
            path: paths(dirname).BUILD_ELECTRON,
            libraryTarget: 'umd'
        },

        target: 'electron',

        node: {
            __dirname: false,
            __filename: false
        }
    };
};