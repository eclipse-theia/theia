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

import * as bent from 'bent';

const post = bent('POST', 'json', 200);
// 50 is the maximum amount of translations per request
const deeplLimit = 50;

export async function deepl(
    parameters: DeeplParameters
): Promise<DeeplResponse> {
    coerceLanguage(parameters);
    const sub_domain = parameters.free_api ? 'api-free' : 'api';
    const textChunks: string[][] = [];
    const textArray = [...parameters.text];
    while (textArray.length > 0) {
        textChunks.push(textArray.splice(0, deeplLimit));
    }
    const responses: DeeplResponse[] = await Promise.all(textChunks.map(chunk => {
        const parameterCopy: DeeplParameters = { ...parameters, text: chunk };
        return post(`https://${sub_domain}.deepl.com/v2/translate`, Buffer.from(toFormData(parameterCopy)), {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Theia-Localization-Manager'
        });
    }));
    const mergedResponse: DeeplResponse = { translations: [] };
    for (const response of responses) {
        mergedResponse.translations.push(...response.translations);
    }
    for (const translation of mergedResponse.translations) {
        translation.text = coerceTranslation(translation.text);
    }
    return mergedResponse;
}

/**
 * Coerces the target language into a form expected by Deepl.
 *
 * Currently only replaces `ZH-CN` with `ZH`
 */
function coerceLanguage(parameters: DeeplParameters): void {
    if (parameters.target_lang === 'ZH-CN') {
        parameters.target_lang = 'ZH-HANS';
    } else if (parameters.target_lang === 'ZH-TW') {
        parameters.target_lang = 'ZH-HANT';
    }
}

/**
 * Coerces translated text into a form expected by VSCode/Theia.
 *
 * Replaces certain full-width characters with their ascii counter-part.
 */
function coerceTranslation(text: string): string {
    return text
        .replace(/\uff08/g, '(')
        .replace(/\uff09/g, ')')
        .replace(/\uff0c/g, ',')
        .replace(/\uff1a/g, ':')
        .replace(/\uff1b/g, ';')
        .replace(/\uff1f/g, '?');
}

function toFormData(parameters: DeeplParameters): string {
    const str: string[] = [];
    for (const [key, value] of Object.entries(parameters)) {
        if (typeof value === 'string') {
            str.push(encodeURIComponent(key) + '=' + encodeURIComponent(value.toString()));
        } else if (Array.isArray(value)) {
            for (const item of value) {
                str.push(encodeURIComponent(key) + '=' + encodeURIComponent(item.toString()));
            }
        }
    }
    return str.join('&');
}

export type DeeplLanguage =
    | 'BG'
    | 'CS'
    | 'DA'
    | 'DE'
    | 'EL'
    | 'EN-GB'
    | 'EN-US'
    | 'EN'
    | 'ES'
    | 'ET'
    | 'FI'
    | 'FR'
    | 'HU'
    | 'ID'
    | 'IT'
    | 'JA'
    | 'KO'
    | 'LT'
    | 'LV'
    | 'NB'
    | 'NL'
    | 'PL'
    | 'PT-PT'
    | 'PT-BR'
    | 'PT'
    | 'RO'
    | 'RU'
    | 'SK'
    | 'SL'
    | 'SV'
    | 'TR'
    | 'UK'
    | 'ZH-CN'
    | 'ZH-TW'
    | 'ZH-HANS'
    | 'ZH-HANT'
    | 'ZH';

export const supportedLanguages = [
    'BG', 'CS', 'DA', 'DE', 'EL', 'EN-GB', 'EN-US', 'EN', 'ES', 'ET', 'FI', 'FR', 'HU', 'ID', 'IT',
    'JA', 'KO', 'LT', 'LV', 'NL', 'PL', 'PT-PT', 'PT-BR', 'PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH-CN', 'ZH-TW'
];

// From https://code.visualstudio.com/docs/getstarted/locales#_available-locales
export const defaultLanguages = [
    'ZH-CN', 'ZH-TW', 'FR', 'DE', 'IT', 'ES', 'JA', 'KO', 'RU', 'PT-BR', 'TR', 'PL', 'CS', 'HU'
] as const;

export function isSupportedLanguage(language: string): language is DeeplLanguage {
    return supportedLanguages.includes(language.toUpperCase());
}

export interface DeeplParameters {
    free_api: Boolean
    auth_key: string
    text: string[]
    source_lang?: DeeplLanguage
    target_lang: DeeplLanguage
    split_sentences?: '0' | '1' | 'nonewlines'
    preserve_formatting?: '0' | '1'
    formality?: 'default' | 'more' | 'less'
    tag_handling?: string[]
    non_splitting_tags?: string[]
    outline_detection?: string
    splitting_tags?: string[]
    ignore_tags?: string[]
}

export interface DeeplResponse {
    translations: DeeplTranslation[]
}

export interface DeeplTranslation {
    detected_source_language: string
    text: string
}
