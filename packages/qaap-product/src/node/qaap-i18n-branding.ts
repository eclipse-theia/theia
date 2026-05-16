// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as fs from 'fs-extra';
import * as path from 'path';
import { isObject } from '@theia/core/lib/common/types';
import { applyQaapBrandingToText } from '../common/qaap-i18n-branding-rules';

/** Locales shipped by {@link TheiaLocalizationContribution} that receive Qaap branding overlays. */
export const QAAP_BRANDING_LOCALES = [
    'de', 'es', 'fr', 'it', 'pt-br', 'ja', 'ko', 'zh-cn', 'zh-tw', 'ru', 'tr', 'pl', 'cs', 'hu'
] as const;

export function flattenTranslations(localization: unknown, prefix = ''): Record<string, string> {
    if (!isObject(localization)) {
        return {};
    }
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(localization)) {
        const fullKey = prefix ? `${prefix}/${key}` : key;
        if (typeof value === 'string') {
            record[fullKey] = value;
        } else if (isObject(value)) {
            Object.assign(record, flattenTranslations(value, fullKey));
        }
    }
    return record;
}

export function resolveCoreNlsPath(languageId: string): string {
    const coreRoot = path.dirname(require.resolve('@theia/core/package.json'));
    const file = languageId === 'en' ? 'nls.json' : `nls.${languageId}.json`;
    return path.join(coreRoot, 'i18n', file);
}

/** Builds translation-key overrides to merge after core localizations for a locale. */
export async function buildQaapBrandingOverlay(languageId: string): Promise<Record<string, string>> {
    const nlsPath = resolveCoreNlsPath(languageId);
    if (!await fs.pathExists(nlsPath)) {
        return {};
    }
    const json = await fs.readJson(nlsPath);
    const flat = flattenTranslations(json);
    const overlay: Record<string, string> = {};
    for (const [key, value] of Object.entries(flat)) {
        const branded = applyQaapBrandingToText(value, languageId);
        if (branded !== value) {
            overlay[key] = branded;
        }
    }
    return overlay;
}
