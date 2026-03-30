// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

import { existsSync, readFileSync, readdirSync } from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as fs from 'fs-extra';
import { ApplicationPackage } from '@theia/application-package';
import {
    DEFAULT_PLUGINS_DIR,
    PLUGINS_BASE_PATH,
    THEIA_PLUGIN_START_METHOD,
    THEIA_PLUGIN_STOP_METHOD,
    UNPUBLISHED,
    VSCODE_BUILTIN_NAME_PREFIX,
    VSCODE_EXTENSION_ACTIVATE,
    VSCODE_EXTENSION_DEACTIVATE,
    VSCODE_FRONTEND_INIT
} from './constants';
import type {
    BrowserOnlyManifest,
    BrowserOnlyPluginLifecycle,
    BrowserOnlyPluginModel,
    PluginEntryPoint
} from './types';
import { localizeBrowserOnlyManifest } from './package-nls';

export function isObject<T extends object>(value: unknown): value is T {
    return typeof value === 'object' && value !== null;
}

export function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((e): e is string => typeof e === 'string');
}

/** Mirrors scanner `colorIdPattern` — `word[.word]*`. */
const COLOR_ID_PATTERN = /^\w+[.\w+]*$/;
/** Loose icon id: at least two `segment-segment` segments (letters, digits, hyphen). */
const ICON_ID_PATTERN = /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)+$/;

function getFileExtensionForIconPath(filePath: string): string {
    const index = filePath.lastIndexOf('.');
    return index === -1 ? '' : filePath.substring(index + 1);
}

/** Same URL as `PluginPackage.toPluginUrl` / `TheiaPluginScanner.toPluginUrl`. */
function toPluginRelativeUrl(manifest: BrowserOnlyManifest, relativePath: string): string {
    return `${PLUGINS_BASE_PATH}/${getPluginId(manifest)}/${encodeURIComponent(relativePath)}`;
}

/**
 * Mirrors `TheiaPluginScanner.transformIconUrl` — `$(…)` → `themeIcon`, else path → static `iconUrl`
 * (string or light/dark object).
 */
function transformIconUrl(manifest: BrowserOnlyManifest, original: unknown): { iconUrl?: string | { light: string; dark: string }; themeIcon?: string } | undefined {
    if (original === undefined || original === null) {
        return undefined;
    }
    if (typeof original === 'string') {
        if (original.startsWith('$(')) {
            return { themeIcon: original };
        }
        return { iconUrl: toPluginRelativeUrl(manifest, original) };
    }
    if (isObject(original) && 'light' in original && 'dark' in original) {
        const o = original as { light: unknown; dark: unknown };
        if (typeof o.light === 'string' && typeof o.dark === 'string') {
            return {
                iconUrl: {
                    light: toPluginRelativeUrl(manifest, o.light),
                    dark: toPluginRelativeUrl(manifest, o.dark)
                }
            };
        }
    }
    return undefined;
}

/** Mirrors `extractPluginViewsIds` in `scanner-theia.ts`. */
function extractPluginViewsIds(views: unknown): string[] {
    const pluginViewsIds: string[] = [];
    if (!views || typeof views !== 'object' || Array.isArray(views)) {
        return pluginViewsIds;
    }
    for (const location of Object.keys(views as object)) {
        const group = (views as Record<string, unknown>)[location];
        if (!Array.isArray(group)) {
            continue;
        }
        for (const view of group) {
            if (isObject(view) && typeof (view as { id?: string }).id === 'string') {
                pluginViewsIds.push((view as { id: string }).id);
            }
        }
    }
    return pluginViewsIds;
}

function normalizeColorsContribution(colors: unknown): unknown[] | undefined {
    if (!Array.isArray(colors)) {
        return undefined;
    }
    const result: unknown[] = [];
    for (const contribution of colors) {
        if (!isObject(contribution)) {
            continue;
        }
        const c = contribution as Record<string, unknown>;
        if (typeof c.id !== 'string' || c.id.length === 0) {
            continue;
        }
        if (!COLOR_ID_PATTERN.test(c.id)) {
            continue;
        }
        if (typeof c.description !== 'string' || c.description.length === 0) {
            continue;
        }
        const defaults = c.defaults;
        if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) {
            continue;
        }
        const d = defaults as Record<string, unknown>;
        if (typeof d.light !== 'string' || typeof d.dark !== 'string') {
            continue;
        }
        const hc = typeof d.highContrast === 'string' ? d.highContrast : (typeof d.hc === 'string' ? d.hc : undefined);
        if (typeof hc !== 'string') {
            continue;
        }
        result.push({
            id: c.id,
            description: c.description,
            defaults: {
                light: d.light,
                dark: d.dark,
                hc
            }
        });
    }
    return result.length ? result : undefined;
}

