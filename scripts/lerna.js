/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
// @ts-check
const path = require('path');

const lernaPath = path.resolve(__dirname, '..', 'node_modules', 'lerna', 'bin', 'lerna');

if (process.platform === 'win32') {
    console.log('Parallel lerna execution is disabled on Windows. Falling back to sequential execution with the \'--concurrency==1\' flag.');
    if (process.argv.indexOf('--concurrency==1') === -1) {
        process.argv.push('--concurrency==1');
    }
    const parallelIndex = process.argv.indexOf('--parallel');
    if (parallelIndex !== -1) {
        process.argv[parallelIndex] = '--stream';
    }
    console.log('Running lerna as: ' + process.argv.join(' '));
}
require(lernaPath);