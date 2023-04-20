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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { FormatType, Localization } from './i18n/localization';

export namespace nls {

    export let localization: Localization | undefined;

    export const defaultLocale = 'en';

    export const localeId = 'localeId';

    export const locale = typeof window === 'object' && window && window.localStorage.getItem(localeId) || undefined;

    let keyProvider: LocalizationKeyProvider | undefined;

    /**
     * Automatically localizes a text if that text also exists in the vscode repository.
     */
    export function localizeByDefault(defaultValue: string, ...args: FormatType[]): string {
        if (localization) {
            const key = getDefaultKey(defaultValue);
            if (key) {
                return localize(key, defaultValue, ...args);
            } else {
                console.warn(`Could not find translation key for default value: "${defaultValue}"`);
            }
        }
        return Localization.format(defaultValue, args);
    }

    export function getDefaultKey(defaultValue: string): string {
        if (!keyProvider) {
            keyProvider = new LocalizationKeyProvider();
        }
        const key = keyProvider.get(defaultValue);
        if (key) {
            return key;
        }
        return '';
    }

    export function localize(key: string, defaultValue: string, ...args: FormatType[]): string {
        return Localization.localize(localization, key, defaultValue, ...args);
    }

    export function isSelectedLocale(id: string): boolean {
        if (locale === undefined && id === defaultLocale) {
            return true;
        }
        return locale === id;
    }

    export function setLocale(id: string): void {
        window.localStorage.setItem(localeId, id);
    }
}

interface NlsKeys {
    [key: string]: (string | NlsInfo)[]
}

interface NlsInfo {
    key: string
    comment: string[]
}

class LocalizationKeyProvider {

    private data = this.buildData();

    get(defaultValue: string): string | undefined {
        const normalized = Localization.normalize(defaultValue);
        return this.data.get(normalized) || this.data.get(normalized.toUpperCase());
    }

    /**
     * Transforms the data coming from the `nls.metadata.json` file into a map.
     * The original data contains arrays of keys and messages.
     * The result is a map that matches each message to the key that belongs to it.
     *
     * This allows us to skip the key in the localization process and map the original english default values to their translations in different languages.
     */
    private buildData(): Map<string, string> {
        const bundles = require('../../src/common/i18n/nls.metadata.json');
        const keys: NlsKeys = bundles.keys;
        const messages: Record<string, string[]> = bundles.messages;
        const data = new Map<string, string>();
        const keysAndMessages = this.buildKeyMessageTuples(keys, messages);
        for (const { key, message } of keysAndMessages) {
            data.set(message, key);
        }
        // Second pass adds each message again in upper case, if the message doesn't already exist in upper case
        // The second pass is needed to not accidentally override any translations which actually use the upper case message
        for (const { key, message } of keysAndMessages) {
            const upperMessage = message.toUpperCase();
            if (!data.has(upperMessage)) {
                data.set(upperMessage, key);
            }
        }
        return data;
    }

    private buildKeyMessageTuples(keys: NlsKeys, messages: Record<string, string[]>): { key: string, message: string }[] {
        const list: { key: string, message: string }[] = [];
        for (const [fileKey, messageBundle] of Object.entries(messages)) {
            const keyBundle = keys[fileKey];
            for (let i = 0; i < messageBundle.length; i++) {
                const message = Localization.normalize(messageBundle[i]);
                const key = keyBundle[i];
                const localizationKey = this.buildKey(typeof key === 'string' ? key : key.key, fileKey);
                list.push({
                    key: localizationKey,
                    message
                });
            }
        }
        return list;
    }

    private buildKey(key: string, filepath: string): string {
        return `vscode/${Localization.transformKey(filepath)}/${key}`;
    }
}
