module.exports = function(config) {
    const argv = require('minimist')(process.argv.slice(2));
    const karma = require('../../config/karma/webpack-karma.config')(config, __dirname, argv);
    config.set(karma);
    return karma;
};