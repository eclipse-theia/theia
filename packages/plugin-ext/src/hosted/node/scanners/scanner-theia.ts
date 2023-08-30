// *****************************************************************************
// Copyright (C) 2015-2021 Red Hat, Inc.
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

/* eslint-disable @theia/localization-check */

import { inject, injectable } from '@theia/core/shared/inversify';
import {
    AutoClosingPair,
    AutoClosingPairConditional,
    buildFrontendModuleName,
    DebuggerContribution,
    IconThemeContribution,
    IconUrl,
    Keybinding,
    LanguageConfiguration,
    LanguageContribution,
    Menu,
    PluginCommand,
    PluginContribution,
    PluginEngine,
    PluginLifecycle,
    PluginModel,
    PluginPackage,
    PluginPackageCommand,
    PluginPackageDebuggersContribution,
    PluginPackageKeybinding,
    PluginPackageLanguageContribution,
    PluginPackageLanguageContributionConfiguration,
    PluginPackageMenu,
    PluginPackageSubmenu,
    PluginPackageView,
    PluginPackageViewContainer,
    PluginPackageViewWelcome,
    PluginScanner,
    PluginTaskDefinitionContribution,
    SnippetContribution,
    Submenu,
    ThemeContribution,
    View,
    ViewContainer,
    ViewWelcome,
    PluginPackageCustomEditor,
    CustomEditor,
    CustomEditorPriority,
    PluginPackageLocalization,
    Localization,
    PluginPackageTranslation,
    Translation,
    PluginIdentifiers,
    TerminalProfile
} from '../../../common/plugin-protocol';
import { promises as fs } from 'fs';
import * as path from 'path';
import { isObject, isStringArray, RecursivePartial } from '@theia/core/lib/common/types';
import { GrammarsReader } from './grammars-reader';
import { CharacterPair } from '../../../common/plugin-api-rpc';
import { isENOENT } from '../../../common/errors';
import * as jsoncparser from 'jsonc-parser';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import { deepClone } from '@theia/core/lib/common/objects';
import { PreferenceSchema, PreferenceSchemaProperties } from '@theia/core/lib/common/preferences/preference-schema';
import { TaskDefinition } from '@theia/task/lib/common/task-protocol';
import { ColorDefinition } from '@theia/core/lib/common/color';
import { PluginUriFactory } from './plugin-uri-factory';

namespace nls {
    export function localize(key: string, _default: string): string {
        return _default;
    }
}

const INTERNAL_CONSOLE_OPTIONS_SCHEMA = {
    enum: ['neverOpen', 'openOnSessionStart', 'openOnFirstSessionStart'],
    default: 'openOnFirstSessionStart',
    description: nls.localize('internalConsoleOptions', 'Controls when the internal debug console should open.')
};

const colorIdPattern = '^\\w+[.\\w+]*$';

@injectable()
export class TheiaPluginScanner implements PluginScanner {

    private readonly _apiType: PluginEngine = 'theiaPlugin';

    @inject(GrammarsReader)
    private readonly grammarsReader: GrammarsReader;

    @inject(PluginUriFactory)
    protected readonly pluginUriFactory: PluginUriFactory;

    get apiType(): PluginEngine {
        return this._apiType;
    }

    getModel(plugin: PluginPackage): PluginModel {
        const publisher = plugin.publisher ?? PluginIdentifiers.UNPUBLISHED;
        const result: PluginModel = {
            packagePath: plugin.packagePath,
            packageUri: this.pluginUriFactory.createUri(plugin).toString(),
            // see id definition: https://github.com/microsoft/vscode/blob/15916055fe0cb9411a5f36119b3b012458fe0a1d/src/vs/platform/extensions/common/extensions.ts#L167-L169
            id: `${publisher.toLowerCase()}.${plugin.name.toLowerCase()}`,
            name: plugin.name,
            publisher,
            version: plugin.version,
            displayName: plugin.displayName,
            description: plugin.description,
            l10n: plugin.l10n,
            engine: {
                type: this._apiType,
                version: plugin.engines[this._apiType]
            },
            entryPoint: {
                frontend: plugin.theiaPlugin!.frontend,
                backend: plugin.theiaPlugin!.backend
            }
        };
        return result;
    }

