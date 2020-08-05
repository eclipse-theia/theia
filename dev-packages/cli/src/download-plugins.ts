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
import { promises as fs, createWriteStream } from 'fs';
import * as mkdirp from 'mkdirp';
import * as path from 'path';
import * as process from 'process';
import * as stream from 'stream';
import * as decompress from 'decompress';
import * as temp from 'temp';

import { green, red } from 'colors/safe';

import { promisify } from 'util';
const mkdirpAsPromised = promisify<string, mkdirp.Made>(mkdirp);
const pipelineAsPromised = promisify(stream.pipeline);

temp.track();

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
    try {
        await Promise.all(Object.keys(pck.theiaPlugins).map(
            plugin => downloadPluginAsync(failures, plugin, pck.theiaPlugins[plugin], pluginsDir, packed)
        ));
    } finally {
        temp.cleanupSync();
    }
    failures.forEach(console.error);
}

/**
 * Downloads a plugin, will make multiple attempts before actually failing.
 *
 * @param failures reference to an array storing all failures
 * @param plugin plugin short name
 * @param pluginUrl url to download the plugin at
 * @param pluginsDir where to download the plugin in
 * @param packed whether to decompress or not
 */
async function downloadPluginAsync(failures: string[], plugin: string, pluginUrl: string, pluginsDir: string, packed: boolean): Promise<void> {
    if (!plugin) {
        return;
    }
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
    if (await isDownloaded(targetPath)) {
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

    if (fileExt === '.vsix' && packed === true) {
        // Download .vsix without decompressing.
        const file = createWriteStream(targetPath);
        await pipelineAsPromised(response.body, file);
    } else {
        await mkdirpAsPromised(targetPath);
        const tempFile = temp.createWriteStream('theia-plugin-download');
        await pipelineAsPromised(response.body, tempFile);
        await decompress(tempFile.path, targetPath);
    }

    console.warn(green(`+ ${plugin}: downloaded successfully ${attempts > 1 ? `(after ${attempts} attempts)` : ''}`));
}

/**
 * Determine if the resource for the given path is already downloaded.
 * @param filePath the resource path.
 *
 * @returns `true` if the resource is already downloaded, else `false`.
 */
async function isDownloaded(filePath: string): Promise<boolean> {
    return fs.stat(filePath).then(() => true, () => false);
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
