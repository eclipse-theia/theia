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

import {
    PLUGINS_BASE_PATH,
    THEIA_PLUGIN_START_METHOD,
    THEIA_PLUGIN_STOP_METHOD,
    UNPUBLISHED,
    VSCODE_EXTENSION_ACTIVATE,
    VSCODE_EXTENSION_DEACTIVATE,
    VSCODE_FRONTEND_INIT
} from './constants';
import type {
    PluginEntryPoint,
    PluginLifecycle,
    PluginModel,
    PluginManifest,
    PluginPackageCapabilities
} from './manifest-types';

export interface PluginIdentifierSource {
    publisher?: string;
    name: string;
}

export interface VsCodeBuildOptions {
    /** When `'web'`, UI-only extensions prefer the browser entry point (Codespaces behavior). */
    uiKind?: 'web' | 'desktop';
}

export function getPluginId(plugin: PluginIdentifierSource): string {
    return `${plugin.publisher ?? UNPUBLISHED}_${plugin.name}`.replace(/\W/g, '_');
}

/**
 * Builds a static-friendly plugin asset URL: `hostedPlugin/<id>/<segments...>`.
 * Path separators stay literal `/`; each segment is `encodeURIComponent`'d so plain
 * static file servers (browser-only) resolve assets without needing Express `:path(*)` decoding.
 * `.` is dropped and `..` is resolved within the plugin root (leading `..` is ignored).
 */
export function toPluginUrl(pck: PluginIdentifierSource, relativePath: string): string {
    const segments: string[] = [];
    for (const segment of relativePath.replace(/\\/g, '/').split('/')) {
        if (!segment || segment === '.') {
            continue;
        }
        if (segment === '..') {
            // Drop parent segment when present; ignore leading `..` so URLs never contain
            // literal `..` (encodeURIComponent does not encode dots).
            segments.pop();
            continue;
        }
        segments.push(encodeURIComponent(segment));
    }
    return `${PLUGINS_BASE_PATH}/${getPluginId(pck)}/${segments.join('/')}`;
}

/**
 * Explicit `theiaPlugin` engine takes priority over `vscode`.
 */
export function pickEngineType(manifest: PluginManifest): 'theiaPlugin' | 'vscode' {
    if (manifest.engines?.theiaPlugin !== undefined) {
        return 'theiaPlugin';
    }
    if (manifest.engines?.vscode !== undefined) {
        return 'vscode';
    }
    throw new Error(`No vscode or theiaPlugin engine in ${manifest.name}`);
}

export function applyTrustExtraction(
    manifest: { capabilities?: PluginPackageCapabilities },
    result: { untrustedWorkspacesSupport?: boolean | 'limited' }
): void {
    const untrustedWorkspacesSupport = manifest.capabilities?.untrustedWorkspaces?.supported;
    if (untrustedWorkspacesSupport !== undefined) {
        result.untrustedWorkspacesSupport = untrustedWorkspacesSupport;
    }
}

/** Minimal `pathToFileURL(...).href` without importing Node's `url` (keeps this module worker-safe). */
function pathToFileUrlHref(absolutePath: string): string {
    const normalized = absolutePath.replace(/\\/g, '/');
    if (/^[a-zA-Z]:\//.test(normalized)) {
        return `file:///${normalized}`;
    }
    return `file://${normalized.startsWith('/') ? normalized : `/${normalized}`}`;
}

export function buildEntryPointForTheia(manifest: PluginManifest): PluginEntryPoint {
    const result: PluginEntryPoint = {
        frontend: manifest.theiaPlugin?.frontend,
        backend: manifest.theiaPlugin?.backend
    };
    if (manifest.theiaPlugin?.headless) {
        result.headless = manifest.theiaPlugin.headless;
    }
    return result;
}

export function buildEntryPointForVsCode(manifest: PluginManifest, options?: VsCodeBuildOptions): PluginEntryPoint {
    const entryPoint: PluginEntryPoint = {};
    const preferFrontend = options?.uiKind === 'web'
        && manifest.extensionKind?.length === 1
        && manifest.extensionKind[0] === 'ui';

    if (manifest.browser && (!manifest.main || preferFrontend)) {
        entryPoint.frontend = manifest.browser;
    } else {
        entryPoint.backend = manifest.main;
    }
    if (manifest.theiaPlugin?.headless) {
        entryPoint.headless = manifest.theiaPlugin.headless;
    }
    return entryPoint;
}

export function buildModelForTheia(manifest: PluginManifest): PluginModel {
    const publisher = manifest.publisher ?? UNPUBLISHED;
    const packageUri = manifest.packageUri ?? pathToFileUrlHref(manifest.packagePath);

    return {
        packagePath: manifest.packagePath,
        packageUri,
        id: `${publisher.toLowerCase()}.${manifest.name.toLowerCase()}`,
        name: manifest.name,
        publisher,
        version: manifest.version,
        displayName: manifest.displayName ?? manifest.name,
        description: manifest.description ?? '',
        l10n: manifest.l10n,
        engine: {
            type: 'theiaPlugin',
            version: manifest.engines?.theiaPlugin ?? '*'
        },
        entryPoint: buildEntryPointForTheia(manifest),
    };
}

export function buildModelForVsCode(manifest: PluginManifest, options?: VsCodeBuildOptions): PluginModel {
    const publisher = manifest.publisher ?? UNPUBLISHED;
    const packageUri = manifest.packageUri ?? pathToFileUrlHref(manifest.packagePath);
    return {
        packagePath: manifest.packagePath,
        packageUri,
        id: `${publisher.toLowerCase()}.${manifest.name.toLowerCase()}`,
        name: manifest.name,
        publisher,
        version: manifest.version,
        displayName: manifest.displayName ?? manifest.name,
        description: manifest.description ?? '',
        l10n: manifest.l10n,
        engine: {
            type: 'vscode',
            version: manifest.engines?.vscode ?? '*'
        },
        entryPoint: buildEntryPointForVsCode(manifest, options),
        iconUrl: manifest.icon ? toPluginUrl(manifest, manifest.icon) : undefined,
    };
}

export function buildModel(manifest: PluginManifest, engineType: 'theiaPlugin' | 'vscode', options?: VsCodeBuildOptions): PluginModel {
    return engineType === 'theiaPlugin' ? buildModelForTheia(manifest) : buildModelForVsCode(manifest, options);
}

export function buildLifecycle(manifest: PluginManifest, engineType: 'theiaPlugin' | 'vscode'): PluginLifecycle {
    const frontendModuleName = getPluginId(manifest);
    if (engineType === 'theiaPlugin') {
        return {
            startMethod: THEIA_PLUGIN_START_METHOD,
            stopMethod: THEIA_PLUGIN_STOP_METHOD,
            frontendModuleName,
        };
    }
    return {
        startMethod: VSCODE_EXTENSION_ACTIVATE,
        stopMethod: VSCODE_EXTENSION_DEACTIVATE,
        frontendModuleName,
        frontendInitPath: VSCODE_FRONTEND_INIT
    };
}
