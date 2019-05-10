#!/usr/bin/env node
// @ts-check
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
'use-strict'

const path = require('path');
const cp = require('child_process');

class ProcessError extends Error {
    constructor(options = {}) {
        super(options.message);
        this.code = options.code;
        this.signal = options.signal;
    }
}

/**
 * @param {import('child_process').ChildProcess} subprocess
 */
async function process_exit(subprocess) {
    return new Promise((resolve, reject) => {
        subprocess.on('exit', (code, signal) => {
            if (code || signal) reject(new ProcessError({ code, signal }));
            else resolve();
        })
        subprocess.on('error', reject);
    })
}

/**
 * @param {import('child_process').ChildProcess} subprocess
 */
async function get_process_output(subprocess) {
    return new Promise((resolve, reject) => {
        let output = '';
        subprocess.stdout.on('data', data => output += data);
        subprocess.stdout.on('close', async () => {
            resolve(output);
        });
    })
}

/**
 * @param {NodeJS.Platform} [platform]
 * @return {File}
 */
exports.libffmpeg = function (platform = process.platform) {
    switch (platform) {
        case 'darwin':
            return {
                name: 'libffmpeg.dylib',
                folder: 'Electron.app/Contents/Frameworks/Electron Framework.framework/Libraries/',
            };
        case 'win32':
            return {
                name: 'ffmpeg.dll',
            };
        case 'linux':
            return {
                name: 'libffmpeg.so',
            };
        default:
            throw new Error(`${process.platform} is not supported`);
    }
}

/**
 * @param {libffmpegPlatformOptions} [options]
 * @return {String}
 */
exports.libffmpegRelativePath = function ({ platform } = {}) {
    const libffmpeg = exports.libffmpeg(platform);
    return `${libffmpeg.folder || ''}${libffmpeg.name}`;
}

/**
 * @param {libffmpegDistributionOptions} [options]
 * @return {String}
 */
exports.libffmpegAbsolutePath = function ({ platform, electronDist } = {}) {
    if (!electronDist) electronDist = path.resolve(require.resolve('electron/index.js'), '..', 'dist');
    return path.join(electronDist, exports.libffmpegRelativePath({ platform }));
}

/**
 * Since MacOS is using spaces in their folder names (but could also happen
 * on other OSes), we need to escape them for Gyp to understand.
 *
 * @param {libffmpegDistributionOptions} [options]
 * @return {String}
 */
exports.libffmpegGypLibraryPath = function (options = {}) {
    return exports.libffmpegAbsolutePath(options).replace(' ', '\\\\ ');
}

/**
 * @param {libffmpegDistributionOptions} [options]
 * @return {Promise<Codec[]>}
 */
exports.libffmpegCodecs = async function (options = {}) {
    function dynamic_library_linking() {
        switch (process.platform) {
            case 'darwin':
                return {
                    DYLD_INSERT_LIBRARIES: exports.libffmpegAbsolutePath(options),
                };
            case 'linux':
                return {
                    LD_PRELOAD: exports.libffmpegAbsolutePath(options),
                };
        }
    }
    const subprocess = cp.spawn(require.resolve('./native/build/Release/electron-ffmpeg-codecs'), [], {
        env: {
            ...process.env,
            ...dynamic_library_linking()
        },
    });
    const outputPromise = get_process_output(subprocess);
    outputPromise.catch(() => undefined); // suppress unhandledPromise
    await process_exit(subprocess);

    return JSON.parse(await outputPromise);
}

/**
 * @typedef {Object} File
 * @property {String} name
 * @property {String} [folder]
 */

/**
 * @typedef {Object} Codec
 * @property {Number} id
 * @property {String} name
 * @property {String} longName
 */

/**
 * @typedef {Object} libffmpegPlatformOptions
 * @property {NodeJS.Platform} [platform]
 */

/**
 * @typedef {Object} libffmpegDistributionOptions
 * @property {NodeJS.Platform} [platform]
 * @property {String} [electronDist]
 */
