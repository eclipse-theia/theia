/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
// @ts-check
const fs = require('fs');
const paths = require('path');
const cp = require('child_process');

function spawn(command, args, options, error, log) {
    log(`${command} ${args.join(' ')}`);
    if (process.platform !== 'win32') {
        const p = cp.spawn(command, args, options);
        p.on('exit', code => {
            if (code !== 0) {
                process.exit(code)
            }
        });
        p.on('error', err => error(err));
        p.stdout.on('data', data => log(data));
        p.stderr.on('data', data => error(data));
    } else {
        const p = cp.spawnSync('cmd', ['/c', command, ...args], options);
        if (p.error) {
            error(p.error);
        }
        if (p.output) {
            log(p.output);
        }
        if (p.status !== 0) {
            process.exit(p.status);
        }
    }
}

function generate(name, cwd, prefix, target) {
    if (fs.existsSync(paths.resolve(cwd, prefix + '.package.json'))) {
        const command = 'yo';
        const args = ['theia:' + target, '--force'];
        spawn(command, args, { cwd, env: process.env },
            msg => console.error(`${name}: ${msg}`),
            msg => console.log(`${name}: ${msg}`)
        );
    }
}

function generateAll(path, prefix, target) {
    const children = fs.readdirSync(path);
    for (const child of children) {
        const cwd = paths.resolve(path, child);
        generate(child, cwd, prefix, target);
    }
}

generateAll(paths.resolve(__dirname, '../packages'), 'extension', 'extension');
generate('browser', paths.resolve(__dirname, '../examples/browser'), 'theia', 'browser');
generate('electron', paths.resolve(__dirname, '../examples/electron'), 'theia', 'electron');