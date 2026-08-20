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
} from '@theia/plugin-utils/lib/common/constants';
import { stripVscodeBuiltinNamePrefix } from '@theia/plugin-utils/lib/common/plugin-manifest';
import { updateActivationEvents } from '@theia/plugin-utils/lib/common/plugin-activation-events';
import {
    applyTrustExtraction,
    buildLifecycle,
    buildModel,
    getPluginId,
    pickEngineType,
    toPluginUrl
} from '@theia/plugin-utils/lib/common/plugin-model';
import { getPluginRootFileUrl } from '@theia/plugin-utils/lib/node/plugin-model';
import { normalizeContributions } from '@theia/plugin-utils/lib/node/normalize-contributions';
import { readGrammarFromDisk } from '@theia/plugin-utils/lib/node/read-grammars';
import { localizePackage } from '@theia/plugin-utils/lib/common/package-nls';
import { loadPackageTranslations } from '@theia/plugin-utils/lib/node/package-nls';
import { deepClone } from '@theia/plugin-utils/lib/common/utils';
import type {
    NormalizedPluginContribution,
} from '@theia/plugin-utils/lib/common/contribution-types';

import {
    PLUGIN_HOST_BACKEND,
    PluginType,
    type DeployedPlugin,
    type PluginEntryPoint,
    type PluginManifest,
    type PluginModel,
} from '@theia/plugin-utils/lib/common/manifest-types';

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
    const skippedByReason: Partial<Record<NonNullable<ProcessPluginResult['skipReason']>, string[]>> = {};
    const errored: string[] = [];

    if (await fs.pathExists(pluginsDir)) {
        const names = await fs.readdir(pluginsDir);
        for (const name of names) {
            const result = await processPlugin(path.join(pluginsDir, name), hostedPluginDir);
            if (result?.plugin) {
                deployedPlugins.push(result.plugin);
            } else if (result?.skipReason) {
                (skippedByReason[result.skipReason] ??= []).push(result.label ?? name);
            } else {
                errored.push(result?.label ?? name);
            }
        }
    }

    await fs.writeJson(path.join(hostedPluginDir, LIST_JSON), deployedPlugins);

    const lines = [`browser-only: prepared ${deployedPlugins.length} plugins`];
    for (const [reason, labels] of Object.entries(skippedByReason)) {
        if (labels?.length) {
            lines.push(`  skipped ${labels.length} ${reason}:`);
            lines.push(`    ${labels.join(', ')}`);
        }
    }
    if (errored.length > 0) {
        lines.push(`  ${errored.length} errors:`);
        lines.push(`    ${errored.join(', ')}`);
    }
    console.log(lines.join('\n'));
}

interface ProcessPluginResult {
    plugin?: DeployedPlugin;
    /** Set when the plugin was intentionally omitted (not a hard error). */
    skipReason?: 'backend-only' | 'no-browser-surface' | 'no-package' | 'malformed';
    /** Plugin id/name or source directory basename */
    label?: string;
}

async function processPlugin(pluginSourceDir: string, hostedPluginDir: string): Promise<ProcessPluginResult | undefined> {
    const dirLabel = path.basename(pluginSourceDir);
    try {
        const packageRoot = resolvePluginRoot(pluginSourceDir);
        if (!packageRoot) {
            return { skipReason: 'no-package', label: dirLabel };
        }

        const buildTimePackageRoot = await realpath(packageRoot);
        const rawManifest = await fs.readJson(path.join(buildTimePackageRoot, 'package.json')) as PluginManifest;
        stripVscodeBuiltinNamePrefix(rawManifest);

        const skipReason = getBrowserOnlySkipReason(rawManifest);
        if (skipReason) {
            const label = rawManifest.name || dirLabel;
            if (skipReason === 'backend-only') {
                console.warn(`browser-only: skip '${label}' (backend-only)`);
            } else if (skipReason === 'malformed') {
                console.warn(`browser-only: skip '${dirLabel}' (malformed manifest: missing name)`);
            }
            return { skipReason, label };
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
            filter: (src: string) => shouldCopyPluginPath(src, buildTimePackageRoot)
        });

        resolveHostedEntryPoint(model.entryPoint, dst);
        rewriteModelPathsForHostedStatic(model, buildTimePackageRoot, pluginId);

        // Raw VS Code-style package.json for worker rawModel (contributes stay unnormalized).
        const diskManifest = deepClone(rawManifest);
        prepareHostedPackageJson(diskManifest, pluginId, model.entryPoint);
        await fs.writeJson(path.join(dst, 'package.json'), diskManifest, { spaces: 2 });

        return {
            plugin: {
                type: PluginType.System,
                metadata: {
                    host: PLUGIN_HOST_BACKEND,
                    model,
                    lifecycle,
                    outOfSync: false
                },
                ...(Object.keys(contributes).length > 0 ? { contributes } : {})
            }
        };
    } catch (err) {
        console.warn(`browser-only: skip plugin at ${pluginSourceDir}`, err);
        return { label: dirLabel };
    }
}

/** Copy filter: ignore node_modules/.git relative to the plugin root (not absolute path). */
export function shouldCopyPluginPath(src: string, pluginRoot: string): boolean {
    return !PLUGIN_COPY_IGNORE.test(`${path.sep}${path.relative(pluginRoot, src)}`);
}

export function resolvePluginRoot(dir: string): string | undefined {
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

function hasFrontendEntry(manifest: PluginManifest): boolean {
    return !!manifest.theiaPlugin?.frontend || !!manifest.browser;
}

function hasBackendEntry(manifest: PluginManifest): boolean {
    return !!manifest.main || !!manifest.theiaPlugin?.backend || !!manifest.theiaPlugin?.headless;
}

/** `undefined` = include; backend-only even with contributes is excluded. */
export function getBrowserOnlySkipReason(
    manifest: PluginManifest
): 'backend-only' | 'no-browser-surface' | 'malformed' | undefined {
    if (!manifest.name) {
        return 'malformed';
    }
    if (hasFrontendEntry(manifest)) {
        return undefined;
    }
    if (hasBackendEntry(manifest)) {
        return 'backend-only';
    }
    if (hasContributes(manifest)) {
        return undefined;
    }
    return 'no-browser-surface';
}

export function shouldIncludePluginInBrowserOnlyBuild(manifest: PluginManifest): boolean {
    return getBrowserOnlySkipReason(manifest) === undefined;
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
}

export function resolvePluginEntryFileSync(absolutePath: string): string | undefined {
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

export function toHostedPluginUri(fileUri: string, pluginRoot: string, pluginId: string): string {
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
