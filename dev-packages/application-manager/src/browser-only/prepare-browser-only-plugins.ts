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
 */

import { realpath } from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs-extra';
import { ApplicationPackage } from '@theia/application-package';
import {
    DEFAULT_PLUGINS_DIR,
    LIST_JSON,
    PLUGINS_BASE_PATH,
    PLUGIN_COPY_IGNORE,
    UNPUBLISHED,
} from '@theia/plugin-utils/lib/constants';
import { stripVscodeBuiltinNamePrefix } from '@theia/plugin-utils/lib/plugin-manifest';
import { updateActivationEvents } from '@theia/plugin-utils/lib/plugin-activation-events';
import {
    buildLifecycle,
    buildModel,
    getPluginId,
    pickEngineType,
    toPluginUrl
} from '@theia/plugin-utils/lib/plugin-model';
import { normalizeContributions } from '@theia/plugin-utils/lib/normalize-contributions';
import { readGrammarFromDisk, type GrammarsContribution } from '@theia/plugin-utils/lib/read-grammars';
import { localizePackage, loadPackageTranslations } from '@theia/plugin-utils/lib/package-nls';
import type { PluginPackageGrammarsContribution } from '@theia/plugin-utils/lib/contribution-types';

import {
    PLUGIN_HOST_BACKEND,
    PluginType,
    rawContributes,
    type PluginEntryPoint,
    type PluginManifest,
    type PluginMetadata,
    type PluginModel,
} from '@theia/plugin-utils/lib/manifest-types';

/** `package.json` read from disk during browser-only build prepare. */
export interface BrowserOnlyManifest extends PluginManifest {
    extensionDependencies?: string[];
    extensionPack?: string[];
}

/** Static contributions written to `list.json` (loose shape for serialized output). */
export interface BrowserOnlyPluginContribution {
    activationEvents?: string[];
    authentication?: unknown[];
    configuration?: unknown[];
    configurationDefaults?: Record<string, unknown>;
    languages?: unknown[];
    grammars?: unknown[];
    customEditors?: unknown[];
    viewsContainers?: Record<string, unknown[]>;
    views?: Record<string, unknown[]>;
    viewsWelcome?: unknown[];
    commands?: unknown[];
    menus?: Record<string, unknown[]>;
    submenus?: unknown[];
    keybindings?: unknown[];
    debuggers?: unknown[];
    snippets?: unknown[];
    themes?: unknown[];
    iconThemes?: unknown[];
    icons?: unknown[];
    colors?: unknown[];
    taskDefinitions?: unknown[];
    problemMatchers?: unknown[];
    problemPatterns?: unknown[];
    resourceLabelFormatters?: unknown[];
    localizations?: unknown[];
    terminalProfiles?: unknown[];
    notebooks?: unknown[];
    notebookRenderer?: unknown[];
    notebookPreload?: unknown[];
    [key: string]: unknown;
}

/** One entry in `lib/frontend/hostedPlugin/list.json`. */
export interface BrowserOnlyDeployedPlugin {
    type: PluginType;
    metadata: PluginMetadata;
    contributes?: BrowserOnlyPluginContribution;
}

export async function prepareBrowserOnlyPlugins(applicationPackage: ApplicationPackage): Promise<void> {
    const hostedPluginDir = applicationPackage.lib('frontend', PLUGINS_BASE_PATH);
    await fs.remove(hostedPluginDir);

    const pluginsDir = await resolvePluginsSourcePath(applicationPackage.projectPath);

    if (!(await fs.pathExists(pluginsDir))) {
        return;
    }

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
    console.log(`browser-only: prepared ${deployedPlugins.length} plugins`);
}

