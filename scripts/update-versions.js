/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
// @ts-check
const fs = require('fs');
const writeJsonFile = require('write-json-file');
const paths = require('path');

function update(name, cwd, prefix) {
    const packagePath = paths.resolve(cwd, 'package.json');
    const extPackagePath = paths.resolve(cwd, prefix + '.package.json');
    if (fs.existsSync(packagePath) && fs.existsSync(extPackagePath)) {
        const pck = require(packagePath);
        const extPck = require(extPackagePath);
        extPck.version = pck.version;
        if (!!pck.dependencies && !!extPck.dependencies) {
            for (const name of Object.keys(pck.dependencies).filter(key => key.startsWith('@theia/'))) {
                if (name in extPck.dependencies) {
                    extPck.dependencies[name] = pck.dependencies[name];
                }
            }
        }
        // @ts-ignore
        writeJsonFile.sync(extPackagePath, extPck, { detectIndent: true });
    }
}

function updateAll(path, prefix) {
    const children = fs.readdirSync(path);
    for (const child of children) {
        const cwd = paths.resolve(path, child);
        update(child, cwd, prefix);
    }
}

updateAll(paths.resolve(__dirname, '../packages'), 'extension');
update('browser', paths.resolve(__dirname, '../examples/browser'), 'theia');
update('electron', paths.resolve(__dirname, '../examples/electron'), 'theia');