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
 * Runs the browser-only plugin preparation inside the build container (scan, localize, copy, list.json).
 * Receives PluginScannerResolver and HostedPluginLocalizationService via DI.
 * Also defines the scanner resolver interface, symbol, and impl (used by build-container).
 */

import { realpath } from 'fs/promises';
import * as path from 'path';
import * as fs from '@theia/core/shared/fs-extra';
import { fileURLToPath } from 'url';
import { injectable, inject, multiInject } from '@theia/core/shared/inversify';
import { PLUGINS_BASE_PATH } from '@theia/core/lib/common/static-asset-paths';
import {
    getPluginId,
    PluginType,
    PluginPackage,
    PluginScanner,
    PLUGIN_HOST_BACKEND,
    type DeployedPlugin,
    type PluginMetadata
} from '@theia/plugin-ext/lib/common/plugin-protocol';
import { loadManifest } from '@theia/plugin-ext/lib/hosted/node/plugin-manifest-loader';
import { resolvePluginEntryFile } from '@theia/plugin-ext/lib/hosted/node/plugin-path-resolver';
import { HostedPluginLocalizationService } from '@theia/plugin-ext/lib/hosted/node/hosted-plugin-localization-service';
import { ApplicationPackage } from '@theia/core/shared/@theia/application-package';

export interface PluginScannerResolver {
    getScanner(plugin: PluginPackage): PluginScanner;
}

export const PluginScannerResolverSymbol = Symbol('PluginScannerResolver');

@injectable()
export class PluginScannerResolverImpl implements PluginScannerResolver {
    private readonly scannersByType = new Map<string, PluginScanner>();

    constructor(@multiInject(PluginScanner) scanners: PluginScanner[]) {
        scanners.forEach(scanner => this.scannersByType.set(scanner.apiType, scanner));
    }

    getScanner(plugin: PluginPackage): PluginScanner {
        if (plugin?.engines) {
            const scanners = Object.keys(plugin.engines)
                .filter(engineName => this.scannersByType.has(engineName))
                .map(engineName => this.scannersByType.get(engineName)!);
            const scanner = scanners[0];
            if (scanner) {
                return scanner;
            }
        }
        throw new Error('There is no suitable scanner found for ' + (plugin?.name ?? 'unknown'));
    }
}

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

function hasContributes(pkg: PluginPackage): boolean {
    const c = pkg.contributes;
    return !!(c && typeof c === 'object' && Object.keys(c).length > 0);
}

function ensurePluginPackageForScanner(pkg: PluginPackage): PluginPackage {
    if (pkg.browser && pkg.main) {
        delete pkg.main;
    }

    if (!pkg.theiaPlugin) {
        if (pkg.browser ?? pkg.main) {
            pkg.theiaPlugin = { frontend: (pkg.browser ?? pkg.main) as string };
        } else {
            pkg.theiaPlugin = { frontend: '', backend: '' };
        }
    }
    if (pkg.engines) {
        pkg.engines.theiaPlugin = pkg.engines.theiaPlugin ?? pkg.engines.vscode ?? '*';
    } else {
        pkg.engines = { theiaPlugin: '*' };
    }
    return pkg;
}

/**
 * Resolve plugins source path: walk up from the application package directory and use
 * theiaPluginsDir from the first package.json that defines it (often the root); otherwise default to 'plugins' relative to the app.
 * (ApplicationPackage has no method that reads parent package.json / theiaPluginsDir, so we read files here.)
 */
async function resolvePluginsSourcePath(applicationPackage: ApplicationPackage): Promise<string> {
    let dir = applicationPackage.projectPath;
    const defaultDir = 'plugins';
    while (true) {
        const pkgPath = path.join(dir, 'package.json');
        if (await fs.pathExists(pkgPath)) {
            const pkg = await fs.readJson(pkgPath) as { theiaPluginsDir?: string };
            if (typeof pkg.theiaPluginsDir === 'string') {
                return path.resolve(dir, pkg.theiaPluginsDir);
            }
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    return path.resolve(applicationPackage.projectPath, defaultDir);
}

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
        return `${PLUGINS_BASE_PATH}/${pluginId}/${relative.split(path.sep).join('/')}`;
    } catch {
        return fileUri;
    }
}

@injectable()
export class PrepareBrowserOnlyPluginsRunner {

    @inject(PluginScannerResolverSymbol)
    protected readonly scannerResolver: PluginScannerResolver;

    @inject(HostedPluginLocalizationService)
    protected readonly localizationService: HostedPluginLocalizationService;

