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

const downloadElectron = require('electron-download');
const unzipper = require('unzipper');
const fs = require('fs');

const { libffmpeg } = require('./electron-ffmpeg-lib')

async function main() {
    const electronVersionFilePath = require.resolve('electron/dist/version');
    const electronVersion = fs.readFileSync(electronVersionFilePath, {
        encoding: 'utf8'
    }).trim();

    const libffmpegZipPath = await new Promise((resolve, reject) => {
        downloadElectron({
            // `version` usually starts with a `v`, which already gets added by `electron-download`.
            version: electronVersion.slice(1),
            ffmpeg: true,
        }, (error, path) => {
            if (error) reject(error);
            else resolve(path);
        });
    });

    const {
        name: libffmpegFileName,
        folder: libffmpegFolder = '',
    } = libffmpeg();

    const libffmpegZip = await unzipper.Open.file(libffmpegZipPath);
    const file = libffmpegZip.files.find(file => file.path.endsWith(libffmpegFileName));
    if (!file) {
        throw new Error(`archive did not contain "${libffmpegFileName}"`);
    }
    const electronFfmpegLibPath = require.resolve(`electron/dist/${libffmpegFolder}${libffmpegFileName}`);

    await new Promise((resolve, reject) => {
        file.stream()
            .pipe(fs.createWriteStream(electronFfmpegLibPath))
            .on('finish', resolve)
            .on('error', reject);
    });
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
