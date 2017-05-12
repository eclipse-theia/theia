const paths = require('./paths');

module.exports = function (dirname) {
    return {

        entry: paths(dirname).ENTRY,

        output: {
            path: paths(dirname).BUILD_ROOT,
            libraryTarget: 'umd'
        },

        target: 'electron',

        node: {
            __dirname: false,
            __filename: false
        }
    };
};