import fixPath = require('fix-path');
/**
 * @deprecated since 1.77.0. The generated `electron-main.js` no longer blocks on `fix-path`; the `ShellEnvironment`
 * service of `@theia/core/lib/electron-main/shell-environment` resolves the `PATH` of the login shell asynchronously.
 */
export = fixPath;