function normalizeSubmenuContribution(manifest: BrowserOnlyManifest, raw: unknown): Record<string, unknown> {
    if (!isObject(raw)) {
        return raw as Record<string, unknown>;
    }
    const s = { ...raw } as Record<string, unknown>;
    const icon = s.icon;
    delete s.icon;
    const transformed = transformIconUrl(manifest, icon);
    if (transformed !== undefined) {
        const merged = transformed.iconUrl ?? transformed.themeIcon;
        if (merged !== undefined) {
            s.icon = merged;
        }
    }
    return s;
}

/** Mirrors `readTerminals` — `contributes.terminal.profiles` → `terminalProfiles`. */
function normalizeTerminalProfilesContribution(c: Record<string, unknown>): void {
    const terminal = c.terminal;
    if (!terminal || !isObject(terminal)) {
        return;
    }
    const profiles = (terminal as { profiles?: unknown }).profiles;
    if (!Array.isArray(profiles)) {
        delete c.terminal;
        return;
    }
    const filtered = profiles.filter((p): p is Record<string, unknown> =>
        isObject(p) && !!(p as { id?: string }).id && !!(p as { title?: string }).title
    );
    if (filtered.length) {
        c.terminalProfiles = filtered;
    }
    delete c.terminal;
}

function normalizeIconsContributionArray(manifest: BrowserOnlyManifest, icons: unknown[], pluginId: string): Record<string, unknown>[] {
    const result: Record<string, unknown>[] = [];
    const pkgPath = manifest.packagePath;
    for (const el of icons) {
        if (!isObject(el)) {
            continue;
        }
        const e = el as Record<string, unknown>;
        if (typeof e.id !== 'string' || !e.defaults || !isObject(e.defaults)) {
            continue;
        }
        const def = { ...(e.defaults as Record<string, unknown>) };
        if (typeof def.location === 'string' && typeof pkgPath === 'string') {
            const loc = def.location as string;
            const fileUri = loc.startsWith('file://') ? loc : pathToFileURL(path.resolve(pkgPath, loc)).href;
            def.location = toHostedPluginUri(fileUri, pkgPath, pluginId);
        }
        result.push({ ...e, defaults: def });
    }
    return result;
}

/** Mirrors `TheiaPluginScanner.readIcons` — package.json object keyed by id → `IconContribution[]`. */
function normalizeIconsContribution(manifest: BrowserOnlyManifest, icons: unknown, pluginId: string): Record<string, unknown>[] {
    if (icons === null || icons === undefined) {
        return [];
    }
    if (Array.isArray(icons)) {
        return normalizeIconsContributionArray(manifest, icons, pluginId);
    }
    if (!isObject(icons)) {
        return [];
    }
    const iconEntries = icons as Record<string, unknown>;
    const result: Record<string, unknown>[] = [];
    const extensionId = `${manifest.publisher ?? UNPUBLISHED}.${manifest.name}`;
    const pkgPath = manifest.packagePath;
    for (const id of Object.keys(iconEntries)) {
        if (!Object.prototype.hasOwnProperty.call(iconEntries, id)) {
            continue;
        }
        if (!ICON_ID_PATTERN.test(id)) {
            continue;
        }
        const iconContribution = iconEntries[id];
        if (!isObject(iconContribution)) {
            continue;
        }
        const ic = iconContribution as Record<string, unknown>;
        if (typeof ic.description !== 'string' || ic.description.length === 0) {
            continue;
        }
        const defaultIcon = ic.default;
        if (typeof defaultIcon === 'string') {
            result.push({
                id,
                extensionId,
                description: ic.description,
                defaults: { id: defaultIcon }
            });
        } else if (
            isObject(defaultIcon) &&
            typeof (defaultIcon as { fontPath?: string }).fontPath === 'string' &&
            typeof (defaultIcon as { fontCharacter?: string }).fontCharacter === 'string'
        ) {
            const fontPath = (defaultIcon as { fontPath: string }).fontPath;
            const fontCharacter = (defaultIcon as { fontCharacter: string }).fontCharacter;
            const format = getFileExtensionForIconPath(fontPath);
            if (['woff', 'woff2', 'ttf'].indexOf(format) === -1) {
                continue;
            }
            if (typeof pkgPath !== 'string') {
                continue;
            }
            const fileUri = pathToFileURL(path.resolve(pkgPath, fontPath)).href;
            const iconFontLocation = toHostedPluginUri(fileUri, pkgPath, pluginId);
            result.push({
                id,
                extensionId,
                description: ic.description,
                defaults: {
                    fontCharacter,
                    location: iconFontLocation
                }
            });
        }
    }
    return result;
}

