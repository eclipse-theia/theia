// *****************************************************************************
// Copyright (C) 2019 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import electronGet = require('@electron/get');
import fs = require('fs-extra');
import os = require('os');
import path = require('path');
import unzipper = require('unzipper');
import * as ffmpeg from './ffmpeg';
import { hashFile } from './hash';

export async function replaceFfmpeg(options: ffmpeg.FfmpegOptions = {}): Promise<void> {
    let shouldDownload = true;
    let shouldReplace = true;
    const {
        name: ffmpegName,
        location: ffmpegLocation,
    } = ffmpeg.ffmpegNameAndLocation(options);
    const {
        electronDist = path.resolve(require.resolve('electron/package.json'), '..', 'dist'),
        electronVersion = await readElectronVersion(electronDist),
        ffmpegPath = path.resolve(electronDist, ffmpegLocation, ffmpegName),
    } = options;
    const ffmpegCachedPath = path.join(os.tmpdir(), `theia-cli/cache/electron-v${electronVersion}`, ffmpegName);
    if (await fs.pathExists(ffmpegCachedPath)) {
        shouldDownload = false; // If the file is already cached, do not download.
        console.warn('Found cached ffmpeg library.');
        const [cacheHash, distHash] = await Promise.all([
            hashFile(ffmpegCachedPath),
            hashFile(ffmpegPath),
        ]);
        if (cacheHash.equals(distHash)) {
            shouldReplace = false; // If files are already the same, do not replace.
            console.warn('Hashes are equal, not replacing the ffmpeg library.');
        }
    }
    if (shouldDownload) {
        const ffmpegZipPath = await electronGet.downloadArtifact({
            version: electronVersion,
            artifactName: 'ffmpeg'
        });
        const ffmpegZip = await unzipper.Open.file(ffmpegZipPath);
        const file = ffmpegZip.files.find(f => f.path.endsWith(ffmpegName));
        if (!file) {
            throw new Error(`Archive did not contain "${ffmpegName}".`);
        }
        // Extract file to cache.
        await fs.mkdirp(path.dirname(ffmpegCachedPath));
        await new Promise<void>((resolve, reject) => {
            file.stream()
                .pipe(fs.createWriteStream(ffmpegCachedPath))
                .on('finish', resolve)
                .on('error', reject);
        });
        console.warn(`Downloaded ffmpeg shared library { version: "${electronVersion}", dist: "${electronDist}" }.`);
    }
    if (shouldReplace) {
        await fs.copy(ffmpegCachedPath, ffmpegPath);
        console.warn(`Successfully replaced "${ffmpegPath}".`);
    }
}

export async function readElectronVersion(electronDist: string): Promise<string> {
    const electronVersionFilePath = path.resolve(electronDist, 'version');
    try {
        const version = await fs.readFile(electronVersionFilePath, 'utf8');
        return version.trim();
    } catch (error) {
        // `dist/version` is part of the Electron binary archive and can be absent after a
        // sporadically-failing postinstall extraction (observed on Node.js 24 CI runners with the
        // unmaintained `extract-zip@2.0.1` used by electron's installer). Fall back to the version
        // string from `electron/package.json`; the two files always hold the same value.
        const electronPackageJson = await fs.readJson(require.resolve('electron/package.json'));
        console.warn(`Could not read ${electronVersionFilePath}; falling back to electron/package.json version (${electronPackageJson.version}).`, error);
        return electronPackageJson.version;
    }
}
