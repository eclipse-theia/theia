const path = require('path');

module.exports = function (dirname) {
    return {
        PROJECT_ROOT: path.resolve(dirname, '.'),
        SRC_GEN: path.resolve(dirname, 'src-gen'),
        BUILD_ROOT: path.resolve(dirname, 'lib'),
        ENTRY: path.resolve(dirname, 'src-gen/frontend/index.js'),
        NODE_MODULES: path.resolve(dirname, 'node_modules')
    };
};