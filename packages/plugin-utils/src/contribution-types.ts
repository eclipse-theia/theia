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

import type {
    ColorDefinition,
    IJSONSchema,
    IJSONSchemaSnippet,
    JSONObject,
    PreferenceSchema,
    TaskDefinition,
} from './protocol-shims';
import type { PluginManifest } from './manifest-types';

export type { JSONObject } from './protocol-shims';

/**
 * Raw `contributes` section from `package.json` before normalization.
 * Fields that depend on `@theia/core` / `@theia/task` are typed as `unknown` here;
 * `@theia/plugin-ext` overrides them with stricter types.
 */
export interface PluginManifestContribution {
    authentication?: PluginPackageAuthenticationProvider[];
    configuration?: JSONObject | JSONObject[];
    configurationDefaults?: JSONObject;
    languages?: PluginPackageLanguageContribution[];
    grammars?: PluginPackageGrammarsContribution[];
    customEditors?: PluginPackageCustomEditor[];
    viewsContainers?: { [location: string]: PluginPackageViewContainer[] };
    views?: { [location: string]: PluginPackageView[] };
    viewsWelcome?: PluginPackageViewWelcome[];
    commands?: PluginPackageCommand | PluginPackageCommand[];
    menus?: { [location: string]: PluginPackageMenu[] };
    submenus?: PluginPackageSubmenu[];
    keybindings?: PluginPackageKeybinding | PluginPackageKeybinding[];
    debuggers?: PluginPackageDebuggersContribution[];
    snippets?: PluginPackageSnippetsContribution[];
    themes?: PluginThemeContribution[];
    iconThemes?: PluginIconThemeContribution[];
    icons?: PluginIconContribution[];
    colors?: PluginColorContribution[];
    taskDefinitions?: PluginTaskDefinitionContribution[];
    problemMatchers?: unknown;
    problemPatterns?: unknown;
    jsonValidation?: PluginJsonValidationContribution[];
    resourceLabelFormatters?: unknown;
    localizations?: PluginPackageLocalization[];
    terminal?: PluginPackageTerminal;
    notebooks?: PluginPackageNotebook[];
    notebookRenderer?: PluginNotebookRendererContribution[];
    notebookPreload?: PluginPackageNotebookPreload[];
    mcpServerDefinitionProviders?: PluginPackageMcpServerDefinitionProviderContribution[];
    languageModelTools?: PluginPackageLanguageModelToolContribution[];
}

export interface PluginPackageNotebook {
    type: string;
    displayName: string;
    selector?: readonly { filenamePattern?: string; excludeFileNamePattern?: string }[];
    priority?: string;
}

export interface PluginNotebookRendererContribution {
    readonly id: string;
    readonly displayName: string;
    readonly mimeTypes: string[];
    readonly entrypoint: string | { readonly extends: string; readonly path: string };
    readonly requiresMessaging?: 'always' | 'optional' | 'never';
}

export interface PluginPackageNotebookPreload {
    type: string;
    entrypoint: string;
}

export interface PluginPackageMcpServerDefinitionProviderContribution {
    id: string;
    label: string;
    description?: string;
}

export interface PluginPackageLanguageModelToolContribution {
    name: string;
    modelDescription?: string;
    userDescription?: string;
    inputSchema?: object;
    tags?: string[];
}

export interface PluginPackageAuthenticationProvider {
    id: string;
    label: string;
}

export interface PluginPackageTerminalProfile {
    title: string;
    id: string;
    icon?: string;
}

export interface PluginPackageTerminal {
    profiles: PluginPackageTerminalProfile[];
}

export interface PluginPackageLocalization {
    languageId: string;
    languageName?: string;
    localizedLanguageName?: string;
    translations: PluginPackageTranslation[];
    minimalTranslations?: { [key: string]: string };
}

export interface PluginPackageTranslation {
    id: string;
    path: string;
}

export interface PluginPackageCustomEditor {
    viewType: string;
    displayName: string;
    selector?: CustomEditorSelector[];
    priority?: CustomEditorPriority;
}

export interface CustomEditorSelector {
    readonly filenamePattern?: string;
}

