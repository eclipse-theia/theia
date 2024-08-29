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

import * as chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Localization, sortLocalization } from './common';
import { deepl, DeeplLanguage, DeeplParameters, defaultLanguages, isSupportedLanguage } from './deepl-api';

export interface LocalizationOptions {
    freeApi: Boolean
    authKey: string
    sourceFile: string
    sourceLanguage?: string
    targetLanguages: string[]
}

export type LocalizationFunction = (parameters: DeeplParameters) => Promise<string[]>;

export class LocalizationManager {

    constructor(private localizationFn = deepl) { }

    async localize(options: LocalizationOptions): Promise<boolean> {
        let source: Localization = {};
        const cwd = process.env.INIT_CWD || process.cwd();
        const sourceFile = path.resolve(cwd, options.sourceFile);
        try {
            source = await fs.readJson(sourceFile);
        } catch {
            console.log(chalk.red(`Could not read file "${options.sourceFile}"`));
            process.exit(1);
        }
        const languages: string[] = [];
        for (const targetLanguage of options.targetLanguages) {
            if (!isSupportedLanguage(targetLanguage)) {
                console.log(chalk.yellow(`Language "${targetLanguage}" is not supported for automatic localization`));
            } else {
                languages.push(targetLanguage);
            }
        }
        if (languages.length === 0) {
            // No supported languages were found, default to all supported languages
            console.log('No languages were specified, defaulting to all supported languages for VS Code');
            languages.push(...defaultLanguages);
        }
        const existingTranslations: Map<string, Localization> = new Map();
        for (const targetLanguage of languages) {
            try {
                const targetPath = this.translationFileName(sourceFile, targetLanguage);
                existingTranslations.set(targetLanguage, await fs.readJson(targetPath));
            } catch {
                existingTranslations.set(targetLanguage, {});
            }
        }
        const results = await Promise.all(languages.map(language => this.translateLanguage(source, existingTranslations.get(language)!, language, options)));
        let result = results.reduce((acc, val) => acc && val, true);

        for (const targetLanguage of languages) {
            const targetPath = this.translationFileName(sourceFile, targetLanguage);
            try {
                const translation = existingTranslations.get(targetLanguage)!;
                await fs.writeJson(targetPath, sortLocalization(translation), { spaces: 2 });
            } catch {
                console.error(chalk.red(`Error writing translated file to '${targetPath}'`));
                result = false;
            }
        }
        return result;
    }

    protected translationFileName(original: string, language: string): string {
        const directory = path.dirname(original);
        const fileName = path.basename(original, '.json');
        return path.join(directory, `${fileName}.${language.toLowerCase()}.json`);
    }

    async translateLanguage(source: Localization, target: Localization, targetLanguage: string, options: LocalizationOptions): Promise<boolean> {
        const map = this.buildLocalizationMap(source, target);
        if (map.text.length > 0) {
            try {
                const translationResponse = await this.localizationFn({
                    auth_key: options.authKey,
                    free_api: options.freeApi,
                    target_lang: targetLanguage.toUpperCase() as DeeplLanguage,
                    source_lang: options.sourceLanguage?.toUpperCase() as DeeplLanguage,
                    text: map.text.map(e => this.addIgnoreTags(e)),
                    tag_handling: ['xml'],
                    ignore_tags: ['x']
                });
                translationResponse.translations.forEach(({ text }, i) => {
                    map.localize(i, this.removeIgnoreTags(text));
                });
                console.log(chalk.green(`Successfully translated ${map.text.length} value${map.text.length > 1 ? 's' : ''} for language "${targetLanguage}"`));
                return true;
            } catch (e) {
                console.log(chalk.red(`Could not translate into language "${targetLanguage}"`), e);
                return false;
            }
        } else {
            console.log(`No translation necessary for language "${targetLanguage}"`);
            return true;
        }
    }

    protected addIgnoreTags(text: string): string {
        return text.replace(/(\{\d*\})/g, '<x>$1</x>');
    }

    protected removeIgnoreTags(text: string): string {
        return text.replace(/<x>(\{\d+\})<\/x>/g, '$1');
    }

    protected buildLocalizationMap(source: Localization, target: Localization): LocalizationMap {
        const functionMap = new Map<number, (value: string) => void>();
        const text: string[] = [];
        const process = (s: Localization, t: Localization) => {
            // Delete all extra keys in the target translation first
            for (const key of Object.keys(t)) {
                if (!(key in s)) {
                    delete t[key];
                }
            }
            for (const [key, value] of Object.entries(s)) {
                if (!(key in t)) {
                    if (typeof value === 'string') {
                        functionMap.set(text.length, translation => t[key] = translation);
                        text.push(value);
                    } else {
                        const newLocalization: Localization = {};
                        t[key] = newLocalization;
                        process(value, newLocalization);
                    }
                } else if (typeof value === 'object') {
                    if (typeof t[key] === 'string') {
                        t[key] = {};
                    }
                    process(value, t[key] as Localization);
                }
            }
        };

        process(source, target);

        return {
            text,
            localize: (index, value) => functionMap.get(index)!(value)
        };
    }
}

export interface LocalizationMap {
    text: string[]
    localize: (index: number, value: string) => void
}