/**
 * Mirrors `TheiaPluginScanner.readTaskDefinition` / `toSchema` in
 * `packages/plugin-ext/src/hosted/node/scanners/scanner-theia.ts` so `TaskDefinitionRegistry` and
 * `TaskSchemaUpdater` receive `properties.all` and `properties.schema`.
 */
function taskContributionToSchema(definition: Record<string, unknown>): Record<string, unknown> {
    const schema = structuredClone({ ...definition, type: 'object' }) as Record<string, unknown>;
    if (schema.properties === undefined) {
        schema.properties = Object.create(null);
    }
    schema.type = 'object';
    const props = schema.properties as Record<string, unknown>;
    props.type = { type: 'string', const: definition.type };
    return schema;
}

function normalizeTaskDefinitionContribution(pluginName: string, def: unknown): Record<string, unknown> {
    if (!isObject(def)) {
        return def as Record<string, unknown>;
    }
    const d = def as Record<string, unknown>;
    if (typeof d.taskType === 'string' && isObject(d.properties) && Array.isArray((d.properties as { all?: unknown }).all)) {
        return d;
    }
    const taskType = d.type;
    if (typeof taskType !== 'string') {
        return d;
    }
    const rawProps = d.properties;
    const propertyKeys = isObject(rawProps) && rawProps !== null && !Array.isArray(rawProps)
        ? Object.keys(rawProps as object)
        : [];
    const required = Array.isArray(d.required)
        ? d.required.filter((x): x is string => typeof x === 'string')
        : [];
    return {
        taskType,
        source: pluginName,
        properties: {
            required,
            all: propertyKeys,
            schema: taskContributionToSchema(d)
        }
    };
}

/** Mirrors `readKeybinding` — VS Code manifest uses `key`; `KeybindingsContributionPointHandler` expects `keybinding`. */
function normalizeKeybindingContribution(raw: unknown): Record<string, unknown> {
    if (!isObject(raw)) {
        return raw as Record<string, unknown>;
    }
    const k = raw as Record<string, unknown>;
    return {
        keybinding: typeof k.key === 'string' ? k.key : k.keybinding,
        command: k.command,
        when: k.when,
        mac: k.mac,
        linux: k.linux,
        win: k.win,
        args: k.args
    };
}

/** Mirrors `readCommand` — `original` → `originalTitle`; `icon` → `iconUrl` / `themeIcon`. */
function normalizeCommandContribution(manifest: BrowserOnlyManifest, cmd: unknown): Record<string, unknown> {
    if (!isObject(cmd)) {
        return cmd as Record<string, unknown>;
    }
    const x = { ...cmd } as Record<string, unknown>;
    const icon = x.icon;
    delete x.icon;
    if (typeof x.original === 'string' && x.originalTitle === undefined) {
        x.originalTitle = x.original;
        delete x.original;
    }
    const transformed = transformIconUrl(manifest, icon);
    if (transformed?.iconUrl !== undefined) {
        x.iconUrl = transformed.iconUrl;
    }
    if (transformed?.themeIcon !== undefined) {
        x.themeIcon = transformed.themeIcon;
    }
    return x;
}

/** Mirrors `readViewWelcome` — `contents` → `content`; `order` from `views` (see `scanner-theia.ts`). */
function normalizeViewWelcomeEntry(entry: unknown, pluginViewsIds: string[]): Record<string, unknown> {
    if (!isObject(entry)) {
        return entry as Record<string, unknown>;
    }
    const v = { ...entry } as Record<string, unknown>;
    if (typeof v.contents === 'string' && v.content === undefined) {
        v.content = v.contents;
        delete v.contents;
    }
    const viewId = typeof v.view === 'string' ? v.view : '';
    v.order = pluginViewsIds.indexOf(viewId) > -1 ? 0 : 1;
    return v;
}

/**
 * Mirrors `readViewContainer` in `scanner-theia.ts`: manifest `icon` → `iconUrl` (plugin static path) + optional
 * `themeIcon` for `$(…)` codicons; strips raw `icon`. Location keys are remapped like `readContributions`
 * (`activitybar` → `left`, `panel` → `bottom`).
 */
function normalizeViewContainerEntry(manifest: BrowserOnlyManifest, entry: unknown): Record<string, unknown> {
    if (!isObject(entry)) {
        return entry as Record<string, unknown>;
    }
    const v = entry as Record<string, unknown>;
    const id = v.id;
    const title = v.title;
    if (typeof v.iconUrl === 'string' && v.iconUrl.length > 0) {
        return {
            id,
            title,
            iconUrl: v.iconUrl,
            ...(typeof v.themeIcon === 'string' ? { themeIcon: v.themeIcon } : {})
        };
    }
    const iconRaw = v.icon;
    if (typeof iconRaw !== 'string') {
        return v;
    }
    const themeIcon = iconRaw.startsWith('$(') ? iconRaw : undefined;
    const pluginId = getPluginId(manifest);
    const iconUrl = `${PLUGINS_BASE_PATH}/${pluginId}/${encodeURIComponent(iconRaw)}`;
    return {
        id,
        title,
        iconUrl,
        ...(themeIcon !== undefined ? { themeIcon } : {})
    };
}

