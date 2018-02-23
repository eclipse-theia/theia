/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import fs = require('fs-extra');
import path = require('path');
import cp = require('child_process');

export function rebuild(target: 'electron' | 'browser', modules: string[]) {
    const nodeModulesPath = path.join(process.cwd(), 'node_modules');
    const browserModulesPath = path.join(process.cwd(), '.browser_modules');
    const modulesToProcess = modules || ['node-pty', 'nsfw', 'find-git-repositories'];

    if (target === 'electron' && !fs.existsSync(browserModulesPath)) {
        const dependencies: {
            [dependency: string]: string
        } = {};
        for (const module of modulesToProcess) {
            console.log("Processing " + module);
            const src = path.join(nodeModulesPath, module);
            if (fs.existsSync(src)) {
                const dest = path.join(browserModulesPath, module);
                const packJson = fs.readJsonSync(path.join(src, 'package.json'));
                dependencies[module] = packJson.version;
                fs.copySync(src, dest);
            }
        }
        const packFile = path.join(process.cwd(), "package.json");
        const packageText = fs.readFileSync(packFile);
        const pack = fs.readJsonSync(packFile);
        try {
            pack.dependencies = Object.assign({}, pack.dependencies, dependencies);
            fs.writeFileSync(packFile, JSON.stringify(pack, undefined, "  "));
            const electronRebuildPath = path.join(process.cwd(), 'node_modules', '.bin', 'electron-rebuild');
            if (process.platform === 'win32') {
                cp.spawnSync('cmd', ['/c', electronRebuildPath]);
            } else {
                require(electronRebuildPath);
            }
        } finally {
            setTimeout(() => {
                fs.writeFile(packFile, packageText);
            }, 100);
        }
    } else if (target === 'browser' && fs.existsSync(browserModulesPath)) {
        for (const moduleName of fs.readdirSync(browserModulesPath)) {
            console.log("Reverting " + moduleName);
            const src = path.join(browserModulesPath, moduleName);
            const dest = path.join(nodeModulesPath, moduleName);
            fs.removeSync(dest);
            fs.copySync(src, dest);
        }
        fs.removeSync(browserModulesPath);
    } else {
        console.log('native node modules are already rebuilt for ' + target);
    }
}
