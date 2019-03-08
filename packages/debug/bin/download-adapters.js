#!/usr/bin/env node
/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

const fs = require('fs');
const request = require('requestretry');
const unzip = require('unzip-stream');
const path = require('path');
const process = require('process');
const zlib = require('zlib');
const mkdirp = require('mkdirp');
const tar = require('tar');

const pck = require(path.resolve(process.cwd(), 'package.json'));
const adapterDir = pck.adapterDir || 'download';

function isDownloaded(dirPath) {
    try {
        return !fs.readdirSync(dirPath).length;
    } catch (e) {
        return true;
    }
}

for (const name in pck.adapters) {
    const targetPath = path.join(process.cwd(), adapterDir, name);
    if (!isDownloaded(targetPath)) {
        console.log(name + ': already downloaded');
        continue;
    }
    const adapterUrl = pck.adapters[name];
    console.log(name + ': downloading from ' + adapterUrl);
    const download = request({
        ...pck.requestOptions,
        url: adapterUrl,
        maxAttempts: 5,
        retryDelay: 2000,
        retryStrategy: request.RetryStrategies.HTTPOrNetworkError
    }, (err, response) => {
        if (err) {
            console.error(name + ': failed to download', err)
            process.exitCode = 1;
        } else {
            console.log(name + ': downloaded successfully' + (response.attempts > 1 ? ` after ${response.attempts}  attempts` : ''));
        }
    });

    if (adapterUrl.endsWith('gz')) {
        // Support tar gz
        mkdirp(targetPath);
        const gunzip = zlib.createGunzip({
            finishFlush: zlib.Z_SYNC_FLUSH,
            flush: zlib.Z_SYNC_FLUSH
        });
        const untar = tar.x({
            cwd: targetPath
        });
        download.pipe(gunzip).pipe(untar);
    } else {
        // Support zip or vsix
        download.pipe(unzip.Extract({ path: targetPath }));
    }
}
