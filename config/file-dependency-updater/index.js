// @ts-check
'use strict'

const path = require("path");
const packageJsonFinder = require("find-package-json");
const cpx = require("cpx");

const fileDependencyPrefix = "file:";
const nodeModules = "node_modules";

const verbose = process.argv.some(arg => arg === '--verbose');

function getRoot(currentPackageJson) {
    return path.resolve(currentPackageJson.__path, "..");
}

function getFileDependencies(currentPackageJson) {
    const result = [];
    for (const dependency of Object.keys(currentPackageJson.dependencies)) {
        const upstreamRelativePath = currentPackageJson.dependencies[dependency];
        if (upstreamRelativePath.startsWith(fileDependencyPrefix)) {
            const upstreamRoot = path.resolve(process.cwd(), upstreamRelativePath.split(fileDependencyPrefix).slice(-1)[0]);
            result.push({ dependency, upstreamRoot });
        }
    }
    return result;
}

function getFileLocations(root) {
    const upstreamPackageJson = packageJsonFinder(root).next().value;
    return upstreamPackageJson.files
        // fall back to lib and src
        || ['lib', 'src'];
}

function logError(message, ...optionalParams) {
    console.error(new Date().toLocaleString() + ': ' + message, ...optionalParams);
}

function logInfo(message, ...optionalParams) {
    if (verbose) {
        console.log(new Date().toLocaleString() + ': ' + message, ...optionalParams);
    }
}

/**
 * This function watches for changes in all direct, files-based, upstream npm dependencies and makes sure, that
 * all those changes propagate into the `node_modules` folder of the use-site. So that, for instance, Webpack,
 * can update the browser with the current state of the code.
 * 
 * This function locates the closest `package.json` file of the caller. That is the downstream project which could
 * depend on file-based npm packages. If that is the case, it locates all upstream packages, and watches resource
 * changes under the `files` directories. On file changes and file creations, it copies the new resources to
 * the `node_modules` of the downstream project. On file deletion, it removes the corresponding files.
 * 
 * This function requires a `tsc --watch` running on the upstream project when code needs to be compiled.
 */
(function () {
    const currentPackageJson = packageJsonFinder(undefined).next().value;
    const currentRoot = getRoot(currentPackageJson);
    for (const { dependency, upstreamRoot } of getFileDependencies(currentPackageJson)) {
        for (const fileLocation of getFileLocations(upstreamRoot)) {
            const source = path.join(upstreamRoot, fileLocation, '**', '*');
            const dest = path.join(currentRoot, nodeModules, dependency, fileLocation);
            // @ts-ignore
            const watcher = new cpx.Cpx(source, dest);
            watcher.on("watch-ready", e => logInfo('Watch directory:', watcher.base));
            watcher.on("copy", e => logInfo('Copied:', e.srcPath, '-->', e.dstPath));
            watcher.on("remove", e => logInfo('Removed:', e.path));
            watcher.on("watch-error", err => logError(err.message));

            logInfo('Clean:', watcher.src2dst(watcher.source))
            try {
                watcher.cleanSync();
            } catch (err) {
                logError('Failed to clean:', err.message);
                process.exit(1);
            }

            watcher.watch();
        }
    }
})();
