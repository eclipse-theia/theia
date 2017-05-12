module.exports = function () {
    return {

        output: {
            libraryTarget: 'umd'
        },

        target: 'electron',

        node: {
            __dirname: false,
            __filename: false
        }
    };
};
