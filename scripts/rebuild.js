/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
// @ts-check
const fs = require('fs-extra');
const path = require('path');
const { target } = require('yargs').argv;

const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
const browserModulesPath = path.join(__dirname, '..', '.browser_modules');
const modules = ['node-pty'];

if (target === 'electron' && !fs.existsSync(browserModulesPath)) {
    for (const module of modules) {
        const src = path.join(nodeModulesPath, module)
        const dest = path.join(browserModulesPath, module);
        fs.copySync(src, dest);
    }
    // @ts-ignore
    require('../node_modules/.bin/electron-rebuild');
} else if (target === 'browser' && fs.existsSync(browserModulesPath)) {
    for (const moduleName of modules) {
        const src = path.join(browserModulesPath, moduleName)
        const dest = path.join(nodeModulesPath, moduleName);
        fs.removeSync(dest)
        fs.copySync(src, dest);
    }
    fs.removeSync(browserModulesPath);
} else {
    console.log('native node modules are already rebuilt for ' + target)
}
