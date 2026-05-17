// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { isObject } from '@theia/core/lib/common/types';
import { applyQaapBrandingToText } from '../common/qaap-i18n-branding-rules';

/** Locales shipped by {@link TheiaLocalizationContribution} that receive Qaap branding overlays. */
export const QAAP_BRANDING_LOCALES = [
    'de', 'es', 'fr', 'it', 'pt-br', 'ja', 'ko', 'zh-cn', 'zh-tw', 'ru', 'tr', 'pl', 'cs', 'hu'
] as const;

export type QaapBrandingLocale = (typeof QAAP_BRANDING_LOCALES)[number];

/**
 * Core nls packs (static requires — same approach as core's TheiaLocalizationContribution).
 * Avoids `require.resolve('@theia/core/package.json')`, which esbuild flags when bundling the backend.
 */
const CORE_NLS_BY_LOCALE: Record<QaapBrandingLocale, unknown> = {
    de: require('@theia/core/i18n/nls.de.json'),
    es: require('@theia/core/i18n/nls.es.json'),
    fr: require('@theia/core/i18n/nls.fr.json'),
    it: require('@theia/core/i18n/nls.it.json'),
    'pt-br': require('@theia/core/i18n/nls.pt-br.json'),
    ja: require('@theia/core/i18n/nls.ja.json'),
    ko: require('@theia/core/i18n/nls.ko.json'),
    'zh-cn': require('@theia/core/i18n/nls.zh-cn.json'),
    'zh-tw': require('@theia/core/i18n/nls.zh-tw.json'),
    ru: require('@theia/core/i18n/nls.ru.json'),
    tr: require('@theia/core/i18n/nls.tr.json'),
    pl: require('@theia/core/i18n/nls.pl.json'),
    cs: require('@theia/core/i18n/nls.cs.json'),
    hu: require('@theia/core/i18n/nls.hu.json')
};

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

/** Builds translation-key overrides to merge after core localizations for a locale. */
export async function buildQaapBrandingOverlay(languageId: string): Promise<Record<string, string>> {
    if (!isQaapBrandingLocale(languageId)) {
        return {};
    }
    const flat = flattenTranslations(CORE_NLS_BY_LOCALE[languageId]);
    const overlay: Record<string, string> = {};
    for (const [key, value] of Object.entries(flat)) {
        const branded = applyQaapBrandingToText(value, languageId);
        if (branded !== value) {
            overlay[key] = branded;
        }
    }
    return overlay;
}

function isQaapBrandingLocale(languageId: string): languageId is QaapBrandingLocale {
    return (QAAP_BRANDING_LOCALES as readonly string[]).includes(languageId);
}
