// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin
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
 * Browser-only plugins: copy from a source directory into hostedPlugin/ and write list.json.
 * Uses the same loadManifest as the backend (realpath, updateActivationEvents, etc.) and
 * TheiaPluginScanner so the frontend receives the same shape as when using the backend.
 */

import { realpath } from 'fs/promises';
import * as path from 'path';
import * as fs from '@theia/core/shared/fs-extra';
import { fileURLToPath } from 'url';
import { PLUGINS_BASE_PATH, PLUGIN_RESOURCE_SCHEME } from '@theia/core/lib/common/static-asset-paths';
import {
    getPluginId,
    PLUGIN_HOST_BACKEND,
    PluginType,
    PluginPackage,
    type DeployedPlugin
} from '@theia/plugin-ext/lib/common/plugin-protocol';

import { loadManifest } from '@theia/plugin-ext/lib/hosted/node/plugin-manifest-loader';
import { loadPackageTranslations, localizePackage } from '@theia/plugin-ext/lib/hosted/node/plugin-package-localization';
import { createTheiaPluginScanner } from './create-theia-scanner';

const DEFAULT_LIST_LOCALE = process.env.NLS_LOCALE || 'en';

function resolvePluginRoot(dir: string): string | undefined {
    const direct = path.join(dir, 'package.json');
    if (fs.pathExistsSync(direct)) { return dir; }
    const inExtension = path.join(dir, 'extension', 'package.json');
    if (fs.pathExistsSync(inExtension)) { return path.join(dir, 'extension'); }
    const inPackage = path.join(dir, 'package', 'package.json');
    if (fs.pathExistsSync(inPackage)) { return path.join(dir, 'package'); }
    return undefined;
}

function hasFrontendEntry(pkg: PluginPackage): boolean {
    return !!(pkg.theiaPlugin?.frontend ?? pkg.browser ?? pkg.main);
}

/** True if the plugin has contributions the frontend can use (languages, grammars, etc.) without running plugin code. */
function hasContributes(pkg: PluginPackage): boolean {
    const c = pkg.contributes;
    return !!(c && typeof c === 'object' && Object.keys(c).length > 0);
}

/**
 * Ensures theiaPlugin and engines.theiaPlugin so TheiaPluginScanner can run on packages that
 * only have VS Code-style fields (main/browser, engines.vscode). The backend never does this:
 * it only runs TheiaPluginScanner on packages already accepted by PluginTheiaDirectoryHandler
 * (which requires plugin.engines.theiaPlugin). TheiaPluginScanner.getModel() reads
 * plugin.engines[apiType] (scanner-theia.ts), so we set engines.theiaPlugin (or copy from
 * engines.vscode, or '*' when engines is missing) to avoid undefined and to support
 * browser-only preinstalled VS Code extensions.
 */
function ensurePluginPackageForScanner(pkg: PluginPackage): PluginPackage {
    if (!pkg.theiaPlugin) {
        if (pkg.browser ?? pkg.main) {
            pkg.theiaPlugin = { frontend: (pkg.browser ?? pkg.main) as string };
        } else {
            // Contribution-only plugin (no main/browser); scanner still needs theiaPlugin for getEntryPoint().
            pkg.theiaPlugin = { frontend: '', backend: '' };
        }
    }
    const engines = pkg.engines as Record<string, string>;
    if (engines) {
        engines.theiaPlugin = engines.theiaPlugin ?? engines.vscode ?? '*';
    } else {
        (pkg as PluginPackage).engines = { theiaPlugin: '*' };
    }
    return pkg;
}

/** Convert hostedPlugin/pluginId/... path from scanner to theia-plugin:/pluginId/... for list.json. */
function toPluginSchemeUri(pathOrUrl: string): string {
    const prefix = PLUGINS_BASE_PATH + '/';
    if (pathOrUrl.startsWith(prefix)) {
        return `${PLUGIN_RESOURCE_SCHEME}:/${pathOrUrl.slice(prefix.length)}`;
    }
    return pathOrUrl;
}

