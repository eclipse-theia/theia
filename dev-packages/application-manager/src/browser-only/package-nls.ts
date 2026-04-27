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
 * Resolves `%key%` placeholders in extension manifests using `package.nls.json` (default bundle only).
 * Mirrors `packages/plugin-ext/src/hosted/node/plugin-package-localization.ts` and
 * `packages/plugin-ext/src/common/package-nls-localize.ts` without depending on `@theia/plugin-ext`.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import type { BrowserOnlyManifest } from './types';

export interface PackageTranslation {
    translation?: Record<string, string>;
    default?: Record<string, string>;
}

interface LocalizeInfo {
    message: string;
    comment?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isLocalizeInfo(obj: unknown): obj is LocalizeInfo {
    return isObject(obj) && 'message' in obj && typeof (obj as { message?: unknown }).message === 'string';
}

function coerceLocalizations(translations: Record<string, string | LocalizeInfo>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(translations)) {
        if (typeof value === 'string') {
            result[key] = value;
        } else if (isLocalizeInfo(value)) {
            result[key] = value.message;
        } else {
            result[key] = 'INVALID TRANSLATION VALUE';
        }
    }
    return result;
}

/**
 * Recursively walks `value` and replaces strings matching `%key%` with the result of `resolve(key)`.
 * If `resolve(key)` returns `undefined`, the original string is kept.
 */
export function localizeWithResolver<T>(value: T, resolve: (key: string) => string | undefined): T {
    if (typeof value === 'string') {
        if (value.length > 2 && value.startsWith('%') && value.endsWith('%')) {
            const key = value.slice(1, -1);
            const replaced = resolve(key);
            return (replaced !== undefined ? replaced : value) as T;
        }
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(item => localizeWithResolver(item, resolve)) as T;
    }
    if (typeof value === 'object' && value !== null) {
        const result: Record<string, unknown> = {};
        for (const [name, item] of Object.entries(value)) {
            result[name] = localizeWithResolver(item, resolve);
        }
        return result as T;
    }
    return value;
}

export type LocalizePackageCallback = (key: string, defaultValue: string) => string;

/** Lookup key in map; tries exact key then key.toLowerCase() so %view.name% and %VIEW.NAME% both resolve. */
function findInMap(map: Record<string, string> | undefined, key: string): string | undefined {
    if (!map) {
        return undefined;
    }
    if (key in map) {
        return map[key];
    }
    const found = Object.keys(map).find(k => k.toLowerCase() === key.toLowerCase());
    return found ? map[found] : undefined;
}

export function localizePackage<T>(
    value: T,
    translations: PackageTranslation,
    callback: LocalizePackageCallback
): T {
    return localizeWithResolver(value, key => {
        const translated = findInMap(translations.translation, key) ?? findInMap(translations.default, key);
        if (translated !== undefined) {
            return translated;
        }
        const defaultVal = findInMap(translations.default, key);
        return defaultVal !== undefined ? callback(key, defaultVal) : undefined;
    });
}

/** Loads only `package.nls.json` (no `package.nls.<locale>.json`). */
export async function loadDefaultPackageNls(pluginRoot: string): Promise<PackageTranslation> {
    const defaultPath = path.join(pluginRoot, 'package.nls.json');
    try {
        const defaultRaw = await fs.readJson(defaultPath) as Record<string, string | LocalizeInfo>;
        const defaultValue = coerceLocalizations(defaultRaw ?? {});
        return { default: defaultValue };
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
            return {};
        }
        throw e;
    }
}

/**
 * Mutates `manifest` in place: replaces `%key%` strings using `package.nls.json` next to the extension root.
 */
export async function localizeBrowserOnlyManifest(manifest: BrowserOnlyManifest, pluginRoot: string): Promise<void> {
    const translations = await loadDefaultPackageNls(pluginRoot);
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
