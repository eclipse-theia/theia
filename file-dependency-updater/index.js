'use strict'

const fs = require("fs-extra");
const path = require("path");
const chokidar = require("chokidar");
const minimist = require("minimist");
const packageJsonFinder = require("find-package-json");

const fileDependencyPrefix = "file:"
const nodeModules = "node_modules";

const currentPackageJson = packageJsonFinder().next().value;
const currentRoot = path.resolve(currentPackageJson.__path, "..");
for (const dependency of Object.keys(currentPackageJson.dependencies)) {
    const upstreamRelativePath = currentPackageJson.dependencies[dependency];
    if (upstreamRelativePath.startsWith(fileDependencyPrefix)) {
        const upstreamRoot = path.resolve(process.cwd(), upstreamRelativePath.split(fileDependencyPrefix).slice(-1)[0]);
        const upstreamPackageJson = packageJsonFinder(upstreamRoot).next().value;
        for (const fileLocation of upstreamPackageJson.files) {
            const targetPath = path.join(currentRoot, nodeModules, dependency, fileLocation);
            if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                const sourcePath = path.join(upstreamRoot, fileLocation);
                chokidar.watch(sourcePath, { ignored: /(^|[\/\\])\../, alwaysStat: true }).on("all", function (event, filePath, stat) {
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
                        fs.exists(targetFilePath, function (exists) {
                            if (exists) {
                                fs.unlink(destinationPath, function (err) {
                                    if (err) {
                                        console.error("Error while trying to delete file under " + targetFilePath + ".", err);
                                    } else {
                                        console.log("Removed file from '" + targetFilePath + "'.");
                                    }
                                });
                            }
                        })
                    }
                });
            }
        }
    }
}