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

import { inject, injectable, unmanaged, named } from '@theia/core/shared/inversify';
import {
    CustomEditor,
    DebuggerContribution,
    IconUrl,
    Keybinding,
    Localization,
    Menu,
    PluginCommand,
    PluginContribution,
    PluginEngine,
    PluginEntryPoint,
    PluginLifecycle,
    PluginModel,
    PluginPackage,
    PluginPackageCommand,
    PluginPackageContribution,
    PluginPackageCustomEditor,
    PluginPackageDebuggersContribution,
    PluginPackageGrammarsContribution,
    PluginPackageKeybinding,
    PluginPackageLanguageContribution,
    PluginPackageLocalization,
    PluginPackageMenu,
    PluginPackageSubmenu,
    PluginPackageTranslation,
    PluginPackageView,
    PluginPackageViewContainer,
    PluginPackageViewWelcome,
    PluginScanner,
    PluginTaskDefinitionContribution,
    PluginIdentifiers,
    Submenu,
    TerminalProfile,
    Translation,
    View,
    ViewContainer,
    ViewWelcome,
} from '../../../common/plugin-protocol';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as jsoncparser from 'jsonc-parser';
import { GrammarsReader } from './grammars-reader';
import { isENOENT } from '../../../common/errors';
import { PluginUriFactory } from './plugin-uri-factory';
import { ILogger } from '@theia/core';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import { PreferenceSchema } from '@theia/core/lib/common/preferences/preference-schema';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import { TaskDefinition } from '@theia/task/lib/common/task-protocol';
import { ColorDefinition } from '@theia/core/lib/common/color';
import {
    extractPluginViewsIds as extractPluginViewsIdsShared,
    getScope as getScopeShared,
    normalizeContributions,
    readColors as readColorsShared,
    readCommand as readCommandShared,
    readConfiguration as readConfigurationShared,
    readCustomEditor as readCustomEditorShared,
    readDebugger as readDebuggerShared,
    readIcons as readIconsShared,
    readIconThemes as readIconThemesShared,
    readKeybinding as readKeybindingShared,
    readLanguage as readLanguageShared,
    readMenu as readMenuShared,
    readSnippets as readSnippetsShared,
    readSubmenu as readSubmenuShared,
    readTaskDefinition as readTaskDefinitionShared,
    readTerminals as readTerminalsShared,
    readThemes as readThemesShared,
    readTranslation as readTranslationShared,
    readView as readViewShared,
    readViewContainer as readViewContainerShared,
    readViewWelcome as readViewWelcomeShared,
    toSchema as toSchemaShared,
    transformIconUrl as transformIconUrlShared,
} from '@theia/plugin-utils/lib/normalize-contributions';
import type {
    IConfigurationNode,
    NormalizeContributionsContext,
} from '@theia/plugin-utils/lib/contribution-types';
import {
    buildLifecycle,
    buildModelForTheia as buildModelForTheiaShared,
    getPluginRootFileUrl as getPluginRootFileUrlShared,
    toPluginUrl as toPluginUrlShared
} from '@theia/plugin-utils/lib/plugin-model';

type PluginPackageWithContributes = PluginPackage & { contributes: PluginPackageContribution };

@injectable()
export abstract class AbstractPluginScanner implements PluginScanner {

    @inject(GrammarsReader)
    protected readonly grammarsReader: GrammarsReader;

    @inject(PluginUriFactory)
    protected readonly pluginUriFactory: PluginUriFactory;

    constructor(
        @unmanaged() private readonly _apiType: PluginEngine,
        @unmanaged() private readonly _backendInitPath?: string) {
    }

    get apiType(): PluginEngine {
        return this._apiType;
    }

    getModel(plugin: PluginPackage): PluginModel {
        const publisher = plugin.publisher ?? PluginIdentifiers.UNPUBLISHED;
        const result = buildModelForTheiaShared({
            ...plugin,
            publisher,
            packageUri: this.pluginUriFactory.createUri(plugin).toString(),
        });

        result.engine.type = this._apiType;
        result.engine.version = plugin.engines[this._apiType] ?? '*';
        result.entryPoint = this.getEntryPoint(plugin);

        return result;
    }

    protected getReadmeUrl(plugin: PluginPackage): string | undefined {
        return this.getPluginRootFileUrl(plugin, ['readme.md', 'readme.txt', 'readme']);
    }

    protected getLicenseUrl(plugin: PluginPackage): string | undefined {
        return this.getPluginRootFileUrl(plugin, ['license', 'license.txt', 'license.md']);
    }

    protected getPluginRootFileUrl(plugin: PluginPackage, names: string[]): string | undefined {
        return getPluginRootFileUrlShared(plugin, names);
    }

    protected abstract getEntryPoint(plugin: PluginPackage): PluginEntryPoint;

    getLifecycle(plugin: PluginPackage): PluginLifecycle {
        const result = buildLifecycle(plugin, 'theiaPlugin');
        if (this._backendInitPath) {
            result.backendInitPath = path.join(__dirname, this._backendInitPath);
        }
        return result;
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

        return this.readContributions(rawPlugin as PluginPackageWithContributes, contributions);
    }

