#!/usr/bin/env node
/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
'use strict'

// @ts-check

// const path = require('path');
const cp = require('child_process');
const fs = require('fs');

/**
 * @param {String} script
 * @param {String[]} args
 * @param {import('child_process').ForkOptions} options
 * @param {Function} [callback]
 */
async function fork(script, args = [], options = {}, callback) {
    return new Promise((resolve, reject) => {
        const subprocess = cp.fork(script, args, options);
        subprocess.once('error', reject);
        subprocess.once('close', (code, signal) => {
            if (signal || code) reject(new Error(`"${script}" exited with ${signal || code}`));
            else resolve();
        });
        // pid 0 is unlikely: pid will be > 0, or null/undefined on error.
        if (subprocess.pid && callback) {
            callback(subprocess);
        }
    })
}

/**
 * @param {String} type
 * @param {String} message
 * @return {String}
 */
function format(type, message) {
    return `(${new Date().toUTCString()}) ${type}: ${message}`;
}

/**
 * @param {import('child_process').ChildProcess} subprocess
 * @param {import('stream').Writable} stream
 */
async function writeToStream(subprocess, stream) {
    subprocess.stdout.on('data', data => {
        console.info(data.toString().trimRight());
        stream.write(format('info', data));
    });
    subprocess.stderr.on('data', data => {
        console.error(data.toString().trimRight());
        stream.write(format('error', data))
    });
}

async function main() {
    await fork('../node-gyp-cli.js', ['rebuild'], { cwd: 'native' });
    if (!process.env.THEIA_ELECTRON_SKIP_REPLACE_FFMPEG) {
        const log = fs.createWriteStream('post-install.log', { encoding: 'utf8' });
        await new Promise(resolve => log.once('open', () => resolve()));
        await fork('electron-replace-ffmpeg.js', [], { stdio: [0, 'pipe', 'pipe', 'ipc'] },
            subprocess => writeToStream(subprocess, log));
        await fork('electron-codecs-test.js', [], { stdio: [0, 'pipe', 'pipe', 'ipc'] },
            subprocess => writeToStream(subprocess, log));
    }
}

main().catch(error => {
    console.error(error);
    process.exit(error.code || 127);
})
