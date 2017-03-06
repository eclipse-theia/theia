module.exports = function(config) {
    const karma = require('../../config/karma/webpack-karma.config')(config, __dirname);
    config.set(karma);
    return karma;
};