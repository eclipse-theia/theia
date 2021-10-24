/********************************************************************************
 * Copyright (C) 2021 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

export const localizationPath = '/services/i18n';

export const AsyncLocalizationProvider = Symbol('AsyncLocalizationProvider');
export interface AsyncLocalizationProvider {
    getCurrentLanguage(): Promise<string>
    setCurrentLanguage(languageId: string): Promise<void>
    getAvailableLanguages(): Promise<string[]>
    loadLocalization(languageId: string): Promise<Localization>
}

export interface Localization {
    languageId: string;
    languageName?: string;
    languagePack?: boolean;
    localizedLanguageName?: string;
    translations: { [key: string]: string };
}

export type FormatType = string | number | boolean | undefined;

export namespace Localization {

    export function format(message: string, args: FormatType[]): string {
        let result = message;
        if (args.length > 0) {
            result = message.replace(/\{(\d+)\}/g, (match, rest) => {
                const index = rest[0];
                const arg = args[index];
                let replacement = match;
                if (typeof arg === 'string') {
                    replacement = arg;
                } else if (typeof arg === 'number' || typeof arg === 'boolean' || !arg) {
                    replacement = String(arg);
                }
                return replacement;
            });
        }
        return result;
    }

    export function localize(localization: Localization | undefined, key: string, defaultValue: string, ...args: FormatType[]): string {
        let value = defaultValue;
        if (localization) {
            const translation = localization.translations[key];
            if (translation) {
                value = normalize(translation);
            }
        }
        return format(value, args);
    }

    /**
     * This function normalizes values from VSCode's localizations, which often contain additional mnemonics (`&&`).
     * The normalization removes the mnemonics from the input string.
     *
     * @param value Localization value coming from VSCode
     * @returns A normalized localized value
     */
    export function normalize(value: string): string {
        return value.replace(/&&/g, '');
    }

    export function transformKey(key: string): string {
        let nlsKey = key;
        const keySlashIndex = key.lastIndexOf('/');
        if (keySlashIndex >= 0) {
            nlsKey = key.substring(keySlashIndex + 1);
        }
        return nlsKey;
    }
}