function normalizeViewsContainers(manifest: BrowserOnlyManifest, vc: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const location of Object.keys(vc)) {
        const loc = location === 'activitybar' ? 'left' : location === 'panel' ? 'bottom' : location;
        const rawList = vc[location];
        const list = Array.isArray(rawList) ? rawList : rawList !== undefined && rawList !== null ? [rawList] : [];
        const normalized = list.map(entry => normalizeViewContainerEntry(manifest, entry));
        const prev = out[loc];
        if (Array.isArray(prev)) {
            out[loc] = [...prev, ...normalized];
        } else {
            out[loc] = normalized;
        }
    }
    return out;
}

/**
 * Mirrors `readThemes` and `readIconThemes` in `scanner-theia.ts` — manifest `path` → `uri`
 * (`IconThemeContribution` / `ThemeContribution`); rewrites under `packagePath` to hosted static paths.
 */
function normalizeThemeLikeContribution(manifest: BrowserOnlyManifest, pluginId: string, entry: unknown): Record<string, unknown> {
    if (!isObject(entry)) {
        return entry as Record<string, unknown>;
    }
    const t = entry as Record<string, unknown>;
    const pkgPath = manifest.packagePath;
    if (typeof t.uri === 'string' && t.uri.length > 0 && typeof pkgPath === 'string') {
        return {
            id: t.id,
            uri: toHostedPluginUri(t.uri, pkgPath, pluginId),
            description: t.description,
            label: t.label,
            uiTheme: t.uiTheme
        };
    }
    if (typeof t.path === 'string' && typeof pkgPath === 'string') {
        const fileUri = pathToFileURL(path.resolve(pkgPath, t.path)).href;
        return {
            id: t.id,
            uri: toHostedPluginUri(fileUri, pkgPath, pluginId),
            description: t.description,
            label: t.label,
            uiTheme: t.uiTheme
        };
    }
    return t;
}

/** Mirrors `readLanguage` — resolves `configuration` file path to embedded `LanguageConfiguration`. */
function normalizeLanguageContribution(manifest: BrowserOnlyManifest, entry: unknown): Record<string, unknown> {
    if (!isObject(entry)) {
        return entry as Record<string, unknown>;
    }
    const lang = entry as Record<string, unknown>;
    const result: Record<string, unknown> = {
        id: lang.id,
        aliases: lang.aliases,
        extensions: lang.extensions,
        filenamePatterns: lang.filenamePatterns,
        filenames: lang.filenames,
        firstLine: lang.firstLine,
        mimetypes: lang.mimetypes
    };
    if (lang.icon !== undefined) {
        const transformed = transformIconUrl(manifest, lang.icon);
        if (transformed !== undefined) {
            const merged = transformed.iconUrl ?? transformed.themeIcon;
            if (merged !== undefined) {
                result.icon = merged;
            }
        }
    }
    const conf = lang.configuration;
    if (conf !== undefined && typeof conf === 'object' && conf !== null && !Array.isArray(conf)) {
        result.configuration = conf;
        return result;
    }
    if (typeof conf === 'string' && typeof manifest.packagePath === 'string') {
        const confPath = path.resolve(manifest.packagePath, conf);
        if (existsSync(confPath)) {
            try {
                result.configuration = JSON.parse(readFileSync(confPath, 'utf8'));
            } catch {
                /* keep without configuration */
            }
        }
    }
    return result;
}

/** Mirrors `GrammarsReader.readGrammar` — loads grammar body from `path`; maps `scopeName` → `scope`. */
function normalizeGrammarContribution(manifest: BrowserOnlyManifest, entry: unknown): Record<string, unknown> {
    if (!isObject(entry)) {
        return entry as Record<string, unknown>;
    }
    const g = entry as Record<string, unknown>;
    if (g.grammar !== undefined) {
        const scope = typeof g.scope === 'string' ? g.scope : g.scopeName;
        return {
            language: g.language,
            scope,
            format: g.format,
            grammar: g.grammar,
            grammarLocation: g.grammarLocation ?? g.path,
            injectTo: g.injectTo,
            embeddedLanguages: g.embeddedLanguages,
            tokenTypes: g.tokenTypes,
            balancedBracketScopes: g.balancedBracketScopes,
            unbalancedBracketScopes: g.unbalancedBracketScopes
        };
    }
    const relPath = typeof g.path === 'string' ? g.path : undefined;
    const pkgPath = manifest.packagePath;
    if (!relPath || typeof pkgPath !== 'string') {
        return g;
    }
    const abs = path.resolve(pkgPath, relPath);
    if (!existsSync(abs)) {
        return g;
    }
    let grammar: string | object;
    const format: 'json' | 'plist' = relPath.endsWith('.json') ? 'json' : 'plist';
    if (format === 'json') {
        grammar = JSON.parse(readFileSync(abs, 'utf8'));
    } else {
        grammar = readFileSync(abs, 'utf8');
    }
    const scopeName = g.scopeName ?? g.scope;
    return {
        language: g.language,
        scope: typeof scopeName === 'string' ? scopeName : '',
        format,
        grammar,
        grammarLocation: relPath,
        injectTo: g.injectTo,
        embeddedLanguages: g.embeddedLanguages,
        tokenTypes: g.tokenTypes
    };
}

