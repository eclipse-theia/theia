// *****************************************************************************
// Copyright (C) 2021 TypeFox, Maksim Kachurin and others.
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
 * Used by the backend when serving deployed plugins and by prepare-plugins when
 * generating browser-only list.json so the frontend receives already-localized data.
 */

import * as path from 'path';
import * as fs from '@theia/core/shared/fs-extra';
import { isObject } from '@theia/core/lib/common';
import { localizeWithResolver } from '../../common/package-nls-localize';

export interface PackageTranslation {
    translation?: Record<string, string>;
    default?: Record<string, string>;
}

interface LocalizeInfo {
    message: string;
    comment?: string;
}

function isLocalizeInfo(obj: unknown): obj is LocalizeInfo {
    return isObject(obj) && 'message' in obj;
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

export async function loadPackageTranslations(pluginPath: string, locale: string): Promise<PackageTranslation> {
    const defaultPath = path.join(pluginPath, 'package.nls.json');
    const localizedPath = path.join(pluginPath, `package.nls.${locale}.json`);
    try {
        const defaultRaw = await fs.readJson(defaultPath) as Record<string, string | LocalizeInfo>;
        const defaultValue = coerceLocalizations(defaultRaw ?? {});
        if (await fs.pathExists(localizedPath)) {
            const translationRaw = await fs.readJson(localizedPath) as Record<string, string | LocalizeInfo>;
            return {
                translation: coerceLocalizations(translationRaw ?? {}),
                default: defaultValue
            };
        }
        return { default: defaultValue };
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw e;
        }
        return {};
    }
}

export type LocalizePackageCallback = (key: string, defaultValue: string) => string;

/**
 * Recursively replaces %key% strings in value with translations.
 * callback is used when only default (package.nls.json) exists; e.g. backend passes
 * Theia's Localization.localize for fallback, build-time can use (_, d) => d.
 */
/** Lookup key in map; tries exact key then key.toLowerCase() so %view.name% and %VIEW.NAME% both resolve. */
function findInMap(map: Record<string, string> | undefined, key: string): string | undefined {
    if (!map) {return undefined; }
    if (key in map) {return map[key]; }
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
