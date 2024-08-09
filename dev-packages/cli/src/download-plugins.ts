// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { OVSXApiFilterImpl, OVSXClient, VSXTargetPlatform } from '@theia/ovsx-client';
import * as chalk from 'chalk';
import * as decompress from 'decompress';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as temp from 'temp';
import { DEFAULT_SUPPORTED_API_VERSION } from '@theia/application-package/lib/api';
import { RequestContext, RequestService } from '@theia/request';
import { RateLimiter } from 'limiter';
import escapeStringRegexp = require('escape-string-regexp');

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
     * Fetch plugins in parallel
     */
    parallel?: boolean;
}

interface PluginDownload {
    id: string,
    downloadUrl: string,
    version?: string | undefined
}

export default async function downloadPlugins(
    ovsxClient: OVSXClient,
    rateLimiter: RateLimiter,
    requestService: RequestService,
    options: DownloadPluginsOptions = {}
): Promise<void> {
    const {
        packed = false,
        ignoreErrors = false,
        apiVersion = DEFAULT_SUPPORTED_API_VERSION,
        parallel = true
    } = options;

    const apiFilter = new OVSXApiFilterImpl(ovsxClient, apiVersion);

    // Collect the list of failures to be appended at the end of the script.
    const failures: string[] = [];

    // Resolve the `package.json` at the current working directory.
    const pck = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8'));

    // Resolve the directory for which to download the plugins.
    const pluginsDir = pck.theiaPluginsDir || 'plugins';

    // Excluded extension ids.
    const excludedIds = new Set<string>(pck.theiaPluginsExcludeIds || []);

    const parallelOrSequence = async (tasks: (() => unknown)[]) => {
        if (parallel) {
            await Promise.all(tasks.map(task => task()));
        } else {
            for (const task of tasks) {
                await task();
            }
        }
    };

    // Downloader wrapper
    const downloadPlugin = async (plugin: PluginDownload): Promise<void> => {
        await downloadPluginAsync(requestService, rateLimiter, failures, plugin.id, plugin.downloadUrl, pluginsDir, packed, plugin.version);
    };

    const downloader = async (plugins: PluginDownload[]) => {
        await parallelOrSequence(plugins.map(plugin => () => downloadPlugin(plugin)));
    };

    await fs.mkdir(pluginsDir, { recursive: true });

    if (!pck.theiaPlugins) {
        console.log(chalk.red('error: missing mandatory \'theiaPlugins\' property.'));
        return;
    }
    try {
        console.warn('--- downloading plugins ---');
        // Download the raw plugins defined by the `theiaPlugins` property.
        // This will include both "normal" plugins as well as "extension packs".
        const pluginsToDownload = Object.entries(pck.theiaPlugins)
            .filter((entry: [string, unknown]): entry is [string, string] => typeof entry[1] === 'string')
            .map(([id, url]) => ({ id, downloadUrl: resolveDownloadUrlPlaceholders(url) }));
        await downloader(pluginsToDownload);

        const handleDependencyList = async (dependencies: (string | string[])[]) => {
            // De-duplicate extension ids to only download each once:
            const ids = new Set<string>(dependencies.flat());
            await parallelOrSequence(Array.from(ids, id => async () => {
                try {
                    await rateLimiter.removeTokens(1);
                    const extension = await apiFilter.findLatestCompatibleExtension({
                        extensionId: id,
                        includeAllVersions: true,
                        targetPlatform
                    });
                    const version = extension?.version;
                    const downloadUrl = extension?.files.download;
                    if (downloadUrl) {
                        await rateLimiter.removeTokens(1);
                        await downloadPlugin({ id, downloadUrl, version });
                    } else {
                        failures.push(`No download url for extension pack ${id} (${version})`);
                    }
                } catch (err) {
                    console.error(err);
                    failures.push(err.message);
                }
            }));
        };

        console.warn('--- collecting extension-packs ---');
        const extensionPacks = await collectExtensionPacks(pluginsDir, excludedIds);
        if (extensionPacks.size > 0) {
            console.warn(`--- resolving ${extensionPacks.size} extension-packs ---`);
            await handleDependencyList(Array.from(extensionPacks.values()));
        }

        console.warn('--- collecting extension dependencies ---');
        const pluginDependencies = await collectPluginDependencies(pluginsDir, excludedIds);
        if (pluginDependencies.length > 0) {
            console.warn(`--- resolving ${pluginDependencies.length} extension dependencies ---`);
            await handleDependencyList(pluginDependencies);
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

const targetPlatform = `${process.platform}-${process.arch}` as VSXTargetPlatform;

const placeholders: Record<string, string> = {
    targetPlatform
};
function resolveDownloadUrlPlaceholders(url: string): string {
    for (const [name, value] of Object.entries(placeholders)) {
        url = url.replace(new RegExp(escapeStringRegexp(`\${${name}}`), 'g'), value);
    }
    return url;
}

/**
 * Downloads a plugin, will make multiple attempts before actually failing.
 * @param requestService
 * @param failures reference to an array storing all failures.
 * @param plugin plugin short name.
 * @param pluginUrl url to download the plugin at.
 * @param target where to download the plugin in.
 * @param packed whether to decompress or not.
 */
async function downloadPluginAsync(
    requestService: RequestService,
    rateLimiter: RateLimiter,
    failures: string[],
    plugin: string,
    pluginUrl: string,
    pluginsDir: string,
    packed: boolean,
    version?: string
): Promise<void> {
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
        failures.push(chalk.red(`error: '${plugin}' has an unsupported file type: '${pluginUrl}'`));
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
    let response: RequestContext | undefined;

    for (attempts = 0; attempts < maxAttempts; attempts++) {
        if (attempts > 0) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
        lastError = undefined;
        try {
            await rateLimiter.removeTokens(1);
            response = await requestService.request({
                url: pluginUrl
            });
        } catch (error) {
            lastError = error;
            continue;
        }
        const status = response.res.statusCode;
        const retry = status && (status === 429 || status === 439 || status >= 500);
        if (!retry) {
            break;
        }
    }
    if (lastError) {
        failures.push(chalk.red(`x ${plugin}: failed to download, last error:\n ${lastError}`));
        return;
    }
    if (typeof response === 'undefined') {
        failures.push(chalk.red(`x ${plugin}: failed to download (unknown reason)`));
        return;
    }
    if (response.res.statusCode !== 200) {
        failures.push(chalk.red(`x ${plugin}: failed to download with: ${response.res.statusCode}`));
        return;
    }

    if ((fileExt === '.vsix' || fileExt === '.theia') && packed === true) {
        // Download .vsix without decompressing.
        await fs.writeFile(targetPath, response.buffer);
    } else {
        await fs.mkdir(targetPath, { recursive: true });
        const tempFile = temp.path('theia-plugin-download');
        await fs.writeFile(tempFile, response.buffer);
        await decompress(tempFile, targetPath);
    }

    console.warn(chalk.green(`+ ${plugin}${version ? `@${version}` : ''}: downloaded successfully ${attempts > 1 ? `(after ${attempts} attempts)` : ''}`));
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
        if ((await fs.stat(filePath)).isDirectory()) {
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
        if (Array.isArray(extensionPack)) {
            extensionPackPaths.set(packageJsonPath, extensionPack.filter(id => {
                if (excludedIds.has(id)) {
                    console.log(chalk.yellow(`'${id}' referred to by '${json.name}' (ext pack) is excluded because of 'theiaPluginsExcludeIds'`));
                    return false; // remove
                }
                return true; // keep
            }));
        }
    }));
    return extensionPackPaths;
}

/**
 * Get the mapping of  paths and their included plugin ids.
 * - If an extension-pack references an explicitly excluded `id` the `id` will be omitted.
 * @param pluginDir the plugin directory.
 * @param excludedIds the list of plugin ids to exclude.
 * @returns the mapping of extension-pack paths and their included plugin ids.
 */
async function collectPluginDependencies(pluginDir: string, excludedIds: Set<string>): Promise<string[]> {
    const dependencyIds: string[] = [];
    const packageJsonPaths = await collectPackageJsonPaths(pluginDir);
    await Promise.all(packageJsonPaths.map(async packageJsonPath => {
        const json = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        const extensionDependencies: unknown = json.extensionDependencies;
        if (Array.isArray(extensionDependencies)) {
            for (const dependency of extensionDependencies) {
                if (excludedIds.has(dependency)) {
                    console.log(chalk.yellow(`'${dependency}' referred to by '${json.name}' is excluded because of 'theiaPluginsExcludeIds'`));
                } else {
                    dependencyIds.push(dependency);
                }
            }
        }
    }));
    return dependencyIds;
}