/** Mirrors `readSnippets` — manifest `path` → `uri`; `source` from display name / name (body still loaded lazily). */
function normalizeSnippetContribution(manifest: BrowserOnlyManifest, pluginId: string, entry: unknown): Record<string, unknown> {
    if (!isObject(entry)) {
        return entry as Record<string, unknown>;
    }
    const s = entry as Record<string, unknown>;
    const source = manifest.displayName ?? manifest.name;
    const pkgPath = manifest.packagePath;
    if (typeof s.uri === 'string' && s.uri.length > 0 && typeof pkgPath === 'string') {
        return {
            language: s.language,
            source: typeof s.source === 'string' ? s.source : source,
            uri: toHostedPluginUri(s.uri, pkgPath, pluginId)
        };
    }
    if (typeof s.path === 'string' && typeof pkgPath === 'string') {
        const absolute = path.resolve(pkgPath, s.path);
        const fileUri = pathToFileURL(absolute).href;
        return {
            language: s.language,
            source,
            uri: toHostedPluginUri(fileUri, pkgPath, pluginId)
        };
    }
    return s;
}

/**
 * Shapes `manifest.contributes` for static hosting to match `TheiaPluginScanner.readContributions` where the
 * frontend expects the **processed** `PluginContribution` shape (see `plugin-contribution-handler.ts`).
 *
 * Mirrored: array-or-single where needed; `readTaskDefinition`; `readKeybinding`; `readCommand` (original →
 * originalTitle, icon → iconUrl/themeIcon); `readViewWelcome` (contents → content, order); `readSnippets`;
 * `readViewContainer` / viewsContainers remap; `readThemes` / `readIconThemes`; `readIcons` (object → array);
 * `readColors` (highContrast → hc); `readSubmenu` (icon); `readLanguage` (icon); `readTerminals` (terminal →
 * terminalProfiles); `readLanguages` / `readGrammars` (disk); root `activationEvents`. Hosted paths via
 * `toHostedPluginUri` / `toPluginRelativeUrl`.
 *
 * Still omitted: `readConfiguration` scope merge / property owner; `readMenus`, deep debugger loading,
 * `readLocalizations` file expansion, and other async or rarely used paths.
 */
