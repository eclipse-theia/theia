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
    console.log('Parallel lerna execution is disabled on Windows. Falling back to sequential execution with the \'--concurrency==1\' flag.');
    const args = process.argv.slice(2);
    if (args.indexOf('--concurrency==1') === -1) {
        args.push('--concurrency==1');
    }
    const parallelIndex = args.indexOf('--parallel');
    if (parallelIndex !== -1) {
        args[parallelIndex] = '--stream';
    }
    console.log('Running lerna as: ' + args.join(' '));
    cp.spawnSync('cmd', ['/c', lernaPath, ...args], {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'pipe',
        encoding: 'utf-8'
    });
} else {
    require(lernaPath);
}