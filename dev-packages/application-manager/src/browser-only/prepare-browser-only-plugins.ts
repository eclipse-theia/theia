// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

/**
 * Browser-only build step: copy plugins into `lib/frontend/hostedPlugin/`, normalize each
 * `package.json` for the static host, and write `list.json` for the frontend plugin loader.
 * No plugin-ext scanners or DI — manifest-driven only.
 */

import { realpath } from 'fs/promises';
import * as path from 'path';
import * as fs from 'fs-extra';
import { ApplicationPackage } from '@theia/application-package';
import { LIST_JSON, PLUGINS_BASE_PATH, PLUGIN_COPY_IGNORE } from './constants';
import {
    buildLifecycle,
    buildModel,
    getPluginId,
    loadManifest,
    pickEngineType,
    resolvePluginEntryFile,
    resolvePluginRoot,
    resolvePluginsSourcePath,
    shouldIncludePluginInBrowserOnlyBuild,
    toHostedPluginUri
} from './helpers';
import {
    PLUGIN_HOST_BACKEND,
    BrowserOnlyPluginType,
    type BrowserOnlyDeployedPlugin,
    type BrowserOnlyManifest,
} from './types';

export async function prepareBrowserOnlyPlugins(applicationPackage: ApplicationPackage): Promise<void> {
    const pluginsDir = await resolvePluginsSourcePath(applicationPackage);

    if (!(await fs.pathExists(pluginsDir))) {
        return;
    }

    const hostedPluginDir = applicationPackage.lib('frontend', PLUGINS_BASE_PATH);

    await fs.ensureDir(hostedPluginDir);

    const names = await fs.readdir(pluginsDir);
    const deployedPlugins: BrowserOnlyDeployedPlugin[] = [];

    for (const name of names) {
        const entry = await processPlugin(path.join(pluginsDir, name), hostedPluginDir);
        if (entry) {
            deployedPlugins.push(entry);
        }
    }

    await fs.writeJson(path.join(hostedPluginDir, LIST_JSON), deployedPlugins, { spaces: 2 });
}

async function processPlugin(pluginSourceDir: string, hostedPluginDir: string): Promise<BrowserOnlyDeployedPlugin | undefined> {
    const packageRoot = resolvePluginRoot(pluginSourceDir);
    if (!packageRoot) { return undefined; }

    let manifest: BrowserOnlyManifest;
    let resolvedPath: string;
    try {
        resolvedPath = await realpath(packageRoot);
        manifest = await loadManifest(resolvedPath);
    } catch {
        return undefined;
    }

    // Skip any backend-only extensions
    if (!shouldIncludePluginInBrowserOnlyBuild(manifest)) {
        return undefined;
    }

    // Build plugin model
    const engineType = pickEngineType(manifest);
    const model = buildModel(manifest, engineType);
    const lifecycle = buildLifecycle(manifest, engineType);

    const pluginId = getPluginId(manifest);
    const dst = path.join(hostedPluginDir, pluginId);

    // Copy folder contents to destination
    await fs.copy(resolvedPath, dst, {
        overwrite: true,
        dereference: true,
        filter: (src: string) => !PLUGIN_COPY_IGNORE.test(src)
    });

    // Write normalized manifest to destination
    await fs.writeJson(path.join(dst, 'package.json'), manifest, { spaces: 2 });

    const entryPoint = model.entryPoint;
    if (entryPoint.frontend) {
        const absoluteEntry = path.resolve(dst, entryPoint.frontend);
        const resolved = await resolvePluginEntryFile(absoluteEntry);
        if (resolved) {
            entryPoint.frontend = path.relative(dst, resolved).split(path.sep).join('/');
        }
    }

    const entry: BrowserOnlyDeployedPlugin = {
        type: BrowserOnlyPluginType.System,
        metadata: {
            host: PLUGIN_HOST_BACKEND,
            model,
            lifecycle,
            outOfSync: false
        },
        contributes: manifest.contributes
    };

    const pkgPath = manifest.packagePath;

    entry.metadata.model.packageUri = toHostedPluginUri(entry.metadata.model.packageUri, pkgPath, pluginId);
    /** Same static location as `packageUri` — avoid machine-specific absolute paths in `list.json` (see `PluginModel.packagePath` deprecation). */
    entry.metadata.model.packagePath = entry.metadata.model.packageUri;

    if (entry.metadata.model.licenseUrl) {
        entry.metadata.model.licenseUrl = toHostedPluginUri(entry.metadata.model.licenseUrl, pkgPath, pluginId);
    }
    if (entry.metadata.model.iconUrl) {
        entry.metadata.model.iconUrl = toHostedPluginUri(entry.metadata.model.iconUrl, pkgPath, pluginId);
    }
    if (entry.metadata.model.readmeUrl) {
        entry.metadata.model.readmeUrl = toHostedPluginUri(entry.metadata.model.readmeUrl, pkgPath, pluginId);
    }

    return entry;
}
