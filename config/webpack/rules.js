const paths = require('./paths');

module.exports = function (dirname) {
    return [
        {
            test: /\.tsx?$/,
            exclude: [
                paths(dirname).NODE_MODULES
            ],
            loader: 'ts-loader'
        },
        {
            test: /\.css$/,
            loader: 'style-loader!css-loader'
        },
        {
            test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
            loader: 'url-loader?limit=10000&mimetype=image/svg+xml'
        }
    ];
};