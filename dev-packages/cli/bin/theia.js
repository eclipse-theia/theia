#!/usr/bin/env node
/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
// @ts-check

const path = require('path');
const fs = require('fs-extra');

function promisify(p) {
    return new Promise((resolve, reject) => {
        p.on('error', reject);
        p.on('close', resolve);
    })
}
function bin(command) {
    return path.join(__dirname, '..', 'node_modules', '.bin', command);
}
function run(command, args = [], options = {
    stdio: [0, 1, 2, 'ipc']
}) {
    const modulePath = bin(command);
    return cp.spawn(modulePath, args, options);
}
function runAsync(command, args, options) {
    return promisify(run(command, args, options));
}
async function bunyan(childProcess, args = []) {
    const bunyan = run('bunyan', [], {
        stdio: ['pipe', 1, 2, 'ipc']
    });
    childProcess.stdout.pipe(bunyan.stdin);
    childProcess.stderr.pipe(bunyan.stdin);
    return promisify(bunyan);
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
    await runAsync('rimraf', ['lib']);
}
async function copy() {
    fs.ensureDirSync(lib());
    fs.copySync(frontend('index.html'), lib('index.html'));
}
async function build() {
    await copy();
    await runAsync('webpack', restArgs('build'));
}
async function electron() {
    await build();

    const args = restArgs('electron')
    if (!args.some(arg => arg.startsWith('--hostname='))) {
        args.push('--hostname=localhost');
    }

    await bunyan(run('electron', [frontend('electron-main.js'), ...args], {
        stdio: [0, 'pipe', 'pipe', 'ipc']
    }));
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

const cp = require('child_process');
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
