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

declare global {
    interface Array<T> {
        // Supported since Node >=11.0
        flat(depth?: number): any
    }
}

import { OVSXClient } from '@theia/ovsx-client/lib/ovsx-client';
import { green, red, yellow } from 'colors/safe';
import * as decompress from 'decompress';
import { createWriteStream, existsSync, promises as fs } from 'fs';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch, { RequestInit, Response } from 'node-fetch';
import * as path from 'path';
import { getProxyForUrl } from 'proxy-from-env';
import * as stream from 'stream';
import * as temp from 'temp';
import { promisify } from 'util';

const pipelineAsPromised = promisify(stream.pipeline);

temp.track();

export const extensionPackCacheName = '.packs';

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
    const {
        packed = false,
        ignoreErrors = false,
        apiVersion = '1.50.0',
        apiUrl = 'https://open-vsx.org/api'
    } = options;

    // Collect the list of failures to be appended at the end of the script.
    const failures: string[] = [];

    // Resolve the `package.json` at the current working directory.
    const pck = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8'));

    // Resolve the directory for which to download the plugins.
    const pluginsDir = pck.theiaPluginsDir || 'plugins';

    // Excluded extension ids.
    const excludedIds = new Set<string>(pck.theiaPluginsExcludeIds || []);

    await fs.mkdir(pluginsDir, { recursive: true });

    if (!pck.theiaPlugins) {
        console.log(red('error: missing mandatory \'theiaPlugins\' property.'));
        return;
    }
    try {
        // Retrieve the cached extension-packs in order to not re-download them.
        const extensionPackCachePath = path.resolve(pluginsDir, extensionPackCacheName);
        const cachedExtensionPacks = new Set<string>(
            existsSync(extensionPackCachePath)
                ? await fs.readdir(extensionPackCachePath)
                : []
        );
        console.warn('--- downloading plugins ---');
        // Download the raw plugins defined by the `theiaPlugins` property.
        // This will include both "normal" plugins as well as "extension packs".
        const downloads = [];
        for (const [plugin, pluginUrl] of Object.entries(pck.theiaPlugins)) {
            // Skip extension packs that were moved to `.packs`:
            if (cachedExtensionPacks.has(plugin) || typeof pluginUrl !== 'string') {
                continue;
            }
            downloads.push(downloadPluginAsync(failures, plugin, pluginUrl, pluginsDir, packed));
        }
        await Promise.all(downloads);
        console.warn('--- collecting extension-packs ---');
        const extensionPacks = await collectExtensionPacks(pluginsDir, excludedIds);
        if (extensionPacks.size > 0) {
            console.warn(`--- found ${extensionPacks.size} extension-packs ---`);
            // Move extension-packs to `.packs`
            await cacheExtensionPacks(pluginsDir, extensionPacks);
            console.warn('--- resolving extension-packs ---');
            const client = new OVSXClient({ apiVersion, apiUrl });
            // De-duplicate extension ids to only download each once:
            const ids = new Set<string>(Array.from(extensionPacks.values()).flat());
            await Promise.all(Array.from(ids, async id => {
                const extension = await client.getLatestCompatibleExtensionVersion(id);
                const downloadUrl = extension?.files.download;
                if (downloadUrl) {
                    await downloadPluginAsync(failures, id, downloadUrl, pluginsDir, packed);
                }
            }));
        }
    } finally {
        temp.cleanupSync();
    }
    for (const failure of failures) {
        console.error(failure);
    }
    if (!ignoreErrors && failures.length > 0) {
        throw new Error('Errors downloading some plugins. To make these errors non fatal, re-run with --ignore-errors');
    }
}

/**
 * Downloads a plugin, will make multiple attempts before actually failing.
 * @param failures reference to an array storing all failures.
 * @param plugin plugin short name.
 * @param pluginUrl url to download the plugin at.
 * @param target where to download the plugin in.
 * @param packed whether to decompress or not.
 * @param cachedExtensionPacks the list of cached extension packs already downloaded.
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
    } else if (pluginUrl.endsWith('theia')) {
        fileExt = '.theia'; // theia plugins.
    } else {
        failures.push(red(`error: '${plugin}' has an unsupported file type: '${pluginUrl}'`));
        return;
    }
    const targetPath = path.resolve(pluginsDir, `${plugin}${packed === true ? fileExt : ''}`);

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

    if ((fileExt === '.vsix' || fileExt === '.theia') && packed === true) {
        // Download .vsix without decompressing.
        const file = createWriteStream(targetPath);
        await pipelineAsPromised(response.body, file);
    } else {
        await fs.mkdir(targetPath, { recursive: true });
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
 * Walk the plugin directory and collect available extension paths.
 * @param pluginDir the plugin directory.
 * @returns the list of all available extension paths.
 */
