/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as request from 'requestretry';
import * as mkdirp from 'mkdirp';
import * as tar from 'tar';
import * as zlib from 'zlib';

const unzip = require('unzip-stream');

export default function downloadPlugins(): void {

    console.log('Downloading plugins...');

    // Resolve the `package.json` at the current working directory.
    const pck = require(path.resolve(process.cwd(), 'package.json'));

    // Resolve the directory for which to download the plugins.
    const pluginsDir = pck.theiaPluginsDir || 'plugins';

    for (const plugin in pck.theiaPlugins) {
        if (!plugin) {
            continue;
        }
        const targetPath = path.join(process.cwd(), pluginsDir, plugin);

        // Skip plugins which have previously been downloaded.
        if (!isDownloaded(targetPath)) {
            console.log(plugin + ': already downloaded');
            continue;
        }

        const pluginUrl = pck.theiaPlugins[plugin];
        console.log(plugin + ': downloading from ' + pluginUrl);

        const download: request.RequestPromise = request({
            ...pck.requestOptions,
            url: pluginUrl,
            maxAttempts: 5,
            retryDelay: 2000,
            retryStrategy: request.RetryStrategies.HTTPOrNetworkError
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }, (err: any, response: any) => {
            if (err) {
                console.error(plugin + ': failed to download', err);
            } else {
                console.log(plugin + ': downloaded successfully' + (response.attempts > 1 ? ` after ${response.attempts}  attempts` : ''));
            }
        });

        if (pluginUrl.endsWith('gz')) {
            mkdirp(targetPath, () => { });
            const gunzip = zlib.createGunzip({
                finishFlush: zlib.Z_SYNC_FLUSH,
                flush: zlib.Z_SYNC_FLUSH
            });
            const untar = tar.x({ cwd: targetPath });
            download.pipe(gunzip).pipe(untar);
        } else {
            download.pipe(unzip.Extract({ path: targetPath }));
        }
    }
}

/**
 * Determine if the resource for the given path is already downloaded.
 * @param path the resource path.
 *
 * @returns `true` if the resource is already downloaded, else `false`.
 */
function isDownloaded(dirPath: fs.PathLike): boolean {
    try {
        return !fs.readdirSync(dirPath).length;
    } catch (e) {
        return true;
    }
}