async function processPlugin(pluginSourceDir: string, hostedPluginDir: string): Promise<BrowserOnlyDeployedPlugin | undefined> {
    const packageRoot = resolvePluginRoot(pluginSourceDir);
    if (!packageRoot) { return undefined; }

    let manifest: BrowserOnlyManifest;
    let resolvedPath: string;
    try {
        resolvedPath = await realpath(packageRoot);
        manifest = await loadManifestForBrowserOnly(resolvedPath);
    } catch (err) {
        console.warn(`browser-only: skip plugin at ${pluginSourceDir}`, err);
        return undefined;
    }

    if (!shouldIncludePluginInBrowserOnlyBuild(manifest)) {
        return undefined;
    }

    const buildTimePackageRoot = manifest.packagePath;

    const engineType = pickEngineType(manifest);
    const model = buildModel(manifest, engineType, { uiKind: 'web' });
    const lifecycle = buildLifecycle(manifest, engineType);

    const pluginId = getPluginId(manifest);
    const dst = path.join(hostedPluginDir, pluginId);

    await fs.copy(resolvedPath, dst, {
        overwrite: true,
        dereference: true,
        filter: (src: string) => !PLUGIN_COPY_IGNORE.test(src)
    });

    resolveHostedEntryPoint(model.entryPoint, dst);
    rewriteModelPathsForHostedStatic(model, buildTimePackageRoot, pluginId);
    finalizeHostedManifest(manifest, pluginId, model.entryPoint);

    await fs.writeJson(path.join(dst, 'package.json'), manifest, { spaces: 2 });

    const entry: BrowserOnlyDeployedPlugin = {
        type: PluginType.System,
        metadata: {
            host: PLUGIN_HOST_BACKEND,
            model,
            lifecycle,
            outOfSync: false
        },
        contributes: manifest.contributes as BrowserOnlyPluginContribution | undefined
    };

    return entry;
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

function hasContributes(pkg: BrowserOnlyManifest): boolean {
    const c = pkg.contributes;
    return !!(c && typeof c === 'object' && Object.keys(c).length > 0);
}

function shouldIncludePluginInBrowserOnlyBuild(manifest: BrowserOnlyManifest): boolean {
    if (!manifest?.name) { return false; }
    return !!manifest.theiaPlugin?.frontend || !!manifest.browser || hasContributes(manifest);
}

function normalizePluginPackageForBrowserOnly(manifest: BrowserOnlyManifest): void {
    manifest.publisher ??= UNPUBLISHED;

    if (!manifest.engines) {
        manifest.engines = { theiaPlugin: '*' };
    }

    if (!manifest.theiaPlugin && manifest.browser) {
        manifest.theiaPlugin = { frontend: manifest.browser as string };
    }

    if (manifest.theiaPlugin) {
        delete manifest.theiaPlugin.backend;
        delete manifest.theiaPlugin.headless;
    }

    if (manifest.main) {
        delete manifest.main;
    }
}

async function normalizeManifestForBrowserOnly(manifest: BrowserOnlyManifest): Promise<void> {
    normalizePluginPackageForBrowserOnly(manifest);
    updateActivationEvents(manifest);

    const contributes = rawContributes(manifest) as Record<string, unknown>;
    manifest.contributes = await normalizeContributions({
        plugin: manifest,
        resolveUrl: relative => toPluginUrl(manifest, relative),
        resolveUri: (pck, relative) => toPluginUrl(pck as BrowserOnlyManifest, relative),
        readGrammars: async (grammars, pluginPath) => {
            const rawGrammars = grammars as PluginPackageGrammarsContribution[];
            const result: GrammarsContribution[] = [];
            for (const rawGrammar of rawGrammars) {
                const grammar = await readGrammarFromDisk(rawGrammar, pluginPath);
                if (grammar) {
                    result.push(grammar);
                }
            }
            return result;
        },
        onError: (type, err, detail) => console.warn(`browser-only: [${manifest.name}] contribution '${type}'`, detail, err),
        onWarn: msg => console.warn(`browser-only: [${manifest.name}] ${msg}`),
    }, contributes);

    if (manifest.activationEvents?.length) {
        contributes.activationEvents = [...manifest.activationEvents];
    }
}

async function resolvePluginsSourcePath(projectPath: string): Promise<string> {
    const pkgPath = path.join(projectPath, 'package.json');
    if (await fs.pathExists(pkgPath)) {
        const pkg = await fs.readJson(pkgPath) as { theiaPluginsDir?: string };
        if (typeof pkg.theiaPluginsDir === 'string') {
            return path.resolve(projectPath, pkg.theiaPluginsDir);
        }
    }
    return path.resolve(projectPath, DEFAULT_PLUGINS_DIR);
}

/** Replaces `%key%` placeholders using `package.nls.json` (default bundle only). */
async function localizeBrowserOnlyManifest(manifest: BrowserOnlyManifest, pluginRoot: string): Promise<void> {
    const translations = await loadPackageTranslations(pluginRoot);
    if (!translations.default || Object.keys(translations.default).length === 0) {
        return;
    }
    const localized = localizePackage(manifest, translations, (_, defaultVal) => defaultVal) as BrowserOnlyManifest;
    const m = manifest as unknown as Record<string, unknown>;
    for (const key of Object.keys(m)) {
        delete m[key];
    }
    Object.assign(manifest, localized);
}

async function loadManifestForBrowserOnly(pluginPath: string): Promise<BrowserOnlyManifest> {
    const manifest = await fs.readJson(path.join(pluginPath, 'package.json')) as BrowserOnlyManifest;
    stripVscodeBuiltinNamePrefix(manifest);

    const root = path.resolve(pluginPath);
    manifest.packagePath = root;

    await normalizeManifestForBrowserOnly(manifest);
    await localizeBrowserOnlyManifest(manifest, root);

    return manifest;
}

/**
 * `list.json` is the deployment manifest (entryPoint, lifecycle, normalized contributes).
 * `hostedPlugin/<id>/package.json` is the on-disk extension descriptor for worker `rawModel`
 * and static HTTP serving — not a second source of truth for loading.
 *
 * - Model URLs in `list.json` use `hostedPlugin/...` (static asset paths).
 * - `contributes.*.uri` in both artifacts use the same `hostedPlugin/...` encoding.
 * - VS Code manifest fields (`icon`, `browser`, …) stay relative to the extension root;
 *   the loader resolves them via `metadata.model` (`iconUrl`, `entryPoint`), not raw `icon`.
 */
function finalizeHostedManifest(manifest: BrowserOnlyManifest, pluginId: string, entryPoint: PluginEntryPoint): void {
    const packageRoot = `${PLUGINS_BASE_PATH}/${pluginId}/`;
    manifest.packagePath = packageRoot;
    manifest.packageUri = packageRoot;

    if (entryPoint.frontend) {
        if (manifest.theiaPlugin) {
            manifest.theiaPlugin.frontend = entryPoint.frontend;
        }
        if (manifest.browser) {
            manifest.browser = entryPoint.frontend;
        }
    }
}

function resolveHostedEntryPoint(entryPoint: PluginEntryPoint, pluginRoot: string): void {
    if (!entryPoint.frontend) {
        return;
    }
    const absoluteEntry = path.resolve(pluginRoot, entryPoint.frontend);
    const resolved = resolvePluginEntryFileSync(absoluteEntry);
    if (resolved) {
        entryPoint.frontend = path.relative(pluginRoot, resolved).split(path.sep).join('/');
    }
}

function rewriteModelPathsForHostedStatic(model: PluginModel, buildTimePackageRoot: string, pluginId: string): void {
    model.packageUri = toHostedPluginUri(model.packageUri, buildTimePackageRoot, pluginId);
    model.packagePath = model.packageUri;

    if (model.licenseUrl) {
        model.licenseUrl = toHostedPluginUri(model.licenseUrl, buildTimePackageRoot, pluginId);
    }
    if (model.iconUrl) {
        model.iconUrl = toHostedPluginUri(model.iconUrl, buildTimePackageRoot, pluginId);
    }
    if (model.readmeUrl) {
        model.readmeUrl = toHostedPluginUri(model.readmeUrl, buildTimePackageRoot, pluginId);
    }
}

function resolvePluginEntryFileSync(absolutePath: string): string | undefined {
    const candidates = [absolutePath];
    const pathExtension = path.extname(absolutePath).toLowerCase();
    if (!pathExtension) {
        candidates.push(absolutePath + '.js');
    } else if (pathExtension === '.js') {
        candidates.push(absolutePath.replace(/\.js$/i, '.cjs'));
        candidates.push(absolutePath.replace(/\.js$/i, '.mjs'));
    }
    for (const candidate of candidates) {
        if (fs.pathExistsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
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