export enum CustomEditorPriority {
    default = 'default',
    builtin = 'builtin',
    option = 'option',
}

export interface PluginPackageViewContainer {
    id: string;
    title: string;
    icon: string;
    when?: string;
}

export enum PluginViewType {
    Tree = 'tree',
    Webview = 'webview'
}

export interface PluginPackageView {
    id: string;
    name: string;
    when?: string;
    type?: string;
}

export interface PluginPackageViewWelcome {
    view: string;
    contents: string;
    when?: string;
    enablement?: string;
}

export interface PluginPackageCommand {
    command: string;
    title: string;
    shortTitle?: string;
    original?: string;
    category?: string;
    icon?: string | { light: string; dark: string; };
    enablement?: string;
}

export interface PluginPackageMenu {
    command?: string;
    submenu?: string;
    alt?: string;
    group?: string;
    when?: string;
}

export type IconUrl = string | { light: string; dark: string; };

export interface PluginPackageSubmenu {
    id: string;
    label: string;
    icon: IconUrl;
}

export interface PluginPackageKeybinding {
    key?: string;
    command: string;
    when?: string;
    mac?: string;
    linux?: string;
    win?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args?: any;
}

export interface PluginPackageGrammarsContribution {
    language?: string;
    scopeName: string;
    path: string;
    embeddedLanguages?: ScopeMap;
    tokenTypes?: ScopeMap;
    injectTo?: string[];
}

export interface ScopeMap {
    [scopeName: string]: string;
}

export interface PluginPackageSnippetsContribution {
    language?: string;
    path?: string;
}

export interface PluginColorContribution {
    id?: string;
    description?: string;
    defaults?: { light?: string, dark?: string, highContrast?: string };
}

export type PluginUiTheme = 'vs' | 'vs-dark' | 'hc-black';

export interface PluginThemeContribution {
    id?: string;
    label?: string;
    description?: string;
    path?: string;
    uiTheme?: PluginUiTheme;
}

export interface PluginIconThemeContribution {
    id?: string;
    label?: string;
    description?: string;
    path?: string;
    uiTheme?: PluginUiTheme;
}

export interface PluginIconContribution {
    [id: string]: {
        description: string;
        default: { fontPath: string; fontCharacter: string } | string;
    };
}

export interface PlatformSpecificAdapterContribution {
    program?: string;
    args?: string[];
    runtime?: string;
    runtimeArgs?: string[];
}

export interface PluginPackageDebuggersContribution extends PlatformSpecificAdapterContribution {
    type: string;
    label?: string;
    languages?: string[];
    enableBreakpointsFor?: { languageIds: string[] };
    configurationAttributes: { [request: string]: IJSONSchema };
    configurationSnippets: IJSONSchemaSnippet[];
    variables?: ScopeMap;
    adapterExecutableCommand?: string;
    win?: PlatformSpecificAdapterContribution;
    winx86?: PlatformSpecificAdapterContribution;
    windows?: PlatformSpecificAdapterContribution;
    osx?: PlatformSpecificAdapterContribution;
    linux?: PlatformSpecificAdapterContribution;
}

export interface PluginPackageLanguageContribution {
    id: string;
    extensions?: string[];
    filenames?: string[];
    filenamePatterns?: string[];
    firstLine?: string;
    aliases?: string[];
    mimetypes?: string[];
    configuration?: string;
    icon?: IconUrl;
}

export type CharacterPair = [string, string];

export interface LineCommentRule {
    comment: string;
    noIndent?: boolean;
}

export interface CommentRule {
    lineComment?: string | LineCommentRule;
    blockComment?: CharacterPair;
}

export interface RegExpOptions {
    pattern: string;
    flags?: string;
}

export interface PluginPackageLanguageContributionConfiguration {
    comments?: CommentRule;
    brackets?: CharacterPair[];
    autoClosingPairs?: (CharacterPair | AutoClosingPairConditional)[];
    surroundingPairs?: (CharacterPair | AutoClosingPair)[];
    wordPattern?: string;
    indentationRules?: IndentationRules;
    folding?: FoldingRules;
    onEnterRules?: OnEnterRule[];
}