export function normalizeContributions(manifest: BrowserOnlyManifest): void {
    const c = manifest.contributes;

    if (!isObject(c)) {
        return;
    }
    const pluginId = getPluginId(manifest);
    normalizeTerminalProfilesContribution(c);
    if (c.configuration !== undefined && c.configuration !== null) {
        c.configuration = Array.isArray(c.configuration) ? c.configuration : [c.configuration];
    }
    if (c.commands !== undefined && c.commands !== null) {
        const cmds = Array.isArray(c.commands) ? c.commands : [c.commands];
        c.commands = cmds.map(cmd => normalizeCommandContribution(manifest, cmd));
    }
    if (c.keybindings !== undefined && c.keybindings !== null) {
        const kbs = Array.isArray(c.keybindings) ? c.keybindings : [c.keybindings];
        c.keybindings = kbs.map(normalizeKeybindingContribution);
    }
    const pluginViewsIds = extractPluginViewsIds(c.views);
    if (c.viewsWelcome !== undefined && c.viewsWelcome !== null) {
        const list = Array.isArray(c.viewsWelcome) ? c.viewsWelcome : [c.viewsWelcome];
        c.viewsWelcome = list.map(entry => normalizeViewWelcomeEntry(entry, pluginViewsIds));
    }
    if (c.viewsContainers !== undefined && c.viewsContainers !== null && isObject(c.viewsContainers)) {
        c.viewsContainers = normalizeViewsContainers(manifest, c.viewsContainers as Record<string, unknown>);
    }
    if (c.snippets !== undefined && c.snippets !== null) {
        const list = Array.isArray(c.snippets) ? c.snippets : [c.snippets];
        c.snippets = list.map(entry => normalizeSnippetContribution(manifest, pluginId, entry));
    }
    if (c.taskDefinitions !== undefined && c.taskDefinitions !== null) {
        const raw = c.taskDefinitions;
        const list = Array.isArray(raw) ? raw : [raw];
        c.taskDefinitions = list.map(entry => normalizeTaskDefinitionContribution(manifest.name, entry));
    }
    if (c.themes !== undefined && c.themes !== null) {
        const list = Array.isArray(c.themes) ? c.themes : [c.themes];
        c.themes = list.map(entry => normalizeThemeLikeContribution(manifest, pluginId, entry));
    }
    if (c.iconThemes !== undefined && c.iconThemes !== null) {
        const list = Array.isArray(c.iconThemes) ? c.iconThemes : [c.iconThemes];
        c.iconThemes = list.map(entry => normalizeThemeLikeContribution(manifest, pluginId, entry));
    }
    if (c.icons !== undefined && c.icons !== null) {
        c.icons = normalizeIconsContribution(manifest, c.icons, pluginId);
    }
    if (c.colors !== undefined && c.colors !== null) {
        const normalized = normalizeColorsContribution(c.colors);
        if (normalized !== undefined) {
            c.colors = normalized;
        }
    }
    if (c.submenus !== undefined && c.submenus !== null) {
        const list = Array.isArray(c.submenus) ? c.submenus : [c.submenus];
        c.submenus = list.map(entry => normalizeSubmenuContribution(manifest, entry));
    }
    if (c.languages !== undefined && c.languages !== null) {
        const list = Array.isArray(c.languages) ? c.languages : [c.languages];
        c.languages = list.map(entry => normalizeLanguageContribution(manifest, entry));
    }
    if (c.grammars !== undefined && c.grammars !== null) {
        const list = Array.isArray(c.grammars) ? c.grammars : [c.grammars];
        c.grammars = list.map(entry => normalizeGrammarContribution(manifest, entry));
    }
    if (manifest.activationEvents?.length) {
        c.activationEvents = [...manifest.activationEvents];
    }
}

export function resolvePluginRoot(dir: string): string | undefined {
    const direct = path.join(dir, 'package.json');
    if (fs.pathExistsSync(direct)) { return dir; }
    const inExtension = path.join(dir, 'extension', 'package.json');
    if (fs.pathExistsSync(inExtension)) { return path.join(dir, 'extension'); }
    const inPackage = path.join(dir, 'package', 'package.json');
    if (fs.pathExistsSync(inPackage)) { return path.join(dir, 'package'); }
    return undefined;
}

export function hasContributes(pkg: BrowserOnlyManifest): boolean {
    const c = pkg.contributes;
    return !!(c && typeof c === 'object' && Object.keys(c).length > 0);
}

export function shouldIncludePluginInBrowserOnlyBuild(manifest: BrowserOnlyManifest): boolean {
    if (!manifest?.name) { return false; }
    
    return !!manifest.theiaPlugin?.frontend || !!manifest.browser || hasContributes(manifest);
}

export function normalizePluginPackageForBrowserOnly(manifest: BrowserOnlyManifest): void {
    manifest.publisher ??= UNPUBLISHED;
    
    if (manifest.engines) {
        manifest.engines.theiaPlugin = manifest.engines.theiaPlugin ?? manifest.engines.vscode ?? '*';
    } else {
        manifest.engines = { theiaPlugin: '*' };
    }

    if (!manifest.theiaPlugin && manifest.browser) {
        manifest.theiaPlugin = { frontend: manifest.browser as string };
    }
    
    if (manifest.theiaPlugin) {
        delete manifest.theiaPlugin.backend;
        delete manifest.theiaPlugin.headless;
    }

    if (manifest.main) {
        delete manifest.main;
    }
}

export function getPluginId(plugin: { publisher?: string; name: string }): string {
    return `${plugin.publisher}_${plugin.name}`.replace(/\W/g, '_');
}

export function pickEngineType(manifest: BrowserOnlyManifest): 'theiaPlugin' | 'vscode' {
    const candidates = Object.keys(manifest.engines ?? {}).filter(k => k === 'theiaPlugin' || k === 'vscode');
    const first = candidates[0];
    if (first === 'theiaPlugin' || first === 'vscode') {
        return first;
    }
    throw new Error(`No vscode or theiaPlugin engine in ${manifest.name}`);
}

export function getPluginRootFileUrl(manifest: BrowserOnlyManifest, names: string[]): string | undefined {
    const nameSet = new Set(names.map(n => n.toLowerCase()));
    try {
        const dir = readdirSync(manifest.packagePath, { withFileTypes: true });
        for (const dirent of dir) {
            if (dirent.isFile() && nameSet.has(dirent.name.toLowerCase())) {
                return `${PLUGINS_BASE_PATH}/${getPluginId(manifest)}/${encodeURIComponent(dirent.name)}`;
            }
        }
    } catch {
        return undefined;
    }
    return undefined;
}

