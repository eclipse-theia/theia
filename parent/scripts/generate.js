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
const { EOL } = require('os');
const colors = require('colors');

const colorWheel = [
    colors.cyan,
    colors.magenta,
    colors.blue,
    colors.yellow,
    colors.green
];

const yo = paths.resolve(process.cwd(), 'node_modules', '.bin', 'yo');

function spawn(args, options, error, log) {
    if (process.platform !== 'win32') {
        const p = cp.spawn(yo, args, options);
        p.on('error', err => {
            error(err);
            process.exit(1);
        });

        let output = EOL;
        p.stdout.on('data', data => output += data);

        let erroutput = EOL;
        p.stderr.on('data', data => erroutput += data);

        p.on('exit', code => {
            if (erroutput.trim()) {
                error(erroutput);
            }
            if (output.trim()) {
                log(output);
            }
            if (code !== 0) {
                process.exit(code);
            }
        });
    } else {
        const p = cp.spawnSync('cmd', ['/c', yo, ...args], options);
        if (p.error) {
            error(p.error);
            process.exit(1);
        }
        if (p.output) {
            log(p.output);
        }
        if (p.status !== 0) {
            process.exit(p.status);
        }
    }
}

let colorIndex = 0;
function generate(name, cwd, prefix, target) {
    if (fs.existsSync(paths.resolve(cwd, prefix + '.package.json'))) {
        const displayName = colorWheel[colorIndex++ % colorWheel.length](`${name}:`);
        const args = ['theia:' + target, '--force'];
        console.log(displayName, `${paths.basename(yo)} ${args.join(' ')}`);
        spawn(args, { cwd, env: process.env },
            msg => console.error(displayName, colors.red(msg)),
            msg => console.log(displayName, msg)
        );
    }
}

function generateAll(path, prefix, target) {
    const children = fs.readdirSync(path);
    for (const child of children) {
        const cwd = paths.resolve(path, child);
        generate(child, cwd, prefix, target);
    };
}

generateAll(paths.resolve(__dirname, '../../packages'), 'extension', 'extension');
generate('browser', paths.resolve(__dirname, '../../examples/browser'), 'theia', 'browser');
generate('electron', paths.resolve(__dirname, '../../examples/electron'), 'theia', 'electron');