export interface IndentationRules {
    increaseIndentPattern: string | RegExpOptions;
    decreaseIndentPattern: string | RegExpOptions;
    unIndentedLinePattern?: string | RegExpOptions;
    indentNextLinePattern?: string | RegExpOptions;
}

export interface AutoClosingPair {
    close: string;
    open: string;
}

export interface AutoClosingPairConditional extends AutoClosingPair {
    notIn?: string[];
}

export interface FoldingMarkers {
    start: string | RegExpOptions;
    end: string | RegExpOptions;
}

export interface FoldingRules {
    offSide?: boolean;
    markers?: FoldingMarkers;
}

export interface OnEnterRule {
    beforeText: string | RegExpOptions;
    afterText?: string | RegExpOptions;
    previousLineText?: string | RegExpOptions;
    action: EnterAction;
}

export interface EnterAction {
    indent: 'none' | 'indent' | 'outdent' | 'indentOutdent';
    appendText?: string;
    removeText?: number;
}

export interface PluginTaskDefinitionContribution {
    type: string;
    required: string[];
    properties?: IJSONSchema['properties'];
}

export interface PluginJsonValidationContribution {
    fileMatch: string | string[];
    url: string;
}

type ConfigurationScopeString = 'machine-overridable' | 'window' | 'resource' | 'language-overridable' | 'application' | 'machine';

type EditPresentationTypes = 'multilineText' | 'singleLineText';

export interface IConfigurationPropertySchema extends IJSONSchema {
    scope?: ConfigurationScopeString;
    included?: boolean;
    tags?: string[];
    editPresentation?: EditPresentationTypes;
    order?: number;
}

export interface IExtensionInfo {
    id: string;
    displayName?: string;
}

export interface IConfigurationNode {
    title?: string;
    description?: string;
    properties?: Record<string, IConfigurationPropertySchema>;
    scope?: ConfigurationScopeString;
}

export interface NormalizeContributionsContext<TPlugin extends PluginManifest = PluginManifest> {
    plugin: TPlugin;
    resolveUrl(relativePath: string): string;
    resolveUri(pck: TPlugin, relativePath: string): string;
    onError(type: string, err: unknown, detail?: unknown): void;
    onWarn(msg: string): void;
    readJsonFile?(filePath: string): Promise<unknown | undefined>;
    readGrammars?(grammars: readonly unknown[], pluginPath: string): Promise<unknown[] | undefined>;
    readConfiguration?(rawConfiguration: IConfigurationNode, pluginPath: string): PreferenceSchema | undefined;
    readSubmenus?(submenus: readonly RawSubmenu[], plugin: TPlugin): NormalizedSubmenu[];
    readCustomEditors?(customEditors: readonly RawCustomEditor[]): NormalizedCustomEditor[];
    readViewsContainers?(containers: readonly RawViewContainer[], plugin: TPlugin): NormalizedViewContainer[];
    readViews?(views: readonly RawView[]): RawView[];
    readViewsWelcome?(welcome: readonly RawViewWelcome[], views: ViewsByLocation | undefined): NormalizedViewWelcome[];
    readCommand?(command: RawCommand, plugin: TPlugin): NormalizedCommand;
    readMenus?(menus: readonly RawMenu[]): RawMenu[];
    readKeybinding?(keybinding: RawKeybinding): NormalizedKeybinding;
    readDebuggers?(debuggers: readonly RawDebugger[]): RawDebugger[];
    readTaskDefinition?(pluginName: string, definition: RawTaskDefinition): TaskDefinition;
    readSnippets?(plugin: TPlugin): NormalizedSnippet[] | undefined;
    readThemes?(plugin: TPlugin): NormalizedTheme[] | undefined;
    readIcons?(plugin: TPlugin): NormalizedIcon[] | undefined;
    readIconThemes?(plugin: TPlugin): NormalizedIconTheme[] | undefined;
    readColors?(plugin: TPlugin): ColorDefinition[] | undefined;
    readTerminals?(plugin: TPlugin): NormalizedTerminalProfile[] | undefined;
    readLocalizations?(plugin: TPlugin): NormalizedLocalization[] | undefined;
    readLanguages?(languages: readonly RawLanguage[], plugin: TPlugin): Promise<NormalizedLanguage[] | undefined>;
}

