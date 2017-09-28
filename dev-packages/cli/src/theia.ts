/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import * as cp from 'child_process';
import * as yargs from 'yargs';
import { rebuild } from './rebuild';
import { CommonAppGenerator } from './generator';

const cwd = process.cwd();
const env = process.env;

function promisify(p: cp.ChildProcess): Promise<string> {
    return new Promise((resolve, reject) => {
        p.on('error', reject);
        p.on('close', resolve);
    });
}
function resolveBin(command: string): string {
    const commandPath = path.resolve(__dirname, '..', 'node_modules', '.bin', command);
    if (process.platform === 'win32') {
        return commandPath + '.cmd';
    }
    return commandPath;
}
function run(command: string, args: string[] = []): cp.ChildProcess {
    const binPath = resolveBin(command);
    return cp.spawn(binPath, args, { cwd, env });
}
function shell(command: string, args: string[]): Promise<string> {
    const commandProcess = run(command, args);
    commandProcess.stdout.pipe(process.stdout);
    commandProcess.stderr.pipe(process.stderr);
    return promisify(commandProcess);
}
async function bunyan(childProcess: cp.ChildProcess): Promise<string> {
    const bunyanPath = resolveBin('bunyan');
    const bunyanProcess = cp.spawn(bunyanPath, [], { cwd, env, stdio: ['pipe', 1, 2] });
    childProcess.stdout.pipe(bunyanProcess.stdin);
    childProcess.stderr.pipe(bunyanProcess.stdin);
    return promisify(bunyanProcess);
}

function restArgs(arg: string): string[] {
    const restIndex = process.argv.indexOf(arg);
    return restIndex !== -1 ? process.argv.slice(restIndex + 1) : [];
}

function project(...paths: string[]): string {
    return path.resolve(process.cwd(), ...paths);
}
function lib(...paths: string[]): string {
    return project('lib', ...paths);
}
function srcGen(...paths: string[]): string {
    return project('src-gen', ...paths);
}
function frontend(...paths: string[]): string {
    return srcGen('frontend', ...paths);
}
function backend(...paths: string[]): string {
    return srcGen('backend', ...paths);
}

async function clean(): Promise<void> {
    await shell('rimraf', ['lib']);
}
async function copy(): Promise<void> {
    fs.ensureDirSync(lib());
    fs.copySync(frontend('index.html'), lib('index.html'));
}
async function generate(): Promise<void> {
    const { target } = yargs.argv;
    const generator = new CommonAppGenerator({
        projectPath: process.cwd(),
        target
    });
    await generator.generate();
}
async function build(): Promise<void> {
    await copy();
    await shell('webpack', restArgs('build'));
}
async function electron(): Promise<void> {
    await build();

    const args = restArgs('electron');
    if (!args.some(arg => arg.startsWith('--hostname='))) {
        args.push('--hostname=localhost');
    }

    await bunyan(run('electron', [frontend('electron-main.js'), ...args]));
}
async function browser(): Promise<void> {
    await build();

    const args = restArgs('browser');
    if (!args.some(arg => arg.startsWith('--port='))) {
        args.push('--port=3000');
    }

    await bunyan(cp.fork(backend('main.js'), args, {
        stdio: [0, 'pipe', 'pipe', 'ipc']
    }));
}

// tslint:disable-next-line:no-unused-expression
yargs
    .command({
        command: 'clean',
        handler: clean
    })
    .command({
        command: 'copy',
        handler: copy
    })
    .command({
        command: 'generate',
        handler: generate
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
        handler: () => {
            const { target, modules } = yargs.array('modules').argv;
            rebuild(target, modules);
        }
    })
    .demandCommand(1)
    .argv;
