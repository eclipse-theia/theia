module.exports = function () {
    return {

        target: 'web',

        node: {
            fs: 'empty',
            child_process: 'empty',
            net: 'empty',
            crypto: 'empty'
        },

        devServer: {
            inline: true,
            hot: true
        }
    };
};
