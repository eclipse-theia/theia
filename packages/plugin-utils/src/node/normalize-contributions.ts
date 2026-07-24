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

import { promises as fs } from 'fs';
import * as path from 'path';
import * as jsoncparser from 'jsonc-parser';
import { deepClone, isColorDefaults, isENOENT, isObject, isStringArray } from '../utils';
import {
    ICON_NAME_SEGMENT,
    type ColorDefinition,
    type IJSONSchema,
    type JsonType,
    type JSONValue,
    type PreferenceDataProperty,
    type PreferenceSchema,
    PreferenceScope,
    type TaskDefinition,
} from '../protocol-shims';
import {
    CustomEditorPriority,
    type AutoClosingPair,
    type AutoClosingPairConditional,
    type CharacterPair,
    type CommentRule,
    type FoldingRules,
    type IconUrl,
    type IConfigurationNode,
    type IndentationRules,
    type NormalizeContributionsContext,
    type NormalizedCommand,
    type NormalizedCustomEditor,
    type NormalizedIcon,
    type NormalizedIconTheme,
    type NormalizedKeybinding,
    type NormalizedLanguage,
    type NormalizedLanguageConfiguration,
    type NormalizedLocalization,
    type NormalizedSnippet,
    type NormalizedSubmenu,
    type NormalizedTerminalProfile,
    type NormalizedTheme,
    type NormalizedTranslation,
    type NormalizedViewContainer,
    type NormalizedViewWelcome,
    type PluginUiTheme,
    type RawCommand,
    type RawCustomEditor,
    type RawDebugger,
    type RawKeybinding,
    type RawLanguage,
    type RawLocalization,
    type RawMenu,
    type RawSubmenu,
    type RawTaskDefinition,
    type RawTranslation,
    type RawView,
    type RawViewContainer,
    type RawViewWelcome,
    type ViewsByLocation,
} from '../contribution-types';
import { rawContributes, type PluginManifest } from '../manifest-types';

function isPluginUiTheme(value: unknown): value is PluginUiTheme {
    return value === 'vs' || value === 'vs-dark' || value === 'hc-black';
}

export const colorIdPattern = '^\\w+[.\\w+]*$';
export const iconIdPattern = `^${ICON_NAME_SEGMENT}(-${ICON_NAME_SEGMENT})+$`;

/** Maps the view container locations used by VS Code extensions to the Theia shell locations. */
export const VIEW_CONTAINER_LOCATION_ALIASES: Record<string, string> = {
    activitybar: 'left',
    panel: 'bottom',
    secondarySidebar: 'right',
    auxiliarybar: 'right'
};

/**
 * Mirrors VS Code's `ConfigurationRegistry.getDefaultValue(type)`: plugins expect typed-but-defaultless properties to read as a type-based default.
 */
export function deriveDefaultForType(type: JsonType | JsonType[] | undefined): JSONValue {
    const t = Array.isArray(type) ? type[0] : type;
    switch (t) {
        case 'boolean': return false;
        case 'integer':
        case 'number': return 0;
        case 'string': return '';
        case 'array': return [];
        case 'object': return {};
        // eslint-disable-next-line no-null/no-null
        default: return null;
    }
}

export function getScope(monacoScope: string | undefined): { scope: PreferenceScope | undefined; overridable: boolean } {
    switch (monacoScope) {
        case 'machine-overridable':
        case 'window':
        case 'resource':
            return { scope: PreferenceScope.Folder, overridable: false };
        case 'language-overridable':
            return { scope: PreferenceScope.Folder, overridable: true };
        case 'application':
        case 'machine':
            return { scope: PreferenceScope.User, overridable: false };
    }
    return { scope: undefined, overridable: false };
}

function getFileExtension(filePath: string): string {
    const index = filePath.lastIndexOf('.');
    return index === -1 ? '' : filePath.substring(index + 1);
}

function isCharacterPair(something: unknown): something is CharacterPair {
    return isStringArray(something) && something.length === 2;
}

function isRawLocalization(entry: unknown): entry is RawLocalization {
    return isObject(entry) && typeof entry.languageId === 'string';
}

function toCustomEditorPriority(priority: string | undefined): CustomEditorPriority {
    if (priority === CustomEditorPriority.option || priority === CustomEditorPriority.builtin) {
        return priority;
    }
    return CustomEditorPriority.default;
}

async function readJson(ctx: NormalizeContributionsContext, filePath: string): Promise<unknown | undefined> {
    if (ctx.readJsonFile) {
        return ctx.readJsonFile(filePath);
    }

    try {
        const content = await fs.readFile(filePath, { encoding: 'utf8' });
        return content ? jsoncparser.parse(content, undefined, { disallowComments: false }) : undefined;
    } catch (e) {
        if (!isENOENT(e)) {
            throw e;
        }
        return undefined;
    }
}

export async function normalizeContributions<TContrib extends object>(
    ctx: NormalizeContributionsContext,
    contributions: TContrib
): Promise<TContrib> {
    const rawPlugin = ctx.plugin;
    const contributes = rawContributes(rawPlugin);
    const output = contributions as Record<string, unknown>;
    const readConfigurationFn = ctx.readConfiguration ?? readConfiguration;
    const readSubmenusFn = ctx.readSubmenus ?? ((submenus, plugin) => readSubmenus(ctx, submenus, plugin));
    const readCustomEditorsFn = ctx.readCustomEditors ?? readCustomEditors;
    const readViewsContainersFn = ctx.readViewsContainers ?? ((containers, plugin) => readViewsContainers(ctx, containers, plugin));
    const readViewsFn = ctx.readViews ?? readViews;
    const readViewsWelcomeFn = ctx.readViewsWelcome ?? readViewsWelcome;
    const readCommandFn = ctx.readCommand ?? ((command, plugin) => readCommand(ctx, command, plugin));
    const readMenusFn = ctx.readMenus ?? readMenus;
    const readKeybindingFn = ctx.readKeybinding ?? readKeybinding;
    const readDebuggersFn = ctx.readDebuggers ?? readDebuggers;
    const readTaskDefinitionFn = ctx.readTaskDefinition ?? ((pluginName, definition) => readTaskDefinition(pluginName, definition, ctx));
    const readSnippetsFn = ctx.readSnippets ?? (plugin => readSnippets(ctx, plugin));
    const readThemesFn = ctx.readThemes ?? (plugin => readThemes(ctx, plugin));
    const readIconsFn = ctx.readIcons ?? (plugin => readIcons(ctx, plugin));
    const readIconThemesFn = ctx.readIconThemes ?? (plugin => readIconThemes(ctx, plugin));
    const readColorsFn = ctx.readColors ?? (plugin => readColors(ctx, plugin));
    const readTerminalsFn = ctx.readTerminals ?? readTerminals;
    const readLocalizationsFn = ctx.readLocalizations ?? readLocalizations;
    const readLanguagesFn = ctx.readLanguages ?? ((languages, plugin) => readLanguages(ctx, languages, plugin));

    try {
        if (contributes.configuration) {
            const configurations = Array.isArray(contributes.configuration) ? contributes.configuration : [contributes.configuration];
            const hasMultipleConfigs = configurations.length > 1;
            output.configuration = [];
            for (const c of configurations) {
                const config = readConfigurationFn(c as IConfigurationNode, rawPlugin.packagePath);
                if (config) {
                    Object.values(config.properties).forEach(property => {
                        if (hasMultipleConfigs) {
                            property.owner = rawPlugin.displayName;
                            property.group = config.title;
                        } else {
                            property.owner = config.title;
                        }
                    });
                    (output.configuration as PreferenceSchema[]).push(config);
                }
            }
        }
    } catch (err) {
        ctx.onError('configuration', err, contributes.configuration);
    }

    output.problemMatchers = contributes.problemMatchers;
    output.problemPatterns = contributes.problemPatterns;
    output.resourceLabelFormatters = contributes.resourceLabelFormatters;
    output.authentication = contributes.authentication;
    output.notebooks = contributes.notebooks;
    output.notebookRenderer = contributes.notebookRenderer;
    output.notebookPreload = contributes.notebookPreload;

    const configurationDefaults = contributes.configurationDefaults;
    output.configurationDefaults = isObject(configurationDefaults) ? configurationDefaults : undefined;

    try {
        if (contributes.submenus) {
            output.submenus = readSubmenusFn(contributes.submenus, rawPlugin);
        }
    } catch (err) {
        ctx.onError('submenus', err, contributes.submenus);
    }

    try {
        if (contributes.customEditors) {
            output.customEditors = readCustomEditorsFn(contributes.customEditors);
        }
    } catch (err) {
        ctx.onError('customEditors', err, contributes.customEditors);
    }

    try {
        if (contributes.viewsContainers) {
            output.viewsContainers = {};

            for (const location of Object.keys(contributes.viewsContainers)) {
                const containers = readViewsContainersFn(contributes.viewsContainers[location], rawPlugin);
                const loc = VIEW_CONTAINER_LOCATION_ALIASES[location] ?? location;
                const existing = (output.viewsContainers as Record<string, unknown[]>)[loc];
                if (existing) {
                    (output.viewsContainers as Record<string, unknown[]>)[loc] = existing.concat(containers);
                } else {
                    (output.viewsContainers as Record<string, unknown[]>)[loc] = containers;
                }
            }
        }
    } catch (err) {
        ctx.onError('viewsContainers', err, contributes.viewsContainers);
    }

    try {
        if (contributes.views) {
            output.views = {};
            for (const location of Object.keys(contributes.views)) {
                (output.views as Record<string, RawView[]>)[location] = readViewsFn(contributes.views[location]);
            }
        }
    } catch (err) {
        ctx.onError('views', err, contributes.views);
    }

    try {
        if (contributes.viewsWelcome) {
            output.viewsWelcome = readViewsWelcomeFn(
                contributes.viewsWelcome,
                contributes.views
            );
        }
    } catch (err) {
        ctx.onError('viewsWelcome', err, contributes.viewsWelcome);
    }

    try {
        const pluginCommands = contributes.commands;
        if (pluginCommands) {
            const commands = Array.isArray(pluginCommands) ? pluginCommands : [pluginCommands];
            output.commands = commands.map(command => readCommandFn(command, rawPlugin));
        }
    } catch (err) {
        ctx.onError('commands', err, contributes.commands);
    }

    try {
        if (contributes.menus) {
            output.menus = {};
            for (const location of Object.keys(contributes.menus)) {
                (output.menus as Record<string, RawMenu[]>)[location] = readMenusFn(contributes.menus[location]);
            }
        }
    } catch (err) {
        ctx.onError('menus', err, contributes.menus);
    }

    try {
        if (contributes.keybindings) {
            const rawKeybindings = Array.isArray(contributes.keybindings) ? contributes.keybindings : [contributes.keybindings];
            output.keybindings = rawKeybindings.map(rawKeybinding => readKeybindingFn(rawKeybinding));
        }
    } catch (err) {
        ctx.onError('keybindings', err, contributes.keybindings);
    }

    try {
        if (contributes.debuggers) {
            output.debuggers = readDebuggersFn(contributes.debuggers);
        }
    } catch (err) {
        ctx.onError('debuggers', err, contributes.debuggers);
    }

    try {
        if (contributes.taskDefinitions) {
            output.taskDefinitions = contributes.taskDefinitions.map(definitionContribution =>
                readTaskDefinitionFn(rawPlugin.name, definitionContribution)
            );
        }
    } catch (err) {
        ctx.onError('taskDefinitions', err, contributes.taskDefinitions);
    }

    try {
        output.snippets = readSnippetsFn(rawPlugin);
    } catch (err) {
        ctx.onError('snippets', err, contributes.snippets);
    }

    try {
        output.themes = readThemesFn(rawPlugin);
    } catch (err) {
        ctx.onError('themes', err, contributes.themes);
    }

    try {
        output.icons = readIconsFn(rawPlugin);
    } catch (err) {
        ctx.onError('icons', err, contributes.icons);
    }

    try {
        output.iconThemes = readIconThemesFn(rawPlugin);
    } catch (err) {
        ctx.onError('iconThemes', err, contributes.iconThemes);
    }

    try {
        output.colors = readColorsFn(rawPlugin);
    } catch (err) {
        ctx.onError('colors', err, contributes.colors);
    }

    try {
        output.terminalProfiles = readTerminalsFn(rawPlugin);
    } catch (err) {
        ctx.onError('terminals', err, contributes.terminal);
    }

    try {
        output.localizations = readLocalizationsFn(rawPlugin);
    } catch (err) {
        ctx.onError('localizations', err, contributes.localizations);
    }

    const [languagesResult, grammarsResult] = await Promise.allSettled([
        contributes.languages ? readLanguagesFn(contributes.languages, rawPlugin) : undefined,
        contributes.grammars && ctx.readGrammars
            ? ctx.readGrammars(contributes.grammars, rawPlugin.packagePath)
            : undefined
    ]);

    if (contributes.languages) {
        if (languagesResult.status === 'fulfilled') {
            output.languages = languagesResult.value;
        } else {
            ctx.onError('languages', languagesResult.reason, contributes.languages);
        }
    }

    if (contributes.grammars) {
        if (grammarsResult.status === 'fulfilled') {
            output.grammars = grammarsResult.value;
        } else {
            ctx.onError('grammars', grammarsResult.reason, contributes.grammars);
        }
    }

    return contributions;
}

export function readTerminals(pck: PluginManifest): NormalizedTerminalProfile[] | undefined {
    const terminal = rawContributes(pck).terminal;
    if (!terminal?.profiles) {
        return undefined;
    }
    return terminal.profiles.filter((profile): profile is NormalizedTerminalProfile =>
        typeof profile.id === 'string' && typeof profile.title === 'string'
    );
}

export function readLocalizations(pck: PluginManifest): NormalizedLocalization[] | undefined {
    const localizations = rawContributes(pck).localizations;
    if (!Array.isArray(localizations)) {
        return undefined;
    }
    return localizations
        .filter(isRawLocalization)
        .map(entry => readLocalization(entry, pck.packagePath));
}

export function readLocalization(
    { languageId, languageName, localizedLanguageName, translations, minimalTranslations }: RawLocalization,
    pluginPath: string
): NormalizedLocalization {
    const local: NormalizedLocalization = {
        languageId,
        languageName,
        localizedLanguageName,
        minimalTranslations,
        translations: []
    };
    if (Array.isArray(translations)) {
        local.translations = translations.map(entry => readTranslation(entry, pluginPath));
    }
    return local;
}

export function readTranslation(packageTranslation: RawTranslation, _pluginPath: string): NormalizedTranslation {
    return {
        id: packageTranslation.id,
        path: packageTranslation.path
    };
}

export function readCommand(ctx: NormalizeContributionsContext, command: RawCommand, pck: PluginManifest): NormalizedCommand {
    const { themeIcon, iconUrl } = (ctx.transformIconUrl
        ? ctx.transformIconUrl(pck, command.icon)
        : transformIconUrl(ctx, pck, command.icon)) ?? {};
    return {
        command: command.command,
        title: command.title,
        shortTitle: command.shortTitle,
        originalTitle: command.original,
        category: command.category,
        iconUrl,
        themeIcon,
        enablement: command.enablement
    };
}

export function transformIconUrl(
    ctx: Pick<NormalizeContributionsContext, 'resolveUrl'>,
    _plugin: PluginManifest,
    original?: IconUrl
): { iconUrl?: IconUrl; themeIcon?: string } | undefined {
    if (original) {
        if (typeof original === 'string') {
            if (original.startsWith('$(')) {
                return { themeIcon: original };
            }
            return { iconUrl: ctx.resolveUrl(original) };
        }
        return {
            iconUrl: {
                light: ctx.resolveUrl(original.light),
                dark: ctx.resolveUrl(original.dark)
            }
        };
    }
    return undefined;
}

export function readColors(ctx: NormalizeContributionsContext, pck: PluginManifest): ColorDefinition[] | undefined {
    const colors = rawContributes(pck).colors;
    if (!Array.isArray(colors)) {
        return undefined;
    }
    const result: ColorDefinition[] = [];
    for (const contribution of colors) {
        if (!isObject(contribution)) {
            continue;
        }
        if (typeof contribution.id !== 'string' || contribution.id.length === 0) {
            ctx.onError('colors', "'configuration.colors.id' must be defined and can not be empty");
            continue;
        }
        if (!contribution.id.match(colorIdPattern)) {
            ctx.onError('colors', "'configuration.colors.id' must follow the word[.word]*");
            continue;
        }
        if (typeof contribution.description !== 'string' || contribution.description.length === 0) {
            ctx.onError('colors', "'configuration.colors.description' must be defined and can not be empty");
            continue;
        }
        const defaults = contribution.defaults;
        if (!isColorDefaults(defaults)) {
            ctx.onError('colors', "'configuration.colors.defaults' must be defined and must contain 'light', 'dark' and 'highContrast'");
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

export function readThemes(ctx: NormalizeContributionsContext, pck: PluginManifest): NormalizedTheme[] | undefined {
    const themes = rawContributes(pck).themes;
    if (!Array.isArray(themes)) {
        return undefined;
    }
    const result: NormalizedTheme[] = [];
    for (const contribution of themes) {
        if (!isObject(contribution)) {
            continue;
        }
        if (typeof contribution.path === 'string') {
            result.push({
                id: typeof contribution.id === 'string' ? contribution.id : undefined,
                uri: ctx.resolveUri(pck, contribution.path),
                description: typeof contribution.description === 'string' ? contribution.description : undefined,
                label: typeof contribution.label === 'string' ? contribution.label : undefined,
                uiTheme: isPluginUiTheme(contribution.uiTheme) ? contribution.uiTheme : undefined,
            });
        }
    }
    return result;
}

export function readIconThemes(ctx: NormalizeContributionsContext, pck: PluginManifest): NormalizedIconTheme[] | undefined {
    const iconThemes = rawContributes(pck).iconThemes;
    if (!Array.isArray(iconThemes)) {
        return undefined;
    }
    const result: NormalizedIconTheme[] = [];
    for (const contribution of iconThemes) {
        if (!isObject(contribution)) {
            continue;
        }
        if (typeof contribution.id !== 'string') {
            ctx.onError('iconThemes', 'Expected string in `contributes.iconThemes.id`. Provided value:', contribution.id);
            continue;
        }
        if (typeof contribution.path !== 'string') {
            ctx.onError('iconThemes', 'Expected string in `contributes.iconThemes.path`. Provided value:', contribution.path);
            continue;
        }
        result.push({
            id: contribution.id,
            uri: ctx.resolveUri(pck, contribution.path),
            description: typeof contribution.description === 'string' ? contribution.description : undefined,
            label: typeof contribution.label === 'string' ? contribution.label : undefined,
            uiTheme: isPluginUiTheme(contribution.uiTheme) ? contribution.uiTheme : undefined,
        });
    }
    return result;
}

export function readIcons(ctx: NormalizeContributionsContext, pck: PluginManifest): NormalizedIcon[] | undefined {
    const icons = rawContributes(pck).icons;
    if (!isObject(icons)) {
        return undefined;
    }
    const result: NormalizedIcon[] = [];
    for (const id in icons) {
        if (!Object.prototype.hasOwnProperty.call(icons, id)) {
            continue;
        }
        if (!id.match(iconIdPattern)) {
            ctx.onError('icons',
                '\'configuration.icons\' keys represent the icon id and can only contain letter, digits and minuses. ' +
                'They need to consist of at least two segments in the form `component-iconname`. ' +
                `extension: ${pck.name} icon id: ${id}`);
            return;
        }
        const iconContribution = icons[id];
        if (!isObject(iconContribution) || typeof iconContribution.description !== 'string' || iconContribution.description.length === 0) {
            ctx.onError('icons', `configuration.icons.description must be defined and can not be empty, extension: ${pck.name} icon id: ${id}`);
            return;
        }

        const defaultIcon = iconContribution.default;
        if (typeof defaultIcon === 'string') {
            result.push({
                id,
                extensionId: `${pck.publisher}.${pck.name}`,
                description: iconContribution.description,
                defaults: { id: defaultIcon }
            });
        } else if (isObject(defaultIcon) && typeof defaultIcon.fontPath === 'string' && typeof defaultIcon.fontCharacter === 'string') {
            const format = getFileExtension(defaultIcon.fontPath);
            if (['woff', 'woff2', 'ttf'].indexOf(format) === -1) {
                ctx.onWarn(`Expected \`contributes.icons.default.fontPath\` to have file extension 'woff', woff2' or 'ttf', is '${format}'.`);
                return;
            }

            const iconFontLocation = ctx.resolveUri(pck, defaultIcon.fontPath);
            result.push({
                id,
                extensionId: `${pck.publisher}.${pck.name}`,
                description: iconContribution.description,
                defaults: {
                    fontCharacter: defaultIcon.fontCharacter,
                    location: iconFontLocation
                }
            });
        } else {
            ctx.onError('icons',
                "'configuration.icons.default' must be either a reference to the id of an other theme icon (string) " +
                'or a icon definition (object) with properties `fontPath` and `fontCharacter`.');
        }
    }
    return result;
}

export function readSnippets(ctx: NormalizeContributionsContext, pck: PluginManifest): NormalizedSnippet[] | undefined {
    const snippets = rawContributes(pck).snippets;
    if (!Array.isArray(snippets)) {
        return undefined;
    }
    const result: NormalizedSnippet[] = [];
    for (const contribution of snippets) {
        if (!isObject(contribution)) {
            continue;
        }
        if (typeof contribution.path === 'string') {
            result.push({
                language: typeof contribution.language === 'string' ? contribution.language : undefined,
                source: pck.displayName || pck.name,
                uri: ctx.resolveUri(pck, contribution.path)
            });
        }
    }
    return result;
}

export function readConfiguration(rawConfiguration: IConfigurationNode, _pluginPath: string): PreferenceSchema | undefined {
    const { scope, overridable } = getScope(rawConfiguration.scope);
    const schema: PreferenceSchema = {
        scope,
        defaultOverridable: overridable,
        title: rawConfiguration.title,
        properties: {}
    };

    if (rawConfiguration.properties) {
        for (const [key, property] of Object.entries(rawConfiguration.properties)) {
            const scopeInfo = getScope(property.scope);
            const schemaProperty: PreferenceDataProperty = {
                ...property,
                scope: scopeInfo.scope,
                overridable: scopeInfo.overridable,
                default: property.default !== undefined ? property.default : deriveDefaultForType(property.type)
            };

            schema.properties[key] = schemaProperty;
        }
    }
    return schema;
}

export function readKeybinding(rawKeybinding: RawKeybinding): NormalizedKeybinding {
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

export function readCustomEditors(rawCustomEditors: readonly RawCustomEditor[]): NormalizedCustomEditor[] {
    return rawCustomEditors.map(rawCustomEditor => readCustomEditor(rawCustomEditor));
}

export function readCustomEditor(rawCustomEditor: RawCustomEditor): NormalizedCustomEditor {
    return {
        viewType: rawCustomEditor.viewType,
        displayName: rawCustomEditor.displayName,
        selector: rawCustomEditor.selector || [],
        priority: toCustomEditorPriority(rawCustomEditor.priority)
    };
}

export function readViewsContainers(
    ctx: NormalizeContributionsContext,
    rawViewsContainers: readonly RawViewContainer[],
    pck: PluginManifest
): NormalizedViewContainer[] {
    return rawViewsContainers
        .map(rawViewContainer => readViewContainer(ctx, rawViewContainer, pck))
        .filter((container): container is NormalizedViewContainer => container !== undefined);
}

export function readViewContainer(
    ctx: NormalizeContributionsContext,
    rawViewContainer: RawViewContainer,
    pck: PluginManifest
): NormalizedViewContainer | undefined {
    const icon = rawViewContainer.icon;
    if (typeof icon !== 'string') {
        ctx.onError('viewsContainers', 'view container icon must be defined and must be a string', rawViewContainer);
        return undefined;
    }
    const themeIcon = icon.startsWith('$(') ? icon : undefined;
    const iconUrl = ctx.resolveUrl(icon);
    return {
        id: rawViewContainer.id,
        title: rawViewContainer.title,
        iconUrl,
        themeIcon,
        when: rawViewContainer.when,
    };
}

export function readViews(rawViews: readonly RawView[]): RawView[] {
    return rawViews.map(rawView => readView(rawView));
}

export function readView(rawView: RawView): RawView {
    return {
        id: rawView.id,
        name: rawView.name,
        when: rawView.when,
        type: rawView.type
    };
}

export function readViewsWelcome(rawViewsWelcome: readonly RawViewWelcome[], rowViews: ViewsByLocation | undefined): NormalizedViewWelcome[] {
    return rawViewsWelcome.map(rawViewWelcome => readViewWelcome(rawViewWelcome, extractPluginViewsIds(rowViews)));
}

export function readViewWelcome(rawViewWelcome: RawViewWelcome, pluginViewsIds: string[]): NormalizedViewWelcome {
    return {
        view: rawViewWelcome.view,
        content: rawViewWelcome.contents,
        when: rawViewWelcome.when,
        enablement: rawViewWelcome.enablement,
        order: pluginViewsIds.findIndex(v => v === rawViewWelcome.view) > -1 ? 0 : 1
    };
}

export function extractPluginViewsIds(views: ViewsByLocation | undefined): string[] {
    const pluginViewsIds: string[] = [];
    if (views) {
        for (const location of Object.keys(views)) {
            const viewsIds = views[location]
                .filter(isObject)
                .map(view => view.id)
                .filter((id): id is string => typeof id === 'string');
            pluginViewsIds.push(...viewsIds);
        }
    }
    return pluginViewsIds;
}

export function readMenus(rawMenus: readonly RawMenu[]): RawMenu[] {
    return rawMenus.map(rawMenu => readMenu(rawMenu));
}

export function readMenu(rawMenu: RawMenu): RawMenu {
    return {
        command: rawMenu.command,
        submenu: rawMenu.submenu,
        alt: rawMenu.alt,
        group: rawMenu.group,
        when: rawMenu.when
    };
}

export async function readLanguages(ctx: NormalizeContributionsContext, rawLanguages: readonly RawLanguage[], plugin: PluginManifest): Promise<NormalizedLanguage[]> {
    return Promise.all(rawLanguages.map(language => readLanguage(ctx, language, plugin)));
}

export function readSubmenus(ctx: NormalizeContributionsContext, rawSubmenus: readonly RawSubmenu[], plugin: PluginManifest): NormalizedSubmenu[] {
    return rawSubmenus.map(submenu => readSubmenu(ctx, submenu, plugin));
}

export function readSubmenu(ctx: NormalizeContributionsContext, rawSubmenu: RawSubmenu, plugin: PluginManifest): NormalizedSubmenu {
    const icon = ctx.transformIconUrl
        ? ctx.transformIconUrl(plugin, rawSubmenu.icon)
        : transformIconUrl(ctx, plugin, rawSubmenu.icon);
    return {
        icon: icon?.iconUrl ?? icon?.themeIcon,
        id: rawSubmenu.id,
        label: rawSubmenu.label
    };
}

export async function readLanguage(ctx: NormalizeContributionsContext, rawLang: RawLanguage, plugin: PluginManifest): Promise<NormalizedLanguage> {
    const icon = ctx.transformIconUrl
        ? ctx.transformIconUrl(plugin, rawLang.icon)
        : transformIconUrl(ctx, plugin, rawLang.icon);
    const result: NormalizedLanguage = {
        id: rawLang.id,
        aliases: rawLang.aliases,
        extensions: rawLang.extensions,
        filenamePatterns: rawLang.filenamePatterns,
        filenames: rawLang.filenames,
        firstLine: rawLang.firstLine,
        mimetypes: rawLang.mimetypes,
        icon: icon?.iconUrl ?? icon?.themeIcon
    };
    if (typeof rawLang.configuration === 'string') {
        const rawConfiguration = await readJson(ctx, path.resolve(plugin.packagePath, rawLang.configuration));
        if (isObject(rawConfiguration)) {
            const configuration: NormalizedLanguageConfiguration = {
                brackets: Array.isArray(rawConfiguration.brackets)
                    ? rawConfiguration.brackets.filter(isCharacterPair)
                    : undefined,
                comments: rawConfiguration.comments as CommentRule | undefined,
                folding: rawConfiguration.folding as FoldingRules | undefined,
                wordPattern: typeof rawConfiguration.wordPattern === 'string' ? rawConfiguration.wordPattern : undefined,
                autoClosingPairs: extractValidAutoClosingPairs(ctx, rawLang.id, rawConfiguration),
                indentationRules: rawConfiguration.indentationRules as IndentationRules | undefined,
                surroundingPairs: extractValidSurroundingPairs(ctx, rawLang.id, rawConfiguration),
                onEnterRules: Array.isArray(rawConfiguration.onEnterRules) ? rawConfiguration.onEnterRules as NormalizedLanguageConfiguration['onEnterRules'] : undefined,
            };
            result.configuration = configuration;
        }
    }
    return result;
}

export function readDebuggers(rawDebuggers: readonly RawDebugger[]): RawDebugger[] {
    return rawDebuggers.map(rawDebug => readDebugger(rawDebug));
}

export function readDebugger(rawDebugger: RawDebugger): RawDebugger {
    return {
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
        runtimeArgs: rawDebugger.runtimeArgs,
        configurationAttributes: rawDebugger.configurationAttributes
    };
}

export function readTaskDefinition(
    pluginName: string,
    definitionContribution: RawTaskDefinition,
    ctx?: Pick<NormalizeContributionsContext, 'toSchema'>
): TaskDefinition {
    const propertyKeys = definitionContribution.properties && isObject(definitionContribution.properties)
        ? Object.keys(definitionContribution.properties)
        : [];
    const schema = (ctx?.toSchema ?? toSchema)(definitionContribution);
    return {
        taskType: definitionContribution.type,
        source: pluginName,
        properties: {
            required: definitionContribution.required,
            all: propertyKeys,
            schema
        }
    };
}

export function toSchema(definition: RawTaskDefinition): IJSONSchema {
    const reconciliation: IJSONSchema = { ...(definition as IJSONSchema), type: 'object' };
    const schema = deepClone(reconciliation);
    if (schema.properties === undefined) {
        // eslint-disable-next-line no-null/no-null
        schema.properties = Object.create(null);
    }
    schema.type = 'object';
    schema.properties!.type = { type: 'string', const: definition.type as string };
    return schema;
}

function extractValidAutoClosingPairs(ctx: NormalizeContributionsContext, langId: string, configuration: Record<string, unknown>): AutoClosingPairConditional[] | undefined {
    const source = configuration.autoClosingPairs;
    if (typeof source === 'undefined') {
        return undefined;
    }
    if (!Array.isArray(source)) {
        ctx.onWarn(`[${langId}]: language configuration: expected \`autoClosingPairs\` to be an array.`);
        return undefined;
    }

    let result: AutoClosingPairConditional[] | undefined = undefined;
    for (let i = 0, len = source.length; i < len; i++) {
        const pair = source[i];
        if (Array.isArray(pair)) {
            if (!isCharacterPair(pair)) {
                ctx.onWarn(`[${langId}]: language configuration: expected \`autoClosingPairs[${i}]\` to be an array of two strings or an object.`);
                continue;
            }
            result = result || [];
            result.push({ open: pair[0], close: pair[1] });
        } else {
            if (!isObject(pair)) {
                ctx.onWarn(`[${langId}]: language configuration: expected \`autoClosingPairs[${i}]\` to be an array of two strings or an object.`);
                continue;
            }
            if (typeof pair.open !== 'string') {
                ctx.onWarn(`[${langId}]: language configuration: expected \`autoClosingPairs[${i}].open\` to be a string.`);
                continue;
            }
            if (typeof pair.close !== 'string') {
                ctx.onWarn(`[${langId}]: language configuration: expected \`autoClosingPairs[${i}].close\` to be a string.`);
                continue;
            }
            if (typeof pair.notIn !== 'undefined') {
                if (!isStringArray(pair.notIn)) {
                    ctx.onWarn(`[${langId}]: language configuration: expected \`autoClosingPairs[${i}].notIn\` to be a string array.`);
                    continue;
                }
            }
            result = result || [];
            result.push({ open: pair.open, close: pair.close, notIn: pair.notIn });
        }
    }
    return result;
}

function extractValidSurroundingPairs(ctx: NormalizeContributionsContext, langId: string, configuration: Record<string, unknown>): AutoClosingPair[] | undefined {
    const source = configuration.surroundingPairs;
    if (typeof source === 'undefined') {
        return undefined;
    }
    if (!Array.isArray(source)) {
        ctx.onWarn(`[${langId}]: language configuration: expected \`surroundingPairs\` to be an array.`);
        return undefined;
    }

    let result: AutoClosingPair[] | undefined = undefined;
    for (let i = 0, len = source.length; i < len; i++) {
        const pair = source[i];
        if (Array.isArray(pair)) {
            if (!isCharacterPair(pair)) {
                ctx.onWarn(`[${langId}]: language configuration: expected \`surroundingPairs[${i}]\` to be an array of two strings or an object.`);
                continue;
            }
            result = result || [];
            result.push({ open: pair[0], close: pair[1] });
        } else {
            if (!isObject(pair)) {
                ctx.onWarn(`[${langId}]: language configuration: expected \`surroundingPairs[${i}]\` to be an array of two strings or an object.`);
                continue;
            }
            if (typeof pair.open !== 'string') {
                ctx.onWarn(`[${langId}]: language configuration: expected \`surroundingPairs[${i}].open\` to be a string.`);
                continue;
            }
            if (typeof pair.close !== 'string') {
                ctx.onWarn(`[${langId}]: language configuration: expected \`surroundingPairs[${i}].close\` to be a string.`);
                continue;
            }
            result = result || [];
            result.push({ open: pair.open, close: pair.close });
        }
    }
    return result;
}