/** Rewrite file URIs under pluginRoot to theia-plugin:/pluginId/relativePath for browser-only list.json. */
function toHostedPluginUri(fileUri: string, pluginRoot: string, pluginId: string): string {
    if (!fileUri.startsWith('file://')) {
        return fileUri;
    }
    try {
        const filePath = fileURLToPath(fileUri);
        const normalizedRoot = path.resolve(pluginRoot);
        const normalizedPath = path.resolve(filePath);
        if (!normalizedPath.startsWith(normalizedRoot + path.sep) && normalizedPath !== normalizedRoot) {
            return fileUri;
        }
        const relative = path.relative(normalizedRoot, normalizedPath);
        return `${PLUGIN_RESOURCE_SCHEME}:/${pluginId}/${relative.split(path.sep).join('/')}`;
    } catch {
        return fileUri;
    }
}

/**
 * Copy preinstalled plugins from pluginsSourcePath into hostedPluginRootPath (each plugin
 * as hostedPluginRootPath/<pluginId>/), and write hostedPluginRootPath/list.json.
 * Includes plugins that have a frontend entry (runnable) or only contributions (e.g. languages,
 * grammars) so the frontend can use them. Excludes plugins with neither.
 * Uses TheiaPluginScanner to produce the same normalized model, lifecycle, and contributions as the backend.
 */
export async function copyBrowserOnlyPlugins(
    pluginsSourcePath: string,
    hostedPluginRootPath: string
): Promise<void> {
    await fs.ensureDir(hostedPluginRootPath);

    const scanner = createTheiaPluginScanner();
    const names = await fs.readdir(pluginsSourcePath);
    const deployedPlugins: DeployedPlugin[] = [];

    for (const name of names) {
        const pluginDir = path.join(pluginsSourcePath, name);
        const stat = await fs.stat(pluginDir).catch(() => undefined);
        if (!stat?.isDirectory()) { continue; }
        const packageRoot = resolvePluginRoot(pluginDir);
        if (!packageRoot) { continue; }
        let manifest: PluginPackage;
        try {
            const resolvedPath = await realpath(packageRoot);
            manifest = await loadManifest(resolvedPath);
            manifest.packagePath = resolvedPath;
        } catch {
            continue;
        }
        if (!manifest?.name) { continue; }
        const hasFrontend = hasFrontendEntry(manifest);
        const hasContrib = hasContributes(manifest);
        if (!hasFrontend && !hasContrib) { continue; }

        const plugin = ensurePluginPackageForScanner(manifest);
        const pluginId = getPluginId(plugin);

        const model = scanner.getModel(plugin);
        const lifecycle = scanner.getLifecycle(plugin);
        const contributes = await scanner.getContribution(plugin);
        const translations = await loadPackageTranslations(plugin.packagePath, DEFAULT_LIST_LOCALE);

        const metadata = {
            host: PLUGIN_HOST_BACKEND,
            model,
            lifecycle,
            outOfSync: false
        };

        delete metadata.model.readmeUrl;
        delete metadata.lifecycle.backendInitPath;
        metadata.model.packageUri = toHostedPluginUri(metadata.model.packageUri, plugin.packagePath, pluginId);
        metadata.model.packagePath = metadata.model.packageUri;
        if (metadata.model.licenseUrl) { metadata.model.licenseUrl = toPluginSchemeUri(metadata.model.licenseUrl); }

        contributes?.themes?.forEach(t => { t.uri = toHostedPluginUri(t.uri, plugin.packagePath, pluginId); });
        contributes?.iconThemes?.forEach(t => { t.uri = toHostedPluginUri(t.uri, plugin.packagePath, pluginId); });
        contributes?.snippets?.forEach(s => { s.uri = toHostedPluginUri(s.uri, plugin.packagePath, pluginId); });
        contributes?.icons?.forEach(icon => {
            const defaults = icon.defaults;
            if (defaults && typeof defaults === 'object' && 'location' in defaults && typeof defaults.location === 'string') {
                defaults.location = toHostedPluginUri(defaults.location, plugin.packagePath, pluginId);
            }
        });

        const dst = path.join(hostedPluginRootPath, pluginId);
        await fs.copy(plugin.packagePath, dst, {
            overwrite: true,
            dereference: true,
            filter: (src: string) => !/[/\\](\.git|node_modules)([/\\]|$)/.test(src)
        });

        const entry: DeployedPlugin = localizePackage({
            type: PluginType.System,
            metadata,
            contributes
        }, translations, (_key, original) => original);

        deployedPlugins.push(entry);
    }

    await fs.writeJson(path.join(hostedPluginRootPath, 'list.json'), deployedPlugins, { spaces: 2 });
}