    async run(applicationPackage: ApplicationPackage): Promise<void> {
        const pluginsDir = await resolvePluginsSourcePath(applicationPackage);
        if (!(await fs.pathExists(pluginsDir))) {
            return;
        }
        const hostedPluginDir = applicationPackage.lib('frontend', PLUGINS_BASE_PATH);
        await fs.ensureDir(hostedPluginDir);
        const names = await fs.readdir(pluginsDir);
        const deployedPlugins: DeployedPlugin[] = [];
        for (const name of names) {
            const entry = await this.processPlugin(path.join(pluginsDir, name), hostedPluginDir);
            if (entry) {
                deployedPlugins.push(entry);
            }
        }
        await fs.writeJson(path.join(hostedPluginDir, 'list.json'), deployedPlugins, { spaces: 2 });
    }

    /** Process one plugin directory: copy, localize manifest, build deployed entry. Returns undefined if skipped. */
    protected async processPlugin(
        pluginSourceDir: string,
        hostedPluginDir: string
    ): Promise<DeployedPlugin | undefined> {
        const stat = await fs.stat(pluginSourceDir).catch(() => undefined);
        if (!stat?.isDirectory()) { return undefined; }
        const packageRoot = resolvePluginRoot(pluginSourceDir);
        if (!packageRoot) { return undefined; }
        let manifest: PluginPackage;
        let resolvedPath: string;
        try {
            resolvedPath = await realpath(packageRoot);
            manifest = await loadManifest(resolvedPath);
            manifest.packagePath = resolvedPath;
        } catch {
            return undefined;
        }
        if (!manifest?.name) { return undefined; }
        const hasFrontend = hasFrontendEntry(manifest);
        const hasContrib = hasContributes(manifest);
        if (!hasFrontend && !hasContrib) { return undefined; }

        const pluginId = getPluginId(manifest);
        const dst = path.join(hostedPluginDir, pluginId);

        manifest = await this.localizationService.localizeManifest(dst, manifest);

        // Copy plugin files
        await fs.copy(resolvedPath, dst, {
            overwrite: true,
            dereference: true,
            filter: (src: string) => !/[/\\](\.git|node_modules)([/\\]|$)/.test(src)
        });

        // Replace package.json with localized version
        await fs.writeJson(path.join(dst, 'package.json'), manifest, { spaces: 2 });

        // Prepare plugin package
        const plugin = ensurePluginPackageForScanner(manifest);

        const scanner = this.scannerResolver.getScanner(plugin);
        const model = scanner.getModel(plugin);
        const lifecycle = scanner.getLifecycle(plugin);
        const contributes = await scanner.getContribution(plugin);

        if (model.entryPoint.frontend) {
            const absoluteEntry = path.resolve(plugin.packagePath, model.entryPoint.frontend);
            const resolved = await resolvePluginEntryFile(absoluteEntry);
            if (resolved) {
                model.entryPoint.frontend = path.relative(plugin.packagePath, resolved).split(path.sep).join('/');
            }
        }

        delete (lifecycle as unknown as Record<string, unknown>).backendInitPath;

        const metadata: PluginMetadata = {
            host: PLUGIN_HOST_BACKEND,
            model: { ...model },
            lifecycle: { ...lifecycle },
            outOfSync: false
        };

        const entry: DeployedPlugin = {
            type: PluginType.System,
            metadata,
            contributes
        };

        entry.metadata.model.packageUri = toHostedPluginUri(entry.metadata.model.packageUri, plugin.packagePath, pluginId);
        if (entry.metadata.model.licenseUrl) {
            entry.metadata.model.licenseUrl = toHostedPluginUri(entry.metadata.model.licenseUrl, plugin.packagePath, pluginId);
        }
        if (entry.metadata.model.iconUrl) {
            entry.metadata.model.iconUrl = toHostedPluginUri(entry.metadata.model.iconUrl, plugin.packagePath, pluginId);
        }
        if (entry.metadata.model.readmeUrl) {
            entry.metadata.model.readmeUrl = toHostedPluginUri(entry.metadata.model.readmeUrl, plugin.packagePath, pluginId);
        }
        if (entry.contributes?.themes) {
            entry.contributes.themes.forEach(t => { t.uri = toHostedPluginUri(t.uri, plugin.packagePath, pluginId); });
        }
        if (entry.contributes?.iconThemes) {
            entry.contributes.iconThemes.forEach(t => { t.uri = toHostedPluginUri(t.uri, plugin.packagePath, pluginId); });
        }
        if (entry.contributes?.snippets) {
            entry.contributes.snippets.forEach(s => { s.uri = toHostedPluginUri(s.uri, plugin.packagePath, pluginId); });
        }
        if (entry.contributes?.icons) {
            entry.contributes.icons.forEach(icon => {
                const defaults = icon.defaults;
                if (defaults && typeof defaults === 'object' && 'location' in defaults && typeof defaults.location === 'string') {
                    defaults.location = toHostedPluginUri(defaults.location, plugin.packagePath, pluginId);
                }
            });
        }

        return entry;
    }
}
