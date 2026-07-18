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
    applyTrustExtraction,
    buildLifecycle,
    buildModel,
    getPluginId,
    pickEngineType,
    toPluginUrl
} from '@theia/plugin-utils/lib/plugin-model';
import { getPluginRootFileUrl } from '@theia/plugin-utils/lib/node/plugin-model';
import { normalizeContributions } from '@theia/plugin-utils/lib/node/normalize-contributions';
import { readGrammarFromDisk } from '@theia/plugin-utils/lib/node/read-grammars';
import { localizePackage, loadPackageTranslations } from '@theia/plugin-utils/lib/node/package-nls';
import { deepClone } from '@theia/plugin-utils/lib/utils';
import type {
    NormalizedPluginContribution,
} from '@theia/plugin-utils/lib/contribution-types';

import {
    PLUGIN_HOST_BACKEND,
    PluginType,
    type DeployedPlugin,
    type PluginEntryPoint,
    type PluginManifest,
    type PluginModel,
} from '@theia/plugin-utils/lib/manifest-types';

export async function prepareBrowserOnlyPlugins(applicationPackage: ApplicationPackage): Promise<void> {
    const hostedPluginDir = applicationPackage.lib('frontend', PLUGINS_BASE_PATH);
    await fs.remove(hostedPluginDir);
    await fs.ensureDir(hostedPluginDir);

    const theiaPluginsDir = applicationPackage.pck.theiaPluginsDir;
    const pluginsDir = path.resolve(
        applicationPackage.projectPath,
        typeof theiaPluginsDir === 'string' ? theiaPluginsDir : DEFAULT_PLUGINS_DIR
    );

    const deployedPlugins: DeployedPlugin[] = [];

    if (await fs.pathExists(pluginsDir)) {
        const names = await fs.readdir(pluginsDir);
        for (const name of names) {
            const entry = await processPlugin(path.join(pluginsDir, name), hostedPluginDir);
            if (entry) {
                deployedPlugins.push(entry);
            }
        }
    }

    await fs.writeJson(path.join(hostedPluginDir, LIST_JSON), deployedPlugins, { spaces: 2 });
    console.log(`browser-only: prepared ${deployedPlugins.length} plugins`);
}

async function processPlugin(pluginSourceDir: string, hostedPluginDir: string): Promise<DeployedPlugin | undefined> {
    const packageRoot = resolvePluginRoot(pluginSourceDir);
    if (!packageRoot) {
        return undefined;
    }

    let buildTimePackageRoot: string;
    let rawManifest: PluginManifest;
    try {
        buildTimePackageRoot = await realpath(packageRoot);
        rawManifest = await fs.readJson(path.join(buildTimePackageRoot, 'package.json')) as PluginManifest;
        stripVscodeBuiltinNamePrefix(rawManifest);
    } catch (err) {
        console.warn(`browser-only: skip plugin at ${pluginSourceDir}`, err);
        return undefined;
    }

    if (!shouldIncludePluginInBrowserOnlyBuild(rawManifest)) {
        return undefined;
    }

    let normalized = deepClone(rawManifest);
    normalized.packagePath = buildTimePackageRoot;
    let contributes = await normalizeManifestForBrowserOnly(normalized);

    delete normalized.contributes;

    const translations = await loadPackageTranslations(buildTimePackageRoot);
    if (translations.default && Object.keys(translations.default).length > 0) {
        const resolve = (_: string, defaultVal: string): string => defaultVal;
        normalized = localizePackage(normalized, translations, resolve);
        contributes = localizePackage(contributes, translations, resolve);
    }

    const engineType = pickEngineType(normalized);
    const model = buildModel(normalized, engineType, { uiKind: 'web' });
    model.licenseUrl = getPluginRootFileUrl(normalized, ['license', 'license.txt', 'license.md']);
    model.readmeUrl = getPluginRootFileUrl(normalized, ['readme.md', 'readme.txt', 'readme']);
    applyTrustExtraction(normalized, model);
    const lifecycle = buildLifecycle(normalized, engineType);

    const pluginId = getPluginId(normalized);
    const dst = path.join(hostedPluginDir, pluginId);

    await fs.copy(buildTimePackageRoot, dst, {
        overwrite: true,
        dereference: true,
        filter: (src: string) => !PLUGIN_COPY_IGNORE.test(src)
    });

    resolveHostedEntryPoint(model.entryPoint, dst);
    rewriteModelPathsForHostedStatic(model, buildTimePackageRoot, pluginId);

    // Raw VS Code-style package.json for worker rawModel (contributes stay unnormalized).
    const diskManifest = deepClone(rawManifest);
    prepareHostedPackageJson(diskManifest, pluginId, model.entryPoint);
    await fs.writeJson(path.join(dst, 'package.json'), diskManifest, { spaces: 2 });

    return {
        type: PluginType.System,
        metadata: {
            host: PLUGIN_HOST_BACKEND,
            model,
            lifecycle,
            outOfSync: false
        },
        ...(Object.keys(contributes).length > 0 ? { contributes } : {})
    };
}

