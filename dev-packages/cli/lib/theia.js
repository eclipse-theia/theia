/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
// @ts-check

const path = require('path');
const fs = require('fs-extra');
const cp = require('child_process');

const cwd = process.cwd();
const env = process.env;

function promisify(p) {
    return new Promise((resolve, reject) => {
        p.on('error', reject);
        p.on('close', resolve);
    })
}
function run(command, args = []) {
    const commandPath = path.resolve(__dirname, '..', 'node_modules', '.bin', command);
    if (process.platform === 'win32') {
        return cp.spawn(commandPath + '.cmd', args, { cwd, env });
    }
    return cp.spawn(commandPath, args, { cwd, env });
}
function shell(command, args) {
    const commandProcess = run(command, args);
    commandProcess.stdout.pipe(process.stdout);
    commandProcess.stderr.pipe(process.stderr);
    return promisify(commandProcess);
}
async function bunyan(childProcess, args = []) {
    const bunyanProcess = run('bunyan');
    childProcess.stdout.pipe(bunyanProcess.stdin);
    childProcess.stderr.pipe(bunyanProcess.stdin);
    return promisify(bunyanProcess);
}

function restArgs(arg) {
    const restIndex = process.argv.indexOf(arg);
    return restIndex !== -1 ? process.argv.slice(restIndex + 1) : [];
}

function project(...paths) {
    return path.resolve(process.cwd(), ...paths);
}
function lib(...paths) {
    return project('lib', ...paths);
}
function srcGen(...paths) {
    return project('src-gen', ...paths);
}
function frontend(...paths) {
    return srcGen('frontend', ...paths);
}
function backend(...paths) {
    return srcGen('backend', ...paths);
}

async function clean() {
    await shell('rimraf', ['lib']);
}
async function copy() {
    fs.ensureDirSync(lib());
    fs.copySync(frontend('index.html'), lib('index.html'));
}
async function build() {
    await copy();
    await shell('webpack', restArgs('build'));
}
async function electron() {
    await build();

    const args = restArgs('electron')
    if (!args.some(arg => arg.startsWith('--hostname='))) {
        args.push('--hostname=localhost');
    }

    await bunyan(run('electron', [frontend('electron-main.js'), ...args]));
}
async function browser() {
    await build();

    const args = restArgs('browser')
    if (!args.some(arg => arg.startsWith('--port='))) {
        args.push('--port=3000');
    }

    await bunyan(cp.fork(backend('main.js'), args, {
        stdio: [0, 'pipe', 'pipe', 'ipc']
    }));
}

require('yargs')
    .command({
        command: 'clean',
        handler: clean
    })
    .command({
        command: 'copy',
        handler: copy
    })
    .command({
        command: 'build',
        handler: build
    })
    .command({
        command: 'electron',
        handler: electron
    })
    .command({
        command: 'browser',
        handler: browser
    })
    .command({
        command: 'rebuild',
        handler: () => require('./rebuild')
    })
    .demandCommand(1)
    .argv;