async function collectPackageJsonPaths(pluginDir: string): Promise<string[]> {
    const packageJsonPathList: string[] = [];
    const files = await fs.readdir(pluginDir);
    // Recursively fetch the list of extension `package.json` files.
    for (const file of files) {
        const filePath = path.join(pluginDir, file);
        // Exclude the `.packs` folder used to store extension-packs after being resolved.
        if (!filePath.startsWith(extensionPackCacheName) && (await fs.stat(filePath)).isDirectory()) {
            packageJsonPathList.push(...await collectPackageJsonPaths(filePath));
        } else if (path.basename(filePath) === 'package.json' && !path.dirname(filePath).includes('node_modules')) {
            packageJsonPathList.push(filePath);
        }
    }
    return packageJsonPathList;
}

/**
 * Get the mapping of extension-pack paths and their included plugin ids.
 * - If an extension-pack references an explicitly excluded `id` the `id` will be omitted.
 * @param pluginDir the plugin directory.
 * @param excludedIds the list of plugin ids to exclude.
 * @returns the mapping of extension-pack paths and their included plugin ids.
 */
async function collectExtensionPacks(pluginDir: string, excludedIds: Set<string>): Promise<Map<string, string[]>> {
    const extensionPackPaths = new Map<string, string[]>();
    const packageJsonPaths = await collectPackageJsonPaths(pluginDir);
    await Promise.all(packageJsonPaths.map(async packageJsonPath => {
        const json = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        const extensionPack: unknown = json.extensionPack;
        if (extensionPack && Array.isArray(extensionPack)) {
            extensionPackPaths.set(packageJsonPath, extensionPack.filter(id => {
                if (excludedIds.has(id)) {
                    console.log(yellow(`'${id}' referenced by '${json.name}' (ext pack) is excluded because of 'theiaPluginsExcludeIds'`));
                    return false; // remove
                }
                return true; // keep
            }));
        }
    }));
    return extensionPackPaths;
}

/**
 * Move extension-packs downloaded from `pluginsDir/x` to `pluginsDir/.packs/x`.
 *
 * The issue we are trying to solve is the following:
 * We may skip some extensions declared in a pack due to the `theiaPluginsExcludeIds` list. But once we start
 * a Theia application the plugin system will detect the pack and install the missing extensions.
 *
 * By moving the packs to a subdirectory it should make it invisible to the plugin system, only leaving
 * the plugins that were installed under `pluginsDir` directly.
 *
 * @param extensionPacksPaths the list of extension-pack paths.
 */
async function cacheExtensionPacks(pluginsDir: string, extensionPacks: Map<string, unknown>): Promise<void> {
    const packsFolderPath = path.resolve(pluginsDir, extensionPackCacheName);
    await fs.mkdir(packsFolderPath, { recursive: true });
    await Promise.all(Array.from(extensionPacks.entries(), async ([extensionPackPath, value]) => {
        extensionPackPath = path.resolve(extensionPackPath);
        // Skip entries found in `.packs`
        if (extensionPackPath.startsWith(packsFolderPath)) {
            return; // skip
        }
        try {
            const oldPath = getExtensionRoot(pluginsDir, extensionPackPath);
            const newPath = path.resolve(packsFolderPath, path.basename(oldPath));
            if (!existsSync(newPath)) {
                await fs.rename(oldPath, newPath);
            }
        } catch (error) {
            console.error(error);
        }
    }));
}

/**
 * Walk back to the root of an extension starting from its `package.json`. e.g.
 *
 * ```ts
 * getExtensionRoot('/a/b/c', '/a/b/c/EXT/d/e/f/package.json') === '/a/b/c/EXT'
 * ```
 */
function getExtensionRoot(root: string, packageJsonPath: string): string {
    root = path.resolve(root);
    packageJsonPath = path.resolve(packageJsonPath);
    if (!packageJsonPath.startsWith(root)) {
        throw new Error(`unexpected paths:\n root: ${root}\n package.json: ${packageJsonPath}`);
    }
    return packageJsonPath.substr(0, packageJsonPath.indexOf(path.sep, root.length + 1));
}
