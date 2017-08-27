/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
// @ts-check
const path = require('path');
const {
    sharedModules,
    verbose
} = require('yargs').demandOption('sharedModules').argv;
const fs = require('fs-extra');

const linked = {};

function linkDependency(dependency, pckNodeModules) {
    if (linked[dependency] !== undefined) {
        return undefined;
    }
    linked[dependency] = false;
    const src = path.resolve(sharedModules, dependency);
    if (!fs.existsSync(src)) {
        return undefined;
    }
    const dest = path.resolve(pckNodeModules, dependency);
    if (!fs.existsSync(dest)) {
        fs.ensureSymlinkSync(src, dest, 'dir');
        linked[dependency] = true;
        if (verbose) {
            console.log('Linked ' + dependency + ' to ' + pckNodeModules);
        }
    }
    return src;
}

function loadPackage(pckDir) {
    if (!pckDir) {
        return undefined;
    }
    const pckPath = path.resolve(pckDir, 'package.json');
    if (!fs.existsSync(pckPath)) {
        return undefined;
    }
    return require(pckPath);
}

function linkDependencies(pck, pckNodeModules) {
    // @ts-ignore
    const allDependencies = Object.assign({}, pck.dependencies, pck.peerDependencies, pck.optionalDependencies);
    for (const dependency in allDependencies) {
        const depPckDir = linkDependency(dependency, pckNodeModules);
        linkPackage(depPckDir, pckNodeModules);
    }
}

function linkDevDependencies(pck, pckNodeModules) {
    if (!pck.devDependencies) {
        return;
    }
    for (const dependency in pck.devDependencies) {
        linkDependency(dependency, pckNodeModules);
    }
}

function linkPackage(pckDir, pckNodeModules) {
    const pck = loadPackage(pckDir);
    if (!pck) {
        return;
    }
    linkDependencies(pck, pckNodeModules);
}

function sharePackage(pck, pckDir) {
    const sharedPckDir = path.resolve(sharedModules, pck.name);
    if (!fs.existsSync(sharedPckDir)) {
        fs.ensureSymlinkSync(pckDir, sharedPckDir, 'dir');
    }
}

const pckDir = process.cwd();
const pck = loadPackage(pckDir);
if (pck) {
    const nodeModules = path.resolve(pckDir, 'node_modules');
    linkDependencies(pck, nodeModules);
    linkDevDependencies(pck, nodeModules);
    sharePackage(pck, pckDir);

    const linkedCount = Object.keys(linked).filter(name => linked[name] === true).length;
    console.log('Linked ' + linkedCount + ' shared dependencies in ' + nodeModules);
}
