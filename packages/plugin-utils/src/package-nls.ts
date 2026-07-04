// *****************************************************************************
// Copyright (C) 2021 TypeFox and others.
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
 * Localization for package.json contribution strings (%key% placeholders).
 * Used by the backend when serving deployed plugins and by browser-only build prepare
 * so the frontend receives already-localized data.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { isObject, isENOENT } from './local-utils';

export interface PackageTranslation {
    translation?: Record<string, string>;
    default?: Record<string, string>;
}

interface LocalizeInfo {
    message: string;
    comment?: string;
}

function isLocalizeInfo(obj: unknown): obj is LocalizeInfo {
    return isObject(obj) && 'message' in obj && typeof (obj as { message?: unknown }).message === 'string';
}

export function coerceLocalizations(translations: Record<string, string | LocalizeInfo>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(translations)) {
        if (typeof value === 'string') {
            result[key] = value;
        } else if (isLocalizeInfo(value)) {
            result[key] = value.message;
        } else {
            // Only strings or LocalizeInfo values are valid
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
    if (isObject(value)) {
        const result: Record<string, unknown> = {};
        for (const [name, item] of Object.entries(value)) {
            result[name] = localizeWithResolver(item, resolve);
        }
        return result as T;
    }
    return value;
}

export type LocalizePackageCallback = (key: string, defaultValue: string) => string;

/**
 * Recursively replaces %key% strings in value with translations.
 * callback is used when only default (package.nls.json) exists; e.g. backend passes
 * Theia's Localization.localize for fallback, build-time can use (_, d) => d.
 */
export function localizePackage<T>(
    value: T,
    translations: PackageTranslation,
    callback: LocalizePackageCallback
): T {
    return localizeWithResolver(value, key => {
        if (translations.translation && key in translations.translation) {
            return translations.translation[key];
        }
        if (translations.default && key in translations.default) {
            return callback(key, translations.default[key]);
        }
        return undefined;
    });
}

/**
 * Reads `package.nls.json` and optionally `package.nls.<locale>.json` from a plugin directory.
 * Returns `{}` when no default bundle exists.
 */
export async function loadPackageTranslations(pluginPath: string, locale?: string): Promise<PackageTranslation> {
    const defaultPath = path.join(pluginPath, 'package.nls.json');
    try {
        const defaultValue = coerceLocalizations(await fs.readJson(defaultPath));
        if (locale) {
            const localizedPath = path.join(pluginPath, `package.nls.${locale}.json`);
            if (await fs.pathExists(localizedPath)) {
                return {
                    translation: coerceLocalizations(await fs.readJson(localizedPath)),
                    default: defaultValue
                };
            }
        }
        return { default: defaultValue };
    } catch (error) {
        if (isENOENT(error)) {
            return {};
        }
        throw error;
    }
}
