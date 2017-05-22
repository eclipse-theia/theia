// @ts-check
'use strict'

const fs = require("fs-extra");
const path = require("path");
const chokidar = require("chokidar");
const packageJsonFinder = require("find-package-json");

const fileDependencyPrefix = "file:"
const nodeModules = "node_modules";

function removeFile(targetFilePath) {
    return new Promise((resolve, reject) => {
        fs.exists(targetFilePath, function (exists) {
            if (exists) {
                fs.stat(targetFilePath, (err, stats) => {
                    if (err) {
                        reject(err)
                    } else if (stats.isFile()) {
                        fs.unlink(targetFilePath, function (err) {
                            if (err) {
                                reject(err)
                            } else {
                                resolve();
                            }
                        });
                    }
                })
            }
        });
    })
}

function isOSX() {
    return process.platform === 'darwin';
}

function getOptions() {
    const options = {
        ignored: /(^|[\/\\])\../,
        alwaysStat: true,
        ignoreInitial: true
    };
    if (!isOSX()) {
        options.awaitWriteFinish = {
            /* To avoid getting change events before files are
                * completely written, wait until they are stable for
                * 100ms second before firing the event. */
            stabilityThreshold: 100,
        }
    }
    return options;
}

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
            const targetPath = path.join(currentRoot, nodeModules, dependency, fileLocation);
            if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                const sourcePath = path.join(upstreamRoot, fileLocation);
                console.log("Adding a watch on", sourcePath);
                chokidar.watch(sourcePath, getOptions()).on("all", function (event, filePath, stat) {
                    const relativeFilePath = path.relative(sourcePath, filePath);
                    const targetFilePath = path.resolve(targetPath, relativeFilePath);
                    if (stat) { // add, addDir, change 
                        if (stat.isFile()) {
                            fs.copy(filePath, targetFilePath, function (err) {
                                if (err) {
                                    console.error("Error while copying file to '" + targetFilePath + "'.", err);
                                } else {
                                    console.log("Updated file under '" + targetFilePath + "'.");
                                }
                            });
                        }
                    } else { // unlink, unlinkDir
                        removeFile(targetFilePath).then(
                            () => console.log("Removed file from '" + targetFilePath + "'."),
                            reason => console.error("Error while trying to delete file under " + targetFilePath + ".", reason)
                        );
                    }
                });
            }
        }
    }
})();