export function applyTrustExtraction(manifest: BrowserOnlyManifest, model: BrowserOnlyPluginModel): void {
    const untrustedWorkspacesSupport = manifest.capabilities?.untrustedWorkspaces?.supported;
    if (untrustedWorkspacesSupport !== undefined) {
        model.untrustedWorkspacesSupport = untrustedWorkspacesSupport;
    }
}

export function buildEntryPointForVsCode(manifest: BrowserOnlyManifest): PluginEntryPoint {
    const entryPoint: PluginEntryPoint = {};
    const preferFrontend = manifest.extensionKind?.length === 1 && manifest.extensionKind[0] === 'ui';
    if (manifest.browser && (!manifest.main || preferFrontend)) {
        entryPoint.frontend = manifest.browser;
    } else {
        entryPoint.backend = manifest.main;
    }
    if (manifest.theiaPlugin?.headless) {
        entryPoint.headless = manifest.theiaPlugin.headless;
    }
    return entryPoint;
}

export function buildEntryPointForTheia(manifest: BrowserOnlyManifest): PluginEntryPoint {
    return {
        frontend: manifest.theiaPlugin?.frontend,
        backend: manifest.theiaPlugin?.backend
    };
}

export function buildModel(manifest: BrowserOnlyManifest, engineType: 'theiaPlugin' | 'vscode'): BrowserOnlyPluginModel {
    const publisher = manifest.publisher ?? UNPUBLISHED;
    const packageUri = pathToFileURL(manifest.packagePath).href;
    const displayName = manifest.displayName ?? manifest.name;
    const description = manifest.description ?? '';

    if (engineType === 'theiaPlugin') {
        const entryPoint = buildEntryPointForTheia(manifest);
        const model: BrowserOnlyPluginModel = {
            packagePath: manifest.packagePath,
            packageUri,
            id: `${publisher.toLowerCase()}.${manifest.name.toLowerCase()}`,
            name: manifest.name,
            publisher,
            version: manifest.version,
            displayName,
            description,
            l10n: manifest.l10n,
            engine: {
                type: 'theiaPlugin',
                version: manifest.engines?.theiaPlugin ?? '*'
            },
            entryPoint,
            licenseUrl: getPluginRootFileUrl(manifest, ['license', 'license.txt', 'license.md']),
            readmeUrl: getPluginRootFileUrl(manifest, ['readme.md', 'readme.txt', 'readme'])
        };
        applyTrustExtraction(manifest, model);
        return model;
    }

    const entryPoint = buildEntryPointForVsCode(manifest);
    const model: BrowserOnlyPluginModel = {
        packagePath: manifest.packagePath,
        packageUri,
        id: `${publisher.toLowerCase()}.${manifest.name.toLowerCase()}`,
        name: manifest.name,
        publisher,
        version: manifest.version,
        displayName,
        description,
        engine: {
            type: 'vscode',
            version: manifest.engines?.vscode ?? '*'
        },
        entryPoint,
        iconUrl: manifest.icon ? `${PLUGINS_BASE_PATH}/${getPluginId(manifest)}/${encodeURIComponent(manifest.icon)}` : undefined,
        l10n: manifest.l10n,
        readmeUrl: getPluginRootFileUrl(manifest, ['readme.md', 'readme.txt', 'readme']),
        licenseUrl: getPluginRootFileUrl(manifest, ['license', 'license.txt', 'license.md'])
    };
    applyTrustExtraction(manifest, model);
    return model;
}

export function buildLifecycle(manifest: BrowserOnlyManifest, engineType: 'theiaPlugin' | 'vscode'): BrowserOnlyPluginLifecycle {
    if (engineType === 'theiaPlugin') {
        return {
            frontendModuleName: getPluginId(manifest),
            startMethod: THEIA_PLUGIN_START_METHOD,
            stopMethod: THEIA_PLUGIN_STOP_METHOD,
        };
    }
    
    return {
        frontendModuleName: getPluginId(manifest),
        startMethod: VSCODE_EXTENSION_ACTIVATE,
        stopMethod: VSCODE_EXTENSION_DEACTIVATE,
        frontendInitPath: VSCODE_FRONTEND_INIT
    };
}

/**
 * Full browser-only manifest pass: package fields, inferred activation events, and `contributes` shaped for static `list.json`.
 */
export function normalizeManifestForBrowserOnly(manifest: BrowserOnlyManifest): void {
    normalizePluginPackageForBrowserOnly(manifest);
    updateActivationEvents(manifest);
    normalizeContributions(manifest);
}

