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

import * as path from 'path';
import * as fs from '@theia/core/shared/fs-extra';
import { LocalizationProvider } from '@theia/core/lib/node/i18n/localization-provider';
import { Localization } from '@theia/core/lib/common/i18n/localization';
import { inject, injectable } from '@theia/core/shared/inversify';
import { DeployedPlugin, Localization as PluginLocalization, PluginIdentifiers, Translation } from '../../common';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { Disposable, DisposableCollection, isObject, MaybePromise, nls, URI } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { LanguagePackBundle, LanguagePackService } from '../../common/language-pack-service';

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
export class HostedPluginLocalizationService implements BackendApplicationContribution {

    @inject(LocalizationProvider)
    protected readonly localizationProvider: LocalizationProvider;

    @inject(LanguagePackService)
    protected readonly languagePackService: LanguagePackService;

    @inject(EnvVariablesServer)
    protected readonly envVariables: EnvVariablesServer;

    protected localizationDisposeMap = new Map<string, Disposable>();
    protected translationConfigFiles: Map<string, string> = new Map();

    protected readonly _ready = new Deferred();

    /**
     * This promise resolves when the cache has been cleaned up after starting the backend server.
     * Once resolved, the service allows to cache localization files for plugins.
     */
    ready = this._ready.promise;

    initialize(): MaybePromise<void> {
        this.getLocalizationCacheDir()
            .then(cacheDir => fs.emptyDir(cacheDir))
            .then(() => this._ready.resolve());
    }

    async deployLocalizations(plugin: DeployedPlugin): Promise<void> {
        const disposable = new DisposableCollection();
        if (plugin.contributes?.localizations) {
            const localizations = buildLocalizations(plugin.contributes.localizations);
            disposable.push(Disposable.create(() => {
                this.localizationProvider.removeLocalizations(...localizations);
            }));
            this.localizationProvider.addLocalizations(...localizations);
        }
        if (plugin.metadata.model.l10n || plugin.contributes?.localizations) {
            disposable.push(await this.updateLanguagePackBundles(plugin));
        }
        if (!disposable.disposed) {
            const versionedId = PluginIdentifiers.componentsToVersionedId(plugin.metadata.model);
            disposable.push(Disposable.create(() => {
                this.localizationDisposeMap.delete(versionedId);
            }));
            this.localizationDisposeMap.set(versionedId, disposable);
        }
    }

    undeployLocalizations(plugin: PluginIdentifiers.VersionedId): void {
        this.localizationDisposeMap.get(plugin)?.dispose();
    }

    protected async updateLanguagePackBundles(plugin: DeployedPlugin): Promise<Disposable> {
        const disposable = new DisposableCollection();
        const pluginId = plugin.metadata.model.id;
        const packageUri = new URI(plugin.metadata.model.packageUri);
        if (plugin.contributes?.localizations) {
            for (const localization of plugin.contributes.localizations) {
                for (const translation of localization.translations) {
                    const l10n = getL10nTranslation(translation);
                    if (l10n) {
                        const translatedPluginId = translation.id;
                        const translationUri = packageUri.resolve(translation.path);
                        const locale = localization.languageId;
                        // We store a bundle for another extension in here
                        // Hence we use `translatedPluginId` instead of `pluginId`
                        this.languagePackService.storeBundle(translatedPluginId, locale, {
                            contents: processL10nBundle(l10n),
                            uri: translationUri.toString()
                        });
                        disposable.push(Disposable.create(() => {
                            // Only dispose the deleted locale for the specific plugin
                            this.languagePackService.deleteBundle(translatedPluginId, locale);
                        }));
                    }
                }
            }
        }
        if (plugin.metadata.model.l10n) {
            const bundleDirectory = packageUri.resolve(plugin.metadata.model.l10n);
            const bundles = await loadPluginBundles(bundleDirectory);
            if (bundles) {
                for (const [locale, bundle] of Object.entries(bundles)) {
                    this.languagePackService.storeBundle(pluginId, locale, bundle);
                }
                disposable.push(Disposable.create(() => {
                    // Dispose all bundles contributed by the deleted plugin
                    this.languagePackService.deleteBundle(pluginId);
                }));
            }
        }
        return disposable;
    }

