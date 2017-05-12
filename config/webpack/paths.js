const path = require('path');

module.exports = function (dirname) {
    return {
        PROJECT_ROOT: path.resolve(dirname, '.'),
        SRC: path.resolve(dirname, 'src'),
        BUILD_ROOT: path.resolve(dirname, 'lib'),
        ENTRY: path.resolve(dirname, 'src/client/index.ts'),
        NODE_MODULES: path.resolve(dirname, 'node_modules')
    };
};