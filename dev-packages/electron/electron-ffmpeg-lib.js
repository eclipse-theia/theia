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
'use-strict'

// @ts-check

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const ffmpeg = require('./native/build/Release/ffmpeg.node');

/**
 * @param {String} path
 * @return {Buffer} Hash of the file.
 */
exports.hashFile = async function (path) {
    return new Promise((resolve, reject) => {
        const sha256 = crypto.createHash('sha256');
        fs.createReadStream(path)
            .on('close', () => resolve(sha256.digest()))
            .on('data', data => sha256.update(data))
            .on('error', reject);
    });
}

/**
 * @type {NodeJS.Platform[]}
 */
exports.platforms = [
    'darwin',
    'linux',
    'win32',
];

/**
 * Return both the relative folder and the ffmpeg shared library name.
 *
 * @param {NodeJS.Platform} [platform]
 * @return {File}
 */
exports.libffmpegLocation = function (platform = process.platform) {
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
            throw new Error(`${platform} is not supported`);
    }
};

/**
 * Compute the relative ffmpeg shared library path from the Electron distribution root.
 *
 * @param {libffmpegPlatformOptions} [options]
 * @return {String}
 */
exports.libffmpegRelativePath = function ({ platform } = {}) {
    const libffmpeg = exports.libffmpegLocation(platform);
    return path.join(libffmpeg.folder || '', libffmpeg.name);
};

/**
 * Compute the absolute ffmpeg shared library path.
 *
 * @param {libffmpegDistributionOptions} [options]
 * @return {String}
 */
exports.libffmpegAbsolutePath = function ({ platform, electronDist } = {}) {
    if (!electronDist) electronDist = path.resolve(require.resolve('electron/index.js'), '..', 'dist');
    return path.join(electronDist, exports.libffmpegRelativePath({ platform }));
};

/**
 * Return the list of codecs for the given ffmpeg shared library.
 *
 * @param {libffmpegDistributionOptions} [options]
 * @return {String}
 */
exports.libffmpegCodecs = function (absolutePath) {
    return ffmpeg.codecs(absolutePath);
};

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