    async localizePlugin(plugin: DeployedPlugin): Promise<DeployedPlugin> {
        const currentLanguage = this.localizationProvider.getCurrentLanguage();
        const localization = this.localizationProvider.loadLocalization(currentLanguage);
        const pluginPath = new URI(plugin.metadata.model.packageUri).path.fsPath();
        const pluginId = plugin.metadata.model.id;
        try {
            const translations = await loadPackageTranslations(pluginPath, currentLanguage);
            plugin = localizePackage(plugin, translations, (key, original) => {
                const fullKey = `${pluginId}/package/${key}`;
                return Localization.localize(localization, fullKey, original);
            }) as DeployedPlugin;
        } catch (err) {
            console.error(`Failed to localize plugin '${pluginId}'.`, err);
        }
        return plugin;
    }

    getNlsConfig(): VSCodeNlsConfig {
        const locale = this.localizationProvider.getCurrentLanguage();
        const configFile = this.translationConfigFiles.get(locale);
        if (locale === nls.defaultLocale || !configFile) {
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
        await this.ready;
        const cacheDir = await this.getLocalizationCacheDir();
        const configs = new Map<string, Record<string, string>>();
        for (const plugin of plugins) {
            if (plugin.contributes?.localizations) {
                const pluginPath = new URI(plugin.metadata.model.packageUri).path.fsPath();
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

    protected async getLocalizationCacheDir(): Promise<string> {
        const configDir = new URI(await this.envVariables.getConfigDirUri()).path.fsPath();
        const cacheDir = path.join(configDir, 'localization-cache');
        return cacheDir;
    }
}

// New plugin localization logic using vscode.l10n

function getL10nTranslation(translation: Translation): UnprocessedL10nBundle | undefined {
    // 'bundle' is a special key that contains all translations for the l10n vscode API
    // If that doesn't exist, we can assume that the language pack is using the old vscode-nls API
    return translation.contents.bundle;
}

async function loadPluginBundles(l10nUri: URI): Promise<Record<string, LanguagePackBundle> | undefined> {
    try {
        const directory = l10nUri.path.fsPath();
        const files = await fs.readdir(directory);
        const result: Record<string, LanguagePackBundle> = {};
        await Promise.all(files.map(async fileName => {
            const match = fileName.match(/^bundle\.l10n\.([\w\-]+)\.json$/);
            if (match) {
                const locale = match[1];
                const contents = await fs.readJSON(path.join(directory, fileName));
                result[locale] = {
                    contents,
                    uri: l10nUri.resolve(fileName).toString()
                };
            }
        }));
        return result;
    } catch {
        // The directory either doesn't exist or its contents cannot be parsed
        // In any way we should just safely return undefined
        return undefined;
    }
}

type UnprocessedL10nBundle = Record<string, string | { message: string }>;

function processL10nBundle(bundle: UnprocessedL10nBundle): Record<string, string> {
    const processedBundle: Record<string, string> = {};
    for (const [name, value] of Object.entries(bundle)) {
        const stringValue = typeof value === 'string' ? value : value.message;
        processedBundle[name] = stringValue;
    }
    return processedBundle;
}

// Old plugin localization logic for vscode-nls
// vscode-nls was used until version 1.73 of VSCode to translate extensions

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

// Localization logic for `package.json` entries
// Extensions can use `package.nls.json` files to store translations for values in their package.json
// This logic has not changed with the introduction of the vscode.l10n API

interface PackageTranslation {
    translation?: Record<string, string>
    default?: Record<string, string>
}

async function loadPackageTranslations(pluginPath: string, locale: string): Promise<PackageTranslation> {
    const localizedPluginPath = path.join(pluginPath, `package.nls.${locale}.json`);
    try {
        const defaultValue = coerceLocalizations(await fs.readJson(path.join(pluginPath, 'package.nls.json')));
        if (await fs.pathExists(localizedPluginPath)) {
            return {
                translation: coerceLocalizations(await fs.readJson(localizedPluginPath)),
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

interface LocalizeInfo {
    message: string
    comment?: string
}

function isLocalizeInfo(obj: unknown): obj is LocalizeInfo {
    return isObject(obj) && 'message' in obj || false;
}

function coerceLocalizations(translations: Record<string, string | LocalizeInfo>): Record<string, string> {
    for (const [key, value] of Object.entries(translations)) {
        if (isLocalizeInfo(value)) {
            translations[key] = value.message;
        } else if (typeof value !== 'string') {
            // Only strings or LocalizeInfo values are valid
            translations[key] = 'INVALID TRANSLATION VALUE';
        }
    }
    return translations as Record<string, string>;
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
    if (isObject(value)) {
        const result: Record<string, unknown> = {};
        for (const [name, item] of Object.entries(value)) {
            result[name] = localizePackage(item, translations, callback);
        }
        return result;
    }
    return value;
}
