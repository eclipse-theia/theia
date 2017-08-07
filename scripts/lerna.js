/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
// @ts-check
const path = require('path');
const cp = require('child_process');

const lernaPath = path.resolve(__dirname, '..', 'node_modules', '.bin', 'lerna');

if (process.platform === 'win32') {
    process.argv.push(...['--concurrency==1']);
    cp.spawnSync('cmd', ['/c', lernaPath, ...process.argv.slice(2)], { stdio: [0, 1, 2] });
} else {
    require(lernaPath);
}