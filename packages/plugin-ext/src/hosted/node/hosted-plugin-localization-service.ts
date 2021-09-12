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

import * as path from 'path';
import * as fs from '@theia/core/shared/fs-extra';
import { LocalizationProvider } from '@theia/core/lib/node/i18n/localization-provider';
import { Localization } from '@theia/core/lib/common/i18n/localization';
import { inject, injectable } from '@theia/core/shared/inversify';
import { DeployedPlugin, Localization as PluginLocalization, PluginContribution } from '../../common';
import { URI } from '@theia/core/shared/vscode-uri';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';

export interface VSCodeNlsConfig {
    locale: string
    availableLanguages: Record<string, string>
    _languagePackSupport?: boolean
    _languagePackId?: string
    _translationsConfigFile?: string
    _cacheRoot?: string
    _corruptedFile?: string
}

@injectable()
export class HostedPluginLocalizationService {

    @inject(LocalizationProvider)
    protected readonly localizationProvider: LocalizationProvider;

    @inject(EnvVariablesServer)
    protected readonly envVariables: EnvVariablesServer;

    protected translationConfigFiles: Map<string, string> = new Map();

    deployLocalizations(plugin: DeployedPlugin): void {
        if (plugin.contributes?.localizations) {
            this.localizationProvider.addLocalizations(...buildLocalizations(plugin.contributes.localizations));
        }
    }

    async localizePlugin(plugin: DeployedPlugin): Promise<DeployedPlugin> {
        const currentLanguage = this.localizationProvider.getCurrentLanguage();
        const localization = this.localizationProvider.loadLocalization(currentLanguage);
        const pluginPath = URI.parse(plugin.metadata.model.packageUri).fsPath;
        const pluginId = plugin.metadata.model.id;
        // create a shallow copy to not override the original plugin's contributes property.
        const shallowCopy = { ...plugin };
        try {
            const translations = await loadPackageTranslations(pluginPath, currentLanguage);
            shallowCopy.contributes = localizePackage(shallowCopy.contributes, translations, (key, original) => {
                const fullKey = `${pluginId}/package/${key}`;
                return Localization.localize(localization, fullKey, original);
            }) as PluginContribution;
        } catch (err) {
            console.error(`Failed to localize plugin '${pluginId}'.`, err);
        }
        return shallowCopy;
    }

    getNlsConfig(): VSCodeNlsConfig {
        const locale = this.localizationProvider.getCurrentLanguage();
        const configFile = this.translationConfigFiles.get(locale);
        if (locale === 'en' || !configFile) {
            return { locale, availableLanguages: {} };
        }
        const cache = path.dirname(configFile);
        return {
            locale,
            availableLanguages: { '*': locale },
            _languagePackSupport: true,
            _cacheRoot: cache,
            _languagePackId: locale,
            _translationsConfigFile: configFile
        };
    }

    async buildTranslationConfig(plugins: DeployedPlugin[]): Promise<void> {
        const configDir = URI.parse(await this.envVariables.getConfigDirUri()).fsPath;
        const cacheDir = path.join(configDir, 'localization-cache');
        const configs = new Map<string, Record<string, string>>();
        for (const plugin of plugins) {
            if (plugin.contributes?.localizations) {
                const pluginPath = URI.parse(plugin.metadata.model.packageUri).fsPath;
                for (const localization of plugin.contributes.localizations) {
                    const config = configs.get(localization.languageId) || {};
                    for (const translation of localization.translations) {
                        const fullPath = path.join(pluginPath, translation.path);
                        config[translation.id] = fullPath;
                    }
                    configs.set(localization.languageId, config);
                }
            }
        }

        for (const [language, config] of configs.entries()) {
            const languageConfigDir = path.join(cacheDir, language);
            await fs.mkdirs(languageConfigDir);
            const configFile = path.join(languageConfigDir, `nls.config.${language}.json`);
            this.translationConfigFiles.set(language, configFile);
            await fs.writeJson(configFile, config);
        }
    }
}

function buildLocalizations(localizations: PluginLocalization[]): Localization[] {
    const theiaLocalizations: Localization[] = [];
    for (const localization of localizations) {
        const theiaLocalization: Localization = {
            languageId: localization.languageId,
            languageName: localization.languageName,
            localizedLanguageName: localization.localizedLanguageName,
            languagePack: true,
            translations: {}
        };
        for (const translation of localization.translations) {
            for (const [scope, value] of Object.entries(translation.contents)) {
                for (const [key, item] of Object.entries(value)) {
                    const translationKey = buildTranslationKey(translation.id, scope, key);
                    theiaLocalization.translations[translationKey] = item;
                }
            }
        }
        theiaLocalizations.push(theiaLocalization);
    }
    return theiaLocalizations;
}

function buildTranslationKey(pluginId: string, scope: string, key: string): string {
    return `${pluginId}/${Localization.transformKey(scope)}/${key}`;
}

interface PackageTranslation {
    translation?: Record<string, string>
    default?: Record<string, string>
}

async function loadPackageTranslations(pluginPath: string, locale: string): Promise<PackageTranslation> {
    const localizedPluginPath = path.join(pluginPath, `package.nls.${locale}.json`);
    try {
        const defaultValue = await fs.readJson(path.join(pluginPath, 'package.nls.json'));
        if (await fs.pathExists(localizedPluginPath)) {
            return {
                translation: await fs.readJson(localizedPluginPath),
                default: defaultValue
            };
        }
        return {
            default: defaultValue
        };
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e;
        }
        return {};
    }
}

const NLS_REGEX = /^%([\w\d.-]+)%$/i;

function localizePackage(value: unknown, translations: PackageTranslation, callback: (key: string, defaultValue: string) => string): unknown {
    if (typeof value === 'string') {
        const match = NLS_REGEX.exec(value);
        let result = value;
        if (match) {
            const key = match[1];
            if (translations.translation) {
                result = translations.translation[key];
            } else if (translations.default) {
                result = callback(key, translations.default[key]);
            }
        }
        return result;
    }
    if (Array.isArray(value)) {
        const result = [];
        for (const item of value) {
            result.push(localizePackage(item, translations, callback));
        }
        return result;
    }
    if (typeof value === 'object' && value) {
        const result: Record<string, unknown> = {};
        for (const [name, item] of Object.entries(value)) {
            result[name] = localizePackage(item, translations, callback);
        }
        return result;
    }
    return value;
}