function resolvePluginRoot(dir: string): string | undefined {
    const direct = path.join(dir, 'package.json');
    if (fs.pathExistsSync(direct)) {
        return dir;
    }
    const inExtension = path.join(dir, 'extension', 'package.json');
    if (fs.pathExistsSync(inExtension)) {
        return path.join(dir, 'extension');
    }
    const inPackage = path.join(dir, 'package', 'package.json');
    if (fs.pathExistsSync(inPackage)) {
        return path.join(dir, 'package');
    }
    return undefined;
}

function hasContributes(pkg: PluginManifest): boolean {
    const c = pkg.contributes;
    return !!(c && typeof c === 'object' && Object.keys(c).length > 0);
}

function shouldIncludePluginInBrowserOnlyBuild(manifest: PluginManifest): boolean {
    if (!manifest.name) {
        return false;
    }
    return !!manifest.theiaPlugin?.frontend || !!manifest.browser || hasContributes(manifest);
}

/** Drop Node/Electron-only entry fields shared by list.json and on-disk package.json. */
function stripNonFrontendHostFields(manifest: PluginManifest): void {
    manifest.publisher ??= UNPUBLISHED;
    delete manifest.main;
    if (manifest.theiaPlugin) {
        delete manifest.theiaPlugin.backend;
        delete manifest.theiaPlugin.headless;
    }
}

function normalizePluginPackageForBrowserOnly(manifest: PluginManifest): void {
    stripNonFrontendHostFields(manifest);

    if (!manifest.engines) {
        manifest.engines = { theiaPlugin: '*' };
    }

    if (!manifest.theiaPlugin && manifest.browser) {
        manifest.theiaPlugin = { frontend: manifest.browser };
    }
}

async function normalizeManifestForBrowserOnly(manifest: PluginManifest): Promise<NormalizedPluginContribution> {
    normalizePluginPackageForBrowserOnly(manifest);
    updateActivationEvents(manifest);

    const contributes: NormalizedPluginContribution = {};
    const onError = (type: string, err: unknown, detail?: unknown): void => {
        console.warn(`browser-only: [${manifest.name}] contribution '${type}'`, detail, err);
    };
    const onWarn = (msg: string): void => {
        console.warn(`browser-only: [${manifest.name}] ${msg}`);
    };
    await normalizeContributions({
        plugin: manifest,
        resolveUrl: relative => toPluginUrl(manifest, relative),
        resolveUri: (pck, relative) => toPluginUrl(pck, relative),
        readGrammars: async (grammars, pluginPath) => {
            const result = [];
            for (const rawGrammar of grammars) {
                const grammar = await readGrammarFromDisk(rawGrammar, pluginPath, { onError });
                if (grammar) {
                    result.push(grammar);
                }
            }
            return result;
        },
        onError,
        onWarn,
    }, contributes);

    if (manifest.activationEvents?.length) {
        contributes.activationEvents = [...manifest.activationEvents];
    }

    return contributes;
}

/**
 * `list.json` carries normalized contributes + plugin metadata (single source of truth for Theia).
 * `hostedPlugin/<id>/package.json` stays a VS Code-style raw manifest for worker `rawModel`:
 * name-prefix strip, `main` removed, entry paths synced, and `packagePath`/`packageUri` set to the
 * static hosted root (needed so relative assets resolve via `toPluginUrl`).
 */
function prepareHostedPackageJson(manifest: PluginManifest, pluginId: string, entryPoint: PluginEntryPoint): void {
    stripNonFrontendHostFields(manifest);

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