    protected async readContributions(rawPlugin: PluginPackageWithContributes, contributions: PluginContribution): Promise<PluginContribution> {
        return contributions;
    }

}

@injectable()
export class TheiaPluginScanner extends AbstractPluginScanner {
    constructor() {
        super('theiaPlugin', 'backend-init-theia');
    }

    @inject(ILogger) @named('plugin-ext:TheiaPluginScanner')
    protected readonly logger: ILogger;

    protected getEntryPoint(plugin: PluginPackage): PluginEntryPoint {
        const result: PluginEntryPoint = {
            frontend: plugin.theiaPlugin!.frontend,
            backend: plugin.theiaPlugin!.backend
        };
        if (plugin.theiaPlugin?.headless) {
            result.headless = plugin.theiaPlugin.headless;
        }
        return result;
    }

    static getScope(monacoScope: string | undefined): { scope: PreferenceScope | undefined; overridable: boolean } {
        return getScopeShared(monacoScope);
    }

    protected override async readContributions(rawPlugin: PluginPackageWithContributes, contributions: PluginContribution): Promise<PluginContribution> {
        const ctx: NormalizeContributionsContext<PluginPackage> = {
            ...this.contributionCtx(rawPlugin),
            readConfiguration: this.readConfiguration.bind(this),
            readCustomEditors: this.readCustomEditors.bind(this),
            readViews: this.readViews.bind(this),
            readKeybinding: this.readKeybinding.bind(this),
            readDebuggers: this.readDebuggers.bind(this),
            readSubmenus: (submenus, plugin) => this.readSubmenus(submenus, plugin),
            readViewsContainers: (containers, plugin) => this.readViewsContainers(containers, plugin),
            readViewsWelcome: (welcome, views) => this.readViewsWelcome(welcome, views),
            readCommand: (command, plugin) => this.readCommand(command, plugin),
            readMenus: menus => this.readMenus(menus),
            readTaskDefinition: (pluginName, definition) => this.readTaskDefinition(pluginName, definition as PluginTaskDefinitionContribution),
            readSnippets: plugin => this.readSnippets(plugin),
            readThemes: plugin => this.readThemes(plugin),
            readIcons: plugin => this.readIcons(plugin),
            readIconThemes: plugin => this.readIconThemes(plugin),
            readColors: plugin => this.readColors(plugin),
            readTerminals: plugin => this.readTerminals(plugin),
            readLocalizations: plugin => this.readLocalizations(plugin),
            readLanguages: (languages, plugin) => this.readLanguages(languages, plugin),
        };
        return normalizeContributions(ctx, contributions);
    }

    protected contributionCtx(pck: PluginPackage): NormalizeContributionsContext<PluginPackage> {
        return {
            plugin: pck,
            resolveUrl: relativePath => this.toPluginUrl(pck, relativePath),
            resolveUri: (_plugin, relativePath) => this.pluginUriFactory.createUri(pck, relativePath).toString(),
            onError: (type, err, detail) => this.logger.error(`Could not read '${pck.name}' contribution '${type}'.`, detail, err),
            onWarn: msg => this.logger.warn(msg),
            readJsonFile: filePath => this.readJson(filePath),
            readGrammars: (grammars, pluginPath) => this.grammarsReader.readGrammars(grammars as PluginPackageGrammarsContribution[], pluginPath),
        };
    }

    protected readTerminals(pck: PluginPackage): TerminalProfile[] | undefined {
        return readTerminalsShared(pck);
    }

    protected readLocalizations(pck: PluginPackage): Localization[] | undefined {
        if (!pck.contributes?.localizations) {
            return undefined;
        }
        return pck.contributes.localizations.map(entry => this.readLocalization(entry, pck.packagePath));
    }

    protected readLocalization({ languageId, languageName, localizedLanguageName, translations }: PluginPackageLocalization, pluginPath: string): Localization {
        const local: Localization = {
            languageId,
            languageName,
            localizedLanguageName,
            translations: translations?.map(entry => this.readTranslation(entry, pluginPath)) ?? []
        };
        return local;
    }

    protected readTranslation(packageTranslation: PluginPackageTranslation, pluginPath: string): Translation {
        return readTranslationShared(packageTranslation, pluginPath) as Translation;
    }

    protected readCommand(command: PluginPackageCommand, pck: PluginPackage): PluginCommand {
        return readCommandShared(this.contributionCtx(pck), command, pck);
    }

    protected transformIconUrl(plugin: PluginPackage, original?: IconUrl): { iconUrl?: IconUrl; themeIcon?: string } | undefined {
        return transformIconUrlShared(this.contributionCtx(plugin), plugin, original);
    }

    protected toPluginUrl(pck: PluginPackage, relativePath: string): string {
        return toPluginUrlShared(pck, relativePath);
    }

    protected readColors(pck: PluginPackage): ColorDefinition[] | undefined {
        return readColorsShared(this.contributionCtx(pck), pck) as ColorDefinition[] | undefined;
    }