    getLifecycle(plugin: PluginPackage): PluginLifecycle {
        return {
            startMethod: 'start',
            stopMethod: 'stop',
            frontendModuleName: buildFrontendModuleName(plugin),

            backendInitPath: path.join(__dirname, 'backend-init-theia')
        };
    }

    getDependencies(rawPlugin: PluginPackage): Map<string, string> | undefined {
        // skip it since there is no way to load transitive dependencies for Theia plugins yet
        return undefined;
    }

    async getContribution(rawPlugin: PluginPackage): Promise<PluginContribution | undefined> {
        if (!rawPlugin.contributes && !rawPlugin.activationEvents) {
            return undefined;
        }

        const contributions: PluginContribution = {
            activationEvents: rawPlugin.activationEvents
        };

        if (!rawPlugin.contributes) {
            return contributions;
        }

        try {
            if (rawPlugin.contributes.configuration) {
                const configurations = Array.isArray(rawPlugin.contributes.configuration) ? rawPlugin.contributes.configuration : [rawPlugin.contributes.configuration];
                contributions.configuration = [];
                for (const c of configurations) {
                    const config = this.readConfiguration(c, rawPlugin.packagePath);
                    if (config) {
                        contributions.configuration.push(config);
                    }
                }
            }
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'configuration'.`, rawPlugin.contributes.configuration, err);
        }

        const configurationDefaults = rawPlugin.contributes.configurationDefaults;
        contributions.configurationDefaults = PreferenceSchemaProperties.is(configurationDefaults) ? configurationDefaults : undefined;

        try {
            if (rawPlugin.contributes.submenus) {
                contributions.submenus = this.readSubmenus(rawPlugin.contributes.submenus, rawPlugin);
            }
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'submenus'.`, rawPlugin.contributes.submenus, err);
        }