export type RawCommand = PluginPackageCommand;

export interface NormalizedCommand {
    command: string;
    title: string;
    shortTitle?: string;
    originalTitle?: string;
    category?: string;
    iconUrl?: IconUrl;
    themeIcon?: string;
    enablement?: string;
}

export type RawKeybinding = PluginPackageKeybinding;

export interface NormalizedKeybinding {
    keybinding?: string;
    command: string;
    when?: string;
    mac?: string;
    linux?: string;
    win?: string;
    args?: unknown;
}

export type RawSubmenu = PluginPackageSubmenu;

export interface NormalizedSubmenu {
    id: string;
    label: string;
    icon?: IconUrl | string;
}

export type RawViewContainer = PluginPackageViewContainer;

export interface NormalizedViewContainer {
    id: string;
    title: string;
    iconUrl: string;
    themeIcon?: string;
    when?: string;
}

export type RawView = PluginPackageView;

export type RawViewWelcome = PluginPackageViewWelcome;

export interface NormalizedViewWelcome {
    view: string;
    content: string;
    when?: string;
    enablement?: string;
    order: number;
}

export type ViewsByLocation = Record<string, readonly RawView[]>;

export interface RawCustomEditor {
    viewType: string;
    displayName: string;
    selector?: unknown;
    priority?: string;
}

export interface NormalizedCustomEditor {
    viewType: string;
    displayName: string;
    selector: unknown;
    priority: CustomEditorPriority;
}

export type RawMenu = PluginPackageMenu;

export type RawTranslation = PluginPackageTranslation;

export interface RawLocalization {
    languageId: string;
    languageName?: string;
    localizedLanguageName?: string;
    translations?: readonly RawTranslation[];
}

export interface NormalizedLocalization {
    languageId: string;
    languageName?: string;
    localizedLanguageName?: string;
    translations: NormalizedTranslation[];
}

export interface NormalizedTranslation {
    id: string;
    path: string;
}

export type RawLanguage = PluginPackageLanguageContribution;

export interface NormalizedLanguageConfiguration {
    brackets?: CharacterPair[];
    comments?: unknown;
    folding?: unknown;
    wordPattern?: string;
    autoClosingPairs?: AutoClosingPairConditional[];
    indentationRules?: unknown;
    surroundingPairs?: AutoClosingPair[];
    onEnterRules?: unknown[];
}

export interface NormalizedLanguage {
    id: string;
    aliases?: string[];
    extensions?: string[];
    filenamePatterns?: string[];
    filenames?: string[];
    firstLine?: string;
    mimetypes?: string[];
    icon?: IconUrl | string;
    configuration?: NormalizedLanguageConfiguration;
}

export interface RawTaskDefinition {
    type: string;
    required: string[];
    properties?: Record<string, unknown>;
}

export interface RawDebugger {
    type: string;
    label?: string;
    languages?: string[];
    enableBreakpointsFor?: unknown;
    variables?: unknown;
    adapterExecutableCommand?: string;
    configurationSnippets?: unknown;
    win?: unknown;
    winx86?: unknown;
    windows?: unknown;
    osx?: unknown;
    linux?: unknown;
    program?: string;
    args?: unknown;
    runtime?: string;
    runtimeArgs?: unknown;
    configurationAttributes?: unknown;
}

export type RawSnippet = PluginPackageSnippetsContribution;

export interface NormalizedSnippet {
    language?: string;
    source: string;
    uri: string;
}

export type RawTheme = PluginThemeContribution;

export interface NormalizedTheme {
    id?: string;
    uri: string;
    description?: string;
    label?: string;
    uiTheme?: string;
}

export type RawIconTheme = PluginIconThemeContribution;

export interface NormalizedIconTheme {
    id: string;
    uri: string;
    description?: string;
    label?: string;
    uiTheme?: string;
}

export interface NormalizedIcon {
    id: string;
    extensionId: string;
    description: string;
    defaults: { id: string } | { fontCharacter: string; location: string };
}

export interface NormalizedTerminalProfile {
    id: string;
    title: string;
}
