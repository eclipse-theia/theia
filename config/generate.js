/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const packagesPath = path.resolve(__dirname, '../packages');
const children = fs.readdirSync(packagesPath);
for (const child of children) {
    const cwd = path.resolve(packagesPath, child);
    if (fs.existsSync(path.resolve(cwd, 'extension.package.json'))) {
        const command = 'yo';
        const args = ['theia:extension', '--force'];
        console.log(`${child}: ${command} ${args.join(' ')}`);
        const process = cp.spawn(command, args, { cwd });
        process.on('error', err =>
            console.error(`${child}: ${err.message}`)
        );
        process.stdout.on('data', data =>
            console.log(`${child}: ${data}`)
        );
        process.stderr.on('data', data =>
            console.error(`${child}: ${data}`)
        );
    }
}
