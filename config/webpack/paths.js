const path = require('path');

module.exports = function (dirname) {
    return {
        PROJECT_ROOT: path.resolve(dirname, '.'),
        SRC: path.resolve(dirname, 'src'),
        BUILD_ROOT: path.resolve(dirname, 'lib'),
        BUILD_WEB: path.resolve(dirname, 'lib/web'),
        BUILD_ELECTRON: path.resolve(dirname, 'lib/electron'),
        ENTRY_WEB: path.resolve(dirname, 'src/web/index.ts'),
        ENTRY_ELECTRON: path.resolve(dirname, 'src/electron/index.ts'),
        NODE_MODULES: path.resolve(dirname, 'node_modules')
    };
};