export async function resolvePluginsSourcePath(applicationPackage: ApplicationPackage): Promise<string> {
    let dir = applicationPackage.projectPath;
    while (true) {
        const pkgPath = path.join(dir, 'package.json');
        if (await fs.pathExists(pkgPath)) {
            const pkg = await fs.readJson(pkgPath) as { theiaPluginsDir?: string };
            if (typeof pkg.theiaPluginsDir === 'string') {
                return path.resolve(dir, pkg.theiaPluginsDir);
            }
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    return path.resolve(applicationPackage.projectPath, DEFAULT_PLUGINS_DIR);
}

export async function loadManifest(pluginPath: string): Promise<BrowserOnlyManifest> {
    const manifest = await fs.readJson(path.join(pluginPath, 'package.json')) as BrowserOnlyManifest;
    if (manifest?.name?.startsWith(VSCODE_BUILTIN_NAME_PREFIX)) {
        manifest.name = manifest.name.substring(VSCODE_BUILTIN_NAME_PREFIX.length);
    }

    const root = path.resolve(pluginPath);
    manifest.packagePath = root;

    normalizeManifestForBrowserOnly(manifest);
    await localizeBrowserOnlyManifest(manifest, root);

    return manifest;
}

export function updateActivationEvents(manifest: BrowserOnlyManifest): void {
    if (!isObject<BrowserOnlyManifest>(manifest) || !manifest.contributes || !isObject(manifest.contributes)) {
        return;
    }
    const c = manifest.contributes;
    if (typeof manifest.activationEvents === 'string') {
        manifest.activationEvents = [manifest.activationEvents];
    }
    const activationEvents = new Set(isStringArray(manifest.activationEvents) ? manifest.activationEvents : []);

    const commands = c.commands;
    if (commands) {
        const list = Array.isArray(commands) ? commands : [commands];
        for (const cmd of list) {
            if (isObject(cmd) && typeof (cmd as { command?: string }).command === 'string') {
                activationEvents.add(`onCommand:${(cmd as { command: string }).command}`);
            }
        }
    }
    if (isObject(c.views)) {
        for (const group of Object.values(c.views as Record<string, unknown[]>)) {
            if (!Array.isArray(group)) { continue; }
            for (const view of group) {
                if (isObject(view) && typeof (view as { id?: string }).id === 'string') {
                    activationEvents.add(`onView:${(view as { id: string }).id}`);
                }
            }
        }
    }
    if (Array.isArray(c.customEditors)) {
        for (const editor of c.customEditors) {
            if (isObject(editor) && typeof (editor as { viewType?: string }).viewType === 'string') {
                activationEvents.add(`onCustomEditor:${(editor as { viewType: string }).viewType}`);
            }
        }
    }
    if (Array.isArray(c.authentication)) {
        for (const auth of c.authentication) {
            if (isObject(auth) && typeof (auth as { id?: string }).id === 'string') {
                activationEvents.add(`onAuthenticationRequest:${(auth as { id: string }).id}`);
            }
        }
    }
    if (Array.isArray(c.languages)) {
        for (const lang of c.languages) {
            if (isObject(lang) && typeof (lang as { id?: string }).id === 'string') {
                activationEvents.add(`onLanguage:${(lang as { id: string }).id}`);
            }
        }
    }
    if (Array.isArray(c.notebooks)) {
        for (const nb of c.notebooks) {
            if (isObject(nb) && typeof (nb as { type?: string }).type === 'string') {
                activationEvents.add(`onNotebookSerializer:${(nb as { type: string }).type}`);
            }
        }
    }
    manifest.activationEvents = Array.from(activationEvents);
}

export function toHostedPluginUri(fileUri: string, pluginRoot: string, pluginId: string): string {
    if (!fileUri.startsWith('file://')) {
        return fileUri;
    }
    try {
        const filePath = fileURLToPath(fileUri);
        const normalizedRoot = path.resolve(pluginRoot);
        const normalizedPath = path.resolve(filePath);
        if (!normalizedPath.startsWith(normalizedRoot + path.sep) && normalizedPath !== normalizedRoot) {
            return fileUri;
        }
        const relative = path.relative(normalizedRoot, normalizedPath);
        return `${PLUGINS_BASE_PATH}/${pluginId}/${relative.split(path.sep).join('/')}`;
    } catch {
        return fileUri;
    }
}

export async function resolvePluginEntryFile(absolutePath: string): Promise<string | undefined> {
    const candidates = [absolutePath];
    const pathExtension = path.extname(absolutePath).toLowerCase();
    if (!pathExtension) {
        candidates.push(absolutePath + '.js');
        candidates.push(absolutePath + '.cjs');
        candidates.push(absolutePath + '.mjs');
    }
    for (const candidate of candidates) {
        try {
            const stats = await fs.stat(candidate);
            if (stats.isFile()) {
                return candidate;
            }
        } catch {
            // try next
        }
    }
    return undefined;
}

