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
import { OVSXClient } from '@theia/ovsx-client/lib/ovsx-client';
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

    /**
     * Determines if failures while downloading plugins should be ignored.
     * Defaults to `false`.
     */
    ignoreErrors?: boolean;

    /**
     * The supported vscode API version.
     * Used to determine extension compatibility.
     */
    apiVersion?: string;

    /**
     * The open-vsx registry API url.
     */
    apiUrl?: string;
}

export default async function downloadPlugins(options: DownloadPluginsOptions = {}): Promise<void> {

    // Collect the list of failures to be appended at the end of the script.
    const failures: string[] = [];

    const {
        packed = false,
        ignoreErrors = false,
        apiVersion = '1.50.0',
        apiUrl = 'https://open-vsx.org/api'
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
    failures.forEach(e => { console.error(e); });
    if (!ignoreErrors && failures.length > 0) {
        throw new Error('Errors downloading some plugins. To make these errors non fatal, re-run with --ignore-errors');
    }

    // Resolve extension pack plugins.
    const ids = await getAllExtensionPackIds(pluginsDir);
    if (ids.length) {
        const client = new OVSXClient({ apiVersion, apiUrl });
        ids.forEach(async id => {
            const extension = await client.getLatestCompatibleExtensionVersion(id);
            const downloadUrl = extension?.files.download;
            if (downloadUrl) {
                await downloadPluginAsync(failures, id, downloadUrl, pluginsDir, packed);
            }
        });
    }

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
        failures.push(red(`error: '${plugin}' has an unsupported file type: '${pluginUrl}'`));
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

/**
 * Get the list of all available ids referenced by extension packs.
 * @param pluginDir the plugin directory.
 * @returns the list of all referenced extension pack ids.
 */
async function getAllExtensionPackIds(pluginDir: string): Promise<string[]> {
    const extensions = await getPackageFiles(pluginDir);
    const extensionIds: string[] = [];
    const ids = await Promise.all(extensions.map(ext => getExtensionPackIds(ext)));
    ids.forEach(id => {
        extensionIds.push(...id);
    });
    return extensionIds;
}

/**
 * Walk the plugin directory collecting available extension paths.
 * @param dirPath the plugin directory
 * @returns the list of extension paths.
 */
async function getPackageFiles(dirPath: string): Promise<string[]> {
    let fileList: string[] = [];
    const files = await fs.readdir(dirPath);

    // Recursively fetch the list of extension `package.json` files.
    for (const file of files) {
        const filePath = path.join(dirPath, file);
        if ((await fs.stat(filePath)).isDirectory()) {
            fileList = [...fileList, ...(await getPackageFiles(filePath))];
        } else if ((path.basename(filePath) === 'package.json' && !path.dirname(filePath).includes('node_modules'))) {
            fileList.push(filePath);
        }
    }

    return fileList;
}

/**
 * Get the list of extension ids referenced by the extension pack.
 * @param extPath the individual extension path.
 * @returns the list of individual extension ids.
 */
async function getExtensionPackIds(extPath: string): Promise<string[]> {
    const ids = new Set<string>();
    const content = await fs.readFile(extPath, 'utf-8');
    const json = JSON.parse(content);

    // The `extensionPack` object.
    const extensionPack = json.extensionPack as string[];
    for (const ext in extensionPack) {
        if (ext !== undefined) {
            ids.add(extensionPack[ext]);
        }
    }
    return Array.from(ids);
}