        try {
            if (rawPlugin.contributes.customEditors) {
                const customEditors = this.readCustomEditors(rawPlugin.contributes.customEditors);
                contributions.customEditors = customEditors;
            }
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'customEditors'.`, rawPlugin.contributes.customEditors, err);
        }

        try {
            if (rawPlugin.contributes.viewsContainers) {
                const viewsContainers = rawPlugin.contributes.viewsContainers;
                contributions.viewsContainers = {};

                for (const location of Object.keys(viewsContainers)) {
                    const containers = this.readViewsContainers(viewsContainers[location], rawPlugin);
                    const loc = location === 'activitybar' ? 'left' : location === 'panel' ? 'bottom' : location;
                    if (contributions.viewsContainers[loc]) {
                        contributions.viewsContainers[loc] = contributions.viewsContainers[loc].concat(containers);
                    } else {
                        contributions.viewsContainers[loc] = containers;
                    }
                }
            }
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'viewsContainers'.`, rawPlugin.contributes.viewsContainers, err);
        }

        try {
            if (rawPlugin.contributes.views) {
                contributions.views = {};

                for (const location of Object.keys(rawPlugin.contributes.views)) {
                    const views = this.readViews(rawPlugin.contributes.views[location]);
                    contributions.views[location] = views;
                }
            }
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'views'.`, rawPlugin.contributes.views, err);
        }

        try {
            if (rawPlugin.contributes.viewsWelcome) {
                contributions.viewsWelcome = this.readViewsWelcome(rawPlugin.contributes!.viewsWelcome, rawPlugin.contributes.views);
            }
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'viewsWelcome'.`, rawPlugin.contributes.viewsWelcome, err);
        }

        try {
            const pluginCommands = rawPlugin.contributes.commands;
            if (pluginCommands) {
                const commands = Array.isArray(pluginCommands) ? pluginCommands : [pluginCommands];
                contributions.commands = commands.map(command => this.readCommand(command, rawPlugin));
            }
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'commands'.`, rawPlugin.contributes!.commands, err);
        }

        try {
            if (rawPlugin.contributes.menus) {
                contributions.menus = {};

                for (const location of Object.keys(rawPlugin.contributes.menus)) {
                    const menus = this.readMenus(rawPlugin.contributes.menus[location]);
                    contributions.menus[location] = menus;
                }
            }
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'menus'.`, rawPlugin.contributes.menus, err);
        }

        try {
            if (rawPlugin.contributes.keybindings) {
                const rawKeybindings = Array.isArray(rawPlugin.contributes.keybindings) ? rawPlugin.contributes.keybindings : [rawPlugin.contributes.keybindings];
                contributions.keybindings = rawKeybindings.map(rawKeybinding => this.readKeybinding(rawKeybinding));
            }
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'keybindings'.`, rawPlugin.contributes.keybindings, err);
        }

        try {
            if (rawPlugin.contributes.debuggers) {
                const debuggers = this.readDebuggers(rawPlugin.contributes.debuggers);
                contributions.debuggers = debuggers;
            }
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'debuggers'.`, rawPlugin.contributes.debuggers, err);
        }

        try {
            if (rawPlugin.contributes.taskDefinitions) {
                const definitions = rawPlugin.contributes.taskDefinitions!;
                contributions.taskDefinitions = definitions.map(definitionContribution => this.readTaskDefinition(rawPlugin.name, definitionContribution));
            }
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'taskDefinitions'.`, rawPlugin.contributes.taskDefinitions, err);
        }

        try {
            contributions.problemMatchers = rawPlugin.contributes.problemMatchers;
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'problemMatchers'.`, rawPlugin.contributes.problemMatchers, err);
        }

        try {
            contributions.problemPatterns = rawPlugin.contributes.problemPatterns;
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'problemPatterns'.`, rawPlugin.contributes.problemPatterns, err);
        }

        try {
            contributions.resourceLabelFormatters = rawPlugin.contributes.resourceLabelFormatters;
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'resourceLabelFormatters'.`, rawPlugin.contributes.resourceLabelFormatters, err);
        }

        try {
            contributions.authentication = rawPlugin.contributes.authentication;
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'authentication'.`, rawPlugin.contributes.authentication, err);
        }

        try {
            contributions.notebooks = rawPlugin.contributes.notebooks;
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'notebooks'.`, rawPlugin.contributes.authentication, err);
        }

        try {
            contributions.snippets = this.readSnippets(rawPlugin);
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'snippets'.`, rawPlugin.contributes!.snippets, err);
        }

        try {
            contributions.themes = this.readThemes(rawPlugin);
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'themes'.`, rawPlugin.contributes.themes, err);
        }

        try {
            contributions.iconThemes = this.readIconThemes(rawPlugin);
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'iconThemes'.`, rawPlugin.contributes.iconThemes, err);
        }

        try {
            contributions.colors = this.readColors(rawPlugin);
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'colors'.`, rawPlugin.contributes.colors, err);
        }

        try {
            contributions.terminalProfiles = this.readTerminals(rawPlugin);
        } catch (err) {
            console.error(`Could not read '${rawPlugin.name}' contribution 'terminals'.`, rawPlugin.contributes.terminal, err);
        }

        const [localizationsResult, languagesResult, grammarsResult] = await Promise.allSettled([
            this.readLocalizations(rawPlugin),
            rawPlugin.contributes.languages ? this.readLanguages(rawPlugin.contributes.languages, rawPlugin.packagePath) : undefined,
            rawPlugin.contributes.grammars ? this.grammarsReader.readGrammars(rawPlugin.contributes.grammars, rawPlugin.packagePath) : undefined
        ]);

        if (localizationsResult.status === 'fulfilled') {
            contributions.localizations = localizationsResult.value;
        } else {
            console.error(`Could not read '${rawPlugin.name}' contribution 'localizations'.`, rawPlugin.contributes.localizations, localizationsResult.reason);
        }

        if (rawPlugin.contributes.languages) {
            if (languagesResult.status === 'fulfilled') {
                contributions.languages = languagesResult.value;
            } else {
                console.error(`Could not read '${rawPlugin.name}' contribution 'languages'.`, rawPlugin.contributes.languages, languagesResult.reason);
            }
        }

        if (rawPlugin.contributes.grammars) {
            if (grammarsResult.status === 'fulfilled') {
                contributions.grammars = grammarsResult.value;
            } else {
                console.error(`Could not read '${rawPlugin.name}' contribution 'grammars'.`, rawPlugin.contributes.grammars, grammarsResult.reason);
            }
        }

        return contributions;
    }

    protected readTerminals(pck: PluginPackage): TerminalProfile[] | undefined {
        if (!pck?.contributes?.terminal?.profiles) {
            return undefined;
        }
        return pck.contributes.terminal.profiles.filter(profile => profile.id && profile.title);
    }

    protected async readLocalizations(pck: PluginPackage): Promise<Localization[] | undefined> {
        if (!pck.contributes || !pck.contributes.localizations) {
            return undefined;
        }
        return Promise.all(pck.contributes.localizations.map(e => this.readLocalization(e, pck.packagePath)));
    }

    protected async readLocalization({ languageId, languageName, localizedLanguageName, translations }: PluginPackageLocalization, pluginPath: string): Promise<Localization> {
        const local: Localization = {
            languageId,
            languageName,
            localizedLanguageName,
            translations: []
        };
        local.translations = await Promise.all(translations.map(e => this.readTranslation(e, pluginPath)));
        return local;
    }

    protected async readTranslation(packageTranslation: PluginPackageTranslation, pluginPath: string): Promise<Translation> {
        const translation = await this.readJson<Translation>(path.resolve(pluginPath, packageTranslation.path));
        if (!translation) {
            throw new Error(`Could not read json file '${packageTranslation.path}'.`);
        }
        translation.id = packageTranslation.id;
        translation.path = packageTranslation.path;
        return translation;
    }

    protected readCommand({ command, title, original, category, icon, enablement }: PluginPackageCommand, pck: PluginPackage): PluginCommand {
        const { themeIcon, iconUrl } = this.transformIconUrl(pck, icon) ?? {};
        return { command, title, originalTitle: original, category, iconUrl, themeIcon, enablement };
    }

    protected transformIconUrl(plugin: PluginPackage, original?: IconUrl): { iconUrl?: IconUrl; themeIcon?: string } | undefined {
        if (original) {
            if (typeof original === 'string') {
                if (original.startsWith('$(')) {
                    return { themeIcon: original };
                } else {
                    return { iconUrl: this.toPluginUrl(plugin, original) };
                }
            } else {
                return {
                    iconUrl: {
                        light: this.toPluginUrl(plugin, original.light),
                        dark: this.toPluginUrl(plugin, original.dark)
                    }
                };
            }
        }
    }

    protected toPluginUrl(pck: PluginPackage, relativePath: string): string {
        return PluginPackage.toPluginUrl(pck, relativePath);
    }

    protected readColors(pck: PluginPackage): ColorDefinition[] | undefined {
        if (!pck.contributes || !pck.contributes.colors) {
            return undefined;
        }
        const result: ColorDefinition[] = [];
        for (const contribution of pck.contributes.colors) {
            if (typeof contribution.id !== 'string' || contribution.id.length === 0) {
                console.error("'configuration.colors.id' must be defined and can not be empty");
                continue;
            }
            if (!contribution.id.match(colorIdPattern)) {
                console.error("'configuration.colors.id' must follow the word[.word]*");
                continue;
            }
            if (typeof contribution.description !== 'string' || contribution.id.length === 0) {
                console.error("'configuration.colors.description' must be defined and can not be empty");
                continue;
            }
            const defaults = contribution.defaults;
            if (!defaults || typeof defaults !== 'object' || typeof defaults.light !== 'string' || typeof defaults.dark !== 'string' || typeof defaults.highContrast !== 'string') {
                console.error("'configuration.colors.defaults' must be defined and must contain 'light', 'dark' and 'highContrast'");
                continue;
            }
            result.push({
                id: contribution.id,
                description: contribution.description,
                defaults: {
                    light: defaults.light,
                    dark: defaults.dark,
                    hc: defaults.highContrast
                }
            });
        }
        return result;
    }

    protected readThemes(pck: PluginPackage): ThemeContribution[] | undefined {
        if (!pck.contributes || !pck.contributes.themes) {
            return undefined;
        }
        const result: ThemeContribution[] = [];
        for (const contribution of pck.contributes.themes) {
            if (contribution.path) {
                result.push({
                    id: contribution.id,
                    uri: this.pluginUriFactory.createUri(pck, contribution.path).toString(),
                    description: contribution.description,
                    label: contribution.label,
                    uiTheme: contribution.uiTheme
                });
            }
        }
        return result;
    }

    protected readIconThemes(pck: PluginPackage): IconThemeContribution[] | undefined {
        if (!pck.contributes || !pck.contributes.iconThemes) {
            return undefined;
        }
        const result: IconThemeContribution[] = [];
        for (const contribution of pck.contributes.iconThemes) {
            if (typeof contribution.id !== 'string') {
                console.error('Expected string in `contributes.iconThemes.id`. Provided value:', contribution.id);
                continue;
            }
            if (typeof contribution.path !== 'string') {
                console.error('Expected string in `contributes.iconThemes.path`. Provided value:', contribution.path);
                continue;
            }
            result.push({
                id: contribution.id,
                uri: this.pluginUriFactory.createUri(pck, contribution.path).toString(),
                description: contribution.description,
                label: contribution.label,
                uiTheme: contribution.uiTheme
            });
        }
        return result;
    }

    protected readSnippets(pck: PluginPackage): SnippetContribution[] | undefined {
        if (!pck.contributes || !pck.contributes.snippets) {
            return undefined;
        }
        const result: SnippetContribution[] = [];
        for (const contribution of pck.contributes.snippets) {
            if (contribution.path) {
                result.push({
                    language: contribution.language,
                    source: pck.displayName || pck.name,
                    uri: this.pluginUriFactory.createUri(pck, contribution.path).toString()
                });
            }
        }
        return result;
    }

    protected async readJson<T>(filePath: string): Promise<T | undefined> {
        const content = await this.readFile(filePath);
        return content ? jsoncparser.parse(content, undefined, { disallowComments: false }) : undefined;
    }
    protected async readFile(filePath: string): Promise<string> {
        try {
            const content = await fs.readFile(filePath, { encoding: 'utf8' });
            return content;
        } catch (e) {
            if (!isENOENT(e)) {
                console.error(e);
            }
            return '';
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readConfiguration(rawConfiguration: RecursivePartial<PreferenceSchema>, pluginPath: string): PreferenceSchema | undefined {
        return PreferenceSchema.is(rawConfiguration) ? rawConfiguration : undefined;
    }

    private readKeybinding(rawKeybinding: PluginPackageKeybinding): Keybinding {
        return {
            keybinding: rawKeybinding.key,
            command: rawKeybinding.command,
            when: rawKeybinding.when,
            mac: rawKeybinding.mac,
            linux: rawKeybinding.linux,
            win: rawKeybinding.win,
            args: rawKeybinding.args
        };
    }

    private readCustomEditors(rawCustomEditors: PluginPackageCustomEditor[]): CustomEditor[] {
        return rawCustomEditors.map(rawCustomEditor => this.readCustomEditor(rawCustomEditor));
    }

    private readCustomEditor(rawCustomEditor: PluginPackageCustomEditor): CustomEditor {
        return {
            viewType: rawCustomEditor.viewType,
            displayName: rawCustomEditor.displayName,
            selector: rawCustomEditor.selector || [],
            priority: rawCustomEditor.priority || CustomEditorPriority.default
        };
    }

    private readViewsContainers(rawViewsContainers: PluginPackageViewContainer[], pck: PluginPackage): ViewContainer[] {
        return rawViewsContainers.map(rawViewContainer => this.readViewContainer(rawViewContainer, pck));
    }

    private readViewContainer(rawViewContainer: PluginPackageViewContainer, pck: PluginPackage): ViewContainer {
        const themeIcon = rawViewContainer.icon.startsWith('$(') ? rawViewContainer.icon : undefined;
        const iconUrl = this.toPluginUrl(pck, rawViewContainer.icon);
        return {
            id: rawViewContainer.id,
            title: rawViewContainer.title,
            iconUrl,
            themeIcon,
        };
    }

    private readViews(rawViews: PluginPackageView[]): View[] {
        return rawViews.map(rawView => this.readView(rawView));
    }

    private readView(rawView: PluginPackageView): View {
        const result: View = {
            id: rawView.id,
            name: rawView.name,
            when: rawView.when,
            type: rawView.type
        };

        return result;
    }

    private readViewsWelcome(rawViewsWelcome: PluginPackageViewWelcome[], rowViews: { [location: string]: PluginPackageView[]; } | undefined): ViewWelcome[] {
        return rawViewsWelcome.map(rawViewWelcome => this.readViewWelcome(rawViewWelcome, this.extractPluginViewsIds(rowViews)));
    }

    private readViewWelcome(rawViewWelcome: PluginPackageViewWelcome, pluginViewsIds: string[]): ViewWelcome {
        const result: ViewWelcome = {
            view: rawViewWelcome.view,
            content: rawViewWelcome.contents,
            when: rawViewWelcome.when,
            // if the plugin contributes Welcome view to its own view - it will be ordered first
            order: pluginViewsIds.findIndex(v => v === rawViewWelcome.view) > -1 ? 0 : 1
        };

        return result;
    }

    private extractPluginViewsIds(views: { [location: string]: PluginPackageView[] } | undefined): string[] {
        const pluginViewsIds: string[] = [];
        if (views) {
            for (const location of Object.keys(views)) {
                const viewsIds = views[location].map(view => view.id);
                pluginViewsIds.push(...viewsIds);
            };
        }
        return pluginViewsIds;
    }

    private readMenus(rawMenus: PluginPackageMenu[]): Menu[] {
        return rawMenus.map(rawMenu => this.readMenu(rawMenu));
    }

    private readMenu(rawMenu: PluginPackageMenu): Menu {
        const result: Menu = {
            command: rawMenu.command,
            submenu: rawMenu.submenu,
            alt: rawMenu.alt,
            group: rawMenu.group,
            when: rawMenu.when
        };
        return result;
    }

    private async readLanguages(rawLanguages: PluginPackageLanguageContribution[], pluginPath: string): Promise<LanguageContribution[]> {
        return Promise.all(rawLanguages.map(language => this.readLanguage(language, pluginPath)));
    }

    private readSubmenus(rawSubmenus: PluginPackageSubmenu[], plugin: PluginPackage): Submenu[] {
        return rawSubmenus.map(submenu => this.readSubmenu(submenu, plugin));
    }

    private readSubmenu(rawSubmenu: PluginPackageSubmenu, plugin: PluginPackage): Submenu {
        const icon = this.transformIconUrl(plugin, rawSubmenu.icon);
        return {
            icon: icon?.iconUrl ?? icon?.themeIcon,
            id: rawSubmenu.id,
            label: rawSubmenu.label
        };

    }

    private async readLanguage(rawLang: PluginPackageLanguageContribution, pluginPath: string): Promise<LanguageContribution> {
        // TODO: add validation to all parameters
        const result: LanguageContribution = {
            id: rawLang.id,
            aliases: rawLang.aliases,
            extensions: rawLang.extensions,
            filenamePatterns: rawLang.filenamePatterns,
            filenames: rawLang.filenames,
            firstLine: rawLang.firstLine,
            mimetypes: rawLang.mimetypes
        };
        if (rawLang.configuration) {
            const rawConfiguration = await this.readJson<PluginPackageLanguageContributionConfiguration>(path.resolve(pluginPath, rawLang.configuration));
            if (rawConfiguration) {
                const configuration: LanguageConfiguration = {
                    brackets: rawConfiguration.brackets,
                    comments: rawConfiguration.comments,
                    folding: rawConfiguration.folding,
                    wordPattern: rawConfiguration.wordPattern,
                    autoClosingPairs: this.extractValidAutoClosingPairs(rawLang.id, rawConfiguration),
                    indentationRules: rawConfiguration.indentationRules,
                    surroundingPairs: this.extractValidSurroundingPairs(rawLang.id, rawConfiguration),
                    onEnterRules: rawConfiguration.onEnterRules,
                };
                result.configuration = configuration;
            }
        }
        return result;

    }

    private readDebuggers(rawDebuggers: PluginPackageDebuggersContribution[]): DebuggerContribution[] {
        return rawDebuggers.map(rawDebug => this.readDebugger(rawDebug));
    }

    private readDebugger(rawDebugger: PluginPackageDebuggersContribution): DebuggerContribution {
        const result: DebuggerContribution = {
            type: rawDebugger.type,
            label: rawDebugger.label,
            languages: rawDebugger.languages,
            enableBreakpointsFor: rawDebugger.enableBreakpointsFor,
            variables: rawDebugger.variables,
            adapterExecutableCommand: rawDebugger.adapterExecutableCommand,
            configurationSnippets: rawDebugger.configurationSnippets,
            win: rawDebugger.win,
            winx86: rawDebugger.winx86,
            windows: rawDebugger.windows,
            osx: rawDebugger.osx,
            linux: rawDebugger.linux,
            program: rawDebugger.program,
            args: rawDebugger.args,
            runtime: rawDebugger.runtime,
            runtimeArgs: rawDebugger.runtimeArgs
        };

        result.configurationAttributes = rawDebugger.configurationAttributes
            && this.resolveSchemaAttributes(rawDebugger.type, rawDebugger.configurationAttributes);

        return result;
    }

    private readTaskDefinition(pluginName: string, definitionContribution: PluginTaskDefinitionContribution): TaskDefinition {
        const propertyKeys = definitionContribution.properties ? Object.keys(definitionContribution.properties) : [];
        const schema = this.toSchema(definitionContribution);
        return {
            taskType: definitionContribution.type,
            source: pluginName,
            properties: {
                required: definitionContribution.required || [],
                all: propertyKeys,
                schema
            }
        };
    }

    protected toSchema(definition: PluginTaskDefinitionContribution): IJSONSchema {
        const reconciliation: IJSONSchema = { ...definition, type: 'object' };
        const schema = deepClone(reconciliation);
        if (schema.properties === undefined) {
            schema.properties = Object.create(null);
        }
        schema.type = 'object';
        schema.properties!.type = { type: 'string', const: definition.type };
        return schema;
    }

    protected resolveSchemaAttributes(type: string, configurationAttributes: { [request: string]: IJSONSchema }): IJSONSchema[] {
        const taskSchema = {};
        return Object.keys(configurationAttributes).map(request => {
            const attributes: IJSONSchema = deepClone(configurationAttributes[request]);
            const defaultRequired = ['name', 'type', 'request'];
            attributes.required = attributes.required && attributes.required.length ? defaultRequired.concat(attributes.required) : defaultRequired;
            attributes.additionalProperties = false;
            attributes.type = 'object';
            if (!attributes.properties) {
                attributes.properties = {};
            }
            const properties = attributes.properties;
            properties['type'] = {
                enum: [type],
                description: nls.localize('debugType', 'Type of configuration.'),
                pattern: '^(?!node2)',
                errorMessage: nls.localize('debugTypeNotRecognised',
                    'The debug type is not recognized. Make sure that you have a corresponding debug extension installed and that it is enabled.'),
                patternErrorMessage: nls.localize('node2NotSupported',
                    '"node2" is no longer supported, use "node" instead and set the "protocol" attribute to "inspector".')
            };
            properties['name'] = {
                type: 'string',
                description: nls.localize('debugName', 'Name of configuration; appears in the launch configuration drop down menu.'),
                default: 'Launch'
            };
            properties['request'] = {
                enum: [request],
                description: nls.localize('debugRequest', 'Request type of configuration. Can be "launch" or "attach".'),
            };
            properties['debugServer'] = {
                type: 'number',
                description: nls.localize('debugServer',
                    'For debug extension development only: if a port is specified VS Code tries to connect to a debug adapter running in server mode'),
                default: 4711
            };
            properties['preLaunchTask'] = {
                anyOf: [taskSchema, {
                    type: ['string'],
                }],
                default: '',
                description: nls.localize('debugPrelaunchTask', 'Task to run before debug session starts.')
            };
            properties['postDebugTask'] = {
                anyOf: [taskSchema, {
                    type: ['string'],
                }],
                default: '',
                description: nls.localize('debugPostDebugTask', 'Task to run after debug session ends.')
            };
            properties['internalConsoleOptions'] = INTERNAL_CONSOLE_OPTIONS_SCHEMA;

            const osProperties = Object.assign({}, properties);
            properties['windows'] = {
                type: 'object',
                description: nls.localize('debugWindowsConfiguration', 'Windows specific launch configuration attributes.'),
                properties: osProperties
            };
            properties['osx'] = {
                type: 'object',
                description: nls.localize('debugOSXConfiguration', 'OS X specific launch configuration attributes.'),
                properties: osProperties
            };
            properties['linux'] = {
                type: 'object',
                description: nls.localize('debugLinuxConfiguration', 'Linux specific launch configuration attributes.'),
                properties: osProperties
            };
            Object.keys(attributes.properties).forEach(name => {
                // Use schema allOf property to get independent error reporting #21113
                attributes!.properties![name].pattern = attributes!.properties![name].pattern || '^(?!.*\\$\\{(env|config|command)\\.)';
                attributes!.properties![name].patternErrorMessage = attributes!.properties![name].patternErrorMessage ||
                    nls.localize('deprecatedVariables', "'env.', 'config.' and 'command.' are deprecated, use 'env:', 'config:' and 'command:' instead.");
            });

            return attributes;
        });
    }

    private extractValidAutoClosingPairs(langId: string, configuration: PluginPackageLanguageContributionConfiguration): AutoClosingPairConditional[] | undefined {
        const source = configuration.autoClosingPairs;
        if (typeof source === 'undefined') {
            return undefined;
        }
        if (!Array.isArray(source)) {
            console.warn(`[${langId}]: language configuration: expected \`autoClosingPairs\` to be an array.`);
            return undefined;
        }

        let result: AutoClosingPairConditional[] | undefined = undefined;
        for (let i = 0, len = source.length; i < len; i++) {
            const pair = source[i];
            if (Array.isArray(pair)) {
                if (!isCharacterPair(pair)) {
                    console.warn(`[${langId}]: language configuration: expected \`autoClosingPairs[${i}]\` to be an array of two strings or an object.`);
                    continue;
                }
                result = result || [];
                result.push({ open: pair[0], close: pair[1] });
            } else {
                if (!isObject(pair)) {
                    console.warn(`[${langId}]: language configuration: expected \`autoClosingPairs[${i}]\` to be an array of two strings or an object.`);
                    continue;
                }
                if (typeof pair.open !== 'string') {
                    console.warn(`[${langId}]: language configuration: expected \`autoClosingPairs[${i}].open\` to be a string.`);
                    continue;
                }
                if (typeof pair.close !== 'string') {
                    console.warn(`[${langId}]: language configuration: expected \`autoClosingPairs[${i}].close\` to be a string.`);
                    continue;
                }
                if (typeof pair.notIn !== 'undefined') {
                    if (!isStringArray(pair.notIn)) {
                        console.warn(`[${langId}]: language configuration: expected \`autoClosingPairs[${i}].notIn\` to be a string array.`);
                        continue;
                    }
                }
                result = result || [];
                result.push({ open: pair.open, close: pair.close, notIn: pair.notIn });
            }
        }
        return result;
    }

    private extractValidSurroundingPairs(langId: string, configuration: PluginPackageLanguageContributionConfiguration): AutoClosingPair[] | undefined {
        const source = configuration.surroundingPairs;
        if (typeof source === 'undefined') {
            return undefined;
        }
        if (!Array.isArray(source)) {
            console.warn(`[${langId}]: language configuration: expected \`surroundingPairs\` to be an array.`);
            return undefined;
        }

        let result: AutoClosingPair[] | undefined = undefined;
        for (let i = 0, len = source.length; i < len; i++) {
            const pair = source[i];
            if (Array.isArray(pair)) {
                if (!isCharacterPair(pair)) {
                    console.warn(`[${langId}]: language configuration: expected \`surroundingPairs[${i}]\` to be an array of two strings or an object.`);
                    continue;
                }
                result = result || [];
                result.push({ open: pair[0], close: pair[1] });
            } else {
                if (!isObject(pair)) {
                    console.warn(`[${langId}]: language configuration: expected \`surroundingPairs[${i}]\` to be an array of two strings or an object.`);
                    continue;
                }
                if (typeof pair.open !== 'string') {
                    console.warn(`[${langId}]: language configuration: expected \`surroundingPairs[${i}].open\` to be a string.`);
                    continue;
                }
                if (typeof pair.close !== 'string') {
                    console.warn(`[${langId}]: language configuration: expected \`surroundingPairs[${i}].close\` to be a string.`);
                    continue;
                }
                result = result || [];
                result.push({ open: pair.open, close: pair.close });
            }
        }
        return result;
    }

}

function isCharacterPair(something: CharacterPair): boolean {
    return (
        isStringArray(something)
        && something.length === 2
    );
}