    protected readThemes(pck: PluginPackage): ReturnType<typeof readThemesShared> {
        return readThemesShared(this.contributionCtx(pck), pck);
    }

    protected readIconThemes(pck: PluginPackage): ReturnType<typeof readIconThemesShared> {
        return readIconThemesShared(this.contributionCtx(pck), pck);
    }

    protected readIcons(pck: PluginPackage): ReturnType<typeof readIconsShared> {
        return readIconsShared(this.contributionCtx(pck), pck);
    }

    protected readSnippets(pck: PluginPackage): ReturnType<typeof readSnippetsShared> {
        return readSnippetsShared(this.contributionCtx(pck), pck);
    }

    protected readConfiguration(rawConfiguration: IConfigurationNode, pluginPath: string): PreferenceSchema | undefined {
        return readConfigurationShared(rawConfiguration, pluginPath) as PreferenceSchema | undefined;
    }

    protected readKeybinding(rawKeybinding: PluginPackageKeybinding): Keybinding {
        return readKeybindingShared(rawKeybinding);
    }

    protected readCustomEditors(rawCustomEditors: PluginPackageCustomEditor[]): CustomEditor[] {
        return rawCustomEditors.map(rawCustomEditor => this.readCustomEditor(rawCustomEditor));
    }

    protected readCustomEditor(rawCustomEditor: PluginPackageCustomEditor): CustomEditor {
        return readCustomEditorShared(rawCustomEditor) as CustomEditor;
    }

    protected readViewsContainers(rawViewsContainers: readonly PluginPackageViewContainer[], pck: PluginPackage): ViewContainer[] {
        return rawViewsContainers
            .map(rawViewContainer => this.readViewContainer(rawViewContainer, pck))
            .filter((container): container is ViewContainer => container !== undefined);
    }

    protected readViewContainer(rawViewContainer: PluginPackageViewContainer, pck: PluginPackage): ViewContainer | undefined {
        return readViewContainerShared(this.contributionCtx(pck), rawViewContainer, pck) as ViewContainer | undefined;
    }

    protected readViews(rawViews: PluginPackageView[]): View[] {
        return rawViews.map(rawView => this.readView(rawView));
    }

    protected readView(rawView: PluginPackageView): View {
        return readViewShared(rawView);
    }

    protected readViewsWelcome(rawViewsWelcome: readonly PluginPackageViewWelcome[], rowViews: { [location: string]: readonly PluginPackageView[]; } | undefined): ViewWelcome[] {
        return rawViewsWelcome.map(rawViewWelcome => this.readViewWelcome(rawViewWelcome, this.extractPluginViewsIds(rowViews)));
    }

    protected readViewWelcome(rawViewWelcome: PluginPackageViewWelcome, pluginViewsIds: string[]): ViewWelcome {
        return readViewWelcomeShared(rawViewWelcome, pluginViewsIds);
    }

    protected extractPluginViewsIds(views: { [location: string]: readonly PluginPackageView[] } | undefined): string[] {
        return extractPluginViewsIdsShared(views);
    }

    protected readMenus(rawMenus: readonly PluginPackageMenu[]): Menu[] {
        return rawMenus.map(rawMenu => this.readMenu(rawMenu));
    }

    protected readMenu(rawMenu: PluginPackageMenu): Menu {
        return readMenuShared(rawMenu);
    }

    protected async readLanguages(rawLanguages: readonly PluginPackageLanguageContribution[], plugin: PluginPackage): Promise<Awaited<ReturnType<typeof readLanguageShared>>[]> {
        return Promise.all(rawLanguages.map(language => this.readLanguage(language, plugin)));
    }

    protected readSubmenus(rawSubmenus: readonly PluginPackageSubmenu[], plugin: PluginPackage): Submenu[] {
        return rawSubmenus.map(submenu => this.readSubmenu(submenu, plugin));
    }

    protected readSubmenu(rawSubmenu: PluginPackageSubmenu, plugin: PluginPackage): Submenu {
        return readSubmenuShared(this.contributionCtx(plugin), rawSubmenu, plugin);
    }

    protected async readLanguage(rawLang: PluginPackageLanguageContribution, plugin: PluginPackage): Promise<Awaited<ReturnType<typeof readLanguageShared>>> {
        return readLanguageShared(this.contributionCtx(plugin), rawLang, plugin);
    }

    protected readDebuggers(rawDebuggers: PluginPackageDebuggersContribution[]): DebuggerContribution[] {
        return rawDebuggers.map(rawDebugger => this.readDebugger(rawDebugger));
    }

    protected readDebugger(rawDebugger: PluginPackageDebuggersContribution): DebuggerContribution {
        return readDebuggerShared(rawDebugger) as DebuggerContribution;
    }

    protected readTaskDefinition(pluginName: string, definitionContribution: PluginTaskDefinitionContribution): TaskDefinition {
        return readTaskDefinitionShared(pluginName, definitionContribution) as TaskDefinition;
    }

    protected toSchema(definition: PluginTaskDefinitionContribution): IJSONSchema {
        return toSchemaShared(definition) as IJSONSchema;
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
                this.logger.error(e);
            }
            return '';
        }
    }
}
