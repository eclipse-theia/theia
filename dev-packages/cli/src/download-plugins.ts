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

/* eslint-disable @typescript-eslint/no-explicit-any */

import fetch, { Response, RequestInit } from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import * as path from 'path';
import * as process from 'process';
import * as stream from 'stream';
import * as tar from 'tar';
import * as zlib from 'zlib';

import { green, red } from 'colors/safe';

import { promisify } from 'util';
const mkdirpAsPromised = promisify<string, mkdirp.Made>(mkdirp);
const pipelineAsPromised = promisify(stream.pipeline);

const unzip = require('unzip-stream');

/**
 * Available options when downloading.
 */
export interface DownloadPluginsOptions {
    /**
     * Determines if a plugin should be unpacked.
     * Defaults to `false`.
     */
    packed?: boolean;
}

export default async function downloadPlugins(options: DownloadPluginsOptions = {}): Promise<void> {

    // Collect the list of failures to be appended at the end of the script.
    const failures: string[] = [];

    const {
        packed = false,
    } = options;

    console.warn('--- downloading plugins ---');

    // Resolve the `package.json` at the current working directory.
    const pck = require(path.resolve(process.cwd(), 'package.json'));

    // Resolve the directory for which to download the plugins.
    const pluginsDir = pck.theiaPluginsDir || 'plugins';

    await mkdirpAsPromised(pluginsDir);

    if (!pck.theiaPlugins) {
        console.log(red('error: missing mandatory \'theiaPlugins\' property.'));
        return;
    }

    await Promise.all(Object.keys(pck.theiaPlugins).map(async plugin => {
        if (!plugin) {
            return;
        }
        const pluginUrl = pck.theiaPlugins[plugin];

        let fileExt: string;
        if (pluginUrl.endsWith('tar.gz')) {
            fileExt = '.tar.gz';
        } else if (pluginUrl.endsWith('vsix')) {
            fileExt = '.vsix';
        } else {
            console.error(red(`error: '${plugin}' has an unsupported file type: '${pluginUrl}'`));
            return;
        }

        const targetPath = path.join(process.cwd(), pluginsDir, `${plugin}${packed === true ? fileExt : ''}`);

        // Skip plugins which have previously been downloaded.
        if (isDownloaded(targetPath)) {
            console.warn('- ' + plugin + ': already downloaded - skipping');
            return;
        }

        const maxAttempts = 5;
        const retryDelay = 2000;

        let attempts: number;
        let lastError: Error | undefined;
        let response: Response | undefined;

        for (attempts = 0; attempts < maxAttempts; attempts++) {
            if (attempts > 0) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
            lastError = undefined;
            try {
                response = await xfetch(pluginUrl);
            } catch (error) {
                lastError = error;
                continue;
            }
            const retry = response.status === 439 || response.status >= 500;
            if (!retry) {
                break;
            }
        }
        if (lastError) {
            failures.push(red(`x ${plugin}: failed to download, last error:\n ${lastError}`));
            return;
        }
        if (typeof response === 'undefined') {
            failures.push(red(`x ${plugin}: failed to download (unknown reason)`));
            return;
        }
        if (response.status !== 200) {
            failures.push(red(`x ${plugin}: failed to download with: ${response.status} ${response.statusText}`));
            return;
        }

        if (fileExt === '.tar.gz') {
            // Decompress .tar.gz files.
            await mkdirpAsPromised(targetPath);
            const gunzip = zlib.createGunzip({
                finishFlush: zlib.Z_SYNC_FLUSH,
                flush: zlib.Z_SYNC_FLUSH
            });
            const untar = tar.x({ cwd: targetPath });
            await pipelineAsPromised(response.body, gunzip, untar);
        } else {
            if (packed === true) {
                // Download .vsix without decompressing.
                const file = fs.createWriteStream(targetPath);
                await pipelineAsPromised(response.body, file);
            } else {
                // Decompress .vsix.
                await pipelineAsPromised(response.body, unzip.Extract({ path: targetPath }));
            }
        }

        console.warn(green(`+ ${plugin}: downloaded successfully ${attempts > 1 ? `(after ${attempts} attempts)` : ''}`));
    }));
    failures.forEach(failure => {
        console.log(failure);
    });
}

/**
 * Determine if the resource for the given path is already downloaded.
 * @param filePath the resource path.
 *
 * @returns `true` if the resource is already downloaded, else `false`.
 */
function isDownloaded(filePath: string): boolean {
    return fs.existsSync(filePath);
}

/**
 * Follow HTTP(S)_PROXY, ALL_PROXY and NO_PROXY environment variables.
 */
export function xfetch(url: string, options?: RequestInit): Promise<Response> {
    const proxiedOptions: RequestInit = { ...options };
    const proxy = getProxyForUrl(url);
    if (!proxiedOptions.agent && proxy !== '') {
        proxiedOptions.agent = new HttpsProxyAgent(proxy);
    }
    return fetch(url, proxiedOptions);
}
