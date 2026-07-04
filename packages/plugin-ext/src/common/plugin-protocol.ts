// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
import { RpcServer } from '@theia/core/lib/common/messaging/proxy-factory';
import { RPCProtocol } from './rpc-protocol';
import { Disposable } from '@theia/core/lib/common/disposable';
import { LogPart, KeysToAnyValues, KeysToKeysToAnyValue } from './types';
import { CharacterPair, CommentRule, PluginAPIFactory, Plugin, ThemeIcon } from './plugin-api-rpc';
import { ExtPluginApi } from './plugin-ext-api-contribution';
import { IJSONSchema, IJSONSchemaSnippet } from '@theia/core/lib/common/json-schema';
import { ProblemMatcherContribution, ProblemPatternContribution, TaskDefinition } from '@theia/task/lib/common';
import { ColorDefinition } from '@theia/core/lib/common/color';
import { ResourceLabelFormatter } from '@theia/core/lib/common/label-protocol';
import { PreferenceSchema } from '@theia/core';
import { PluginIdentifiers } from './plugin-identifiers';
import {
    getPluginId,
    toPluginUrl as toPluginUrlFromUtils
} from '@theia/plugin-utils/lib/plugin-model';
import {
    PLUGIN_HOST_BACKEND,
    PluginEntryPoint,
    PluginLifecycle,
    PluginManifest,
    PluginMetadata,
    PluginModel,
    PluginPackageCapabilities,
    PluginType,
} from '@theia/plugin-utils/lib/manifest-types';
import {
    AutoClosingPair,
    AutoClosingPairConditional,
    CustomEditorPriority,
    CustomEditorSelector,
    EnterAction,
    FoldingMarkers,
    FoldingRules,
    type IconUrl,
    IndentationRules,
    type JSONObject,
    OnEnterRule,
    PluginColorContribution,
    PluginIconContribution,
    PluginIconThemeContribution,
    PluginJsonValidationContribution,
    PluginManifestContribution,
    PluginNotebookRendererContribution,
    PluginPackageAuthenticationProvider,
    PluginPackageCommand,
    PluginPackageCustomEditor,
    PluginPackageDebuggersContribution,
    PluginPackageGrammarsContribution,
    PluginPackageKeybinding,
    PluginPackageLanguageContribution,
    PluginPackageLanguageContributionConfiguration,
    PluginPackageLanguageModelToolContribution,
    PluginPackageLocalization,
    PluginPackageMcpServerDefinitionProviderContribution,
    PluginPackageMenu,
    PluginPackageNotebook,
    PluginPackageNotebookPreload,
    PluginPackageSnippetsContribution,
    PluginPackageSubmenu,
    PluginPackageTerminal,
    PluginPackageTerminalProfile,
    PluginPackageTranslation,
    PluginPackageView,
    PluginPackageViewContainer,
    PluginPackageViewWelcome,
    PluginTaskDefinitionContribution,
    PluginThemeContribution,
    PluginUiTheme,
    PluginViewType,
    PlatformSpecificAdapterContribution,
    RegExpOptions,
    ScopeMap,
} from '@theia/plugin-utils/lib/contribution-types';

export { PluginIdentifiers };
export { getPluginId };
export { toPluginUrlFromUtils as toPluginUrl };
export {
    PLUGIN_HOST_BACKEND,
    PluginEntryPoint,
    PluginLifecycle,
    PluginManifest,
    PluginModel,
    PluginPackageCapabilities,
    PluginMetadata,
    PluginType
};
export const hostedServicePath = '/services/hostedPlugin';

/**
 * Plugin engine (API) type, i.e. 'theiaPlugin', 'vscode', 'theiaHeadlessPlugin', etc.
 */
export type PluginEngine = string;

/**
 * Loaded plugin package with stricter fields used by `@theia/plugin-ext`.
 */
export interface PluginPackage extends PluginManifest {
    // The publisher is not guaranteed to be defined for unpublished plugins. https://github.com/microsoft/vscode-vsce/commit/a38657ece04c20e4fbde15d5ac1ed39ca51cb856
    publisher: string | undefined;
    engines: {
        [type in PluginEngine]: string;
    };
    displayName: string;
    description: string;
    contributes?: PluginPackageContribution;
}
export namespace PluginPackage {
    export const toPluginUrl = toPluginUrlFromUtils;
}

export {
    AutoClosingPair,
    AutoClosingPairConditional,
    CustomEditorPriority,
    CustomEditorSelector,
    EnterAction,
    FoldingMarkers,
    FoldingRules,
    IndentationRules,
    OnEnterRule,
    PluginColorContribution,
    PluginIconContribution,
    PluginIconThemeContribution,
    PluginJsonValidationContribution,
    PluginManifestContribution,
    PluginNotebookRendererContribution,
    PluginPackageAuthenticationProvider,
    PluginPackageCommand,
    PluginPackageCustomEditor,
    PluginPackageDebuggersContribution,
    PluginPackageGrammarsContribution,
    PluginPackageKeybinding,
    PluginPackageLanguageContribution,
    PluginPackageLanguageContributionConfiguration,
    PluginPackageLanguageModelToolContribution,
    PluginPackageLocalization,
    PluginPackageMcpServerDefinitionProviderContribution,
    PluginPackageMenu,
    PluginPackageNotebook,
    PluginPackageNotebookPreload,
    PluginPackageSnippetsContribution,
    PluginPackageSubmenu,
    PluginPackageTerminal,
    PluginPackageTerminalProfile,
    PluginPackageTranslation,
    PluginPackageView,
    PluginPackageViewContainer,
    PluginPackageViewWelcome,
    PluginTaskDefinitionContribution,
    PluginThemeContribution,
    PluginUiTheme,
    PluginViewType,
    PlatformSpecificAdapterContribution,
    RegExpOptions,
    ScopeMap,
    type IconUrl,
    type JSONObject,
};

/**
 * Strict `contributes` typing for scanned plugin packages.
 */
export interface PluginPackageContribution extends PluginManifestContribution {
    problemMatchers?: PluginProblemMatcherContribution[];
    problemPatterns?: PluginProblemPatternContribution[];
    resourceLabelFormatters?: ResourceLabelFormatter[];
}

export interface PluginProblemMatcherContribution extends ProblemMatcherContribution {
    name: string;
}

export interface PluginProblemPatternContribution extends ProblemPatternContribution {
    name: string;
}

export const PluginScanner = Symbol('PluginScanner');
/**
 * This scanner process package.json object and returns plugin metadata objects.
 */
export interface PluginScanner {
    /**
     * The type of plugin's API (engine name)
     */
    apiType: PluginEngine;

    /**
     * Creates plugin's model.
     *
     * @param {PluginPackage} plugin
     * @returns {PluginModel}
     */
    getModel(plugin: PluginPackage): PluginModel;

    /**
     * Creates plugin's lifecycle.
     *
     * @returns {PluginLifecycle}
     */
    getLifecycle(plugin: PluginPackage): PluginLifecycle;

    getContribution(plugin: PluginPackage): Promise<PluginContribution | undefined>;

    /**
     * A mapping between a dependency as its defined in package.json
     * and its deployable form, e.g. `publisher.name` -> `vscode:extension/publisher.name`
     */
    getDependencies(plugin: PluginPackage): Map<string, string> | undefined;
}

/**
 * A plugin resolver is handling how to resolve a plugin link into a local resource.
 */
export const PluginDeployerResolver = Symbol('PluginDeployerResolver');
/**
 * A resolver handle a set of resource
 */
export interface PluginDeployerResolver {

    init?(pluginDeployerResolverInit: PluginDeployerResolverInit): void;

    accept(pluginSourceId: string): boolean;

    resolve(pluginResolverContext: PluginDeployerResolverContext, options?: PluginDeployOptions): Promise<void>;

}

export const PluginDeployerDirectoryHandler = Symbol('PluginDeployerDirectoryHandler');
export interface PluginDeployerDirectoryHandler {
    accept(pluginDeployerEntry: PluginDeployerEntry): Promise<boolean>;

    handle(context: PluginDeployerDirectoryHandlerContext): Promise<void>;
}

export const PluginDeployerFileHandler = Symbol('PluginDeployerFileHandler');
export interface PluginDeployerFileHandler {

    accept(pluginDeployerEntry: PluginDeployerEntry): Promise<boolean>;

    handle(context: PluginDeployerFileHandlerContext): Promise<void>;
}

export interface PluginDeployerResolverInit {

}

export interface PluginDeployerResolverContext {

    addPlugin(pluginId: string, path: string): void;

    getPlugins(): PluginDeployerEntry[];

    getOriginId(): string;

}

export interface PluginDeployerStartContext {
    readonly userEntries: string[]
    readonly systemEntries: string[]
}

export const PluginDeployer = Symbol('PluginDeployer');
export interface PluginDeployer {

    start(): Promise<void>;

}

export const PluginDeployerParticipant = Symbol('PluginDeployerParticipant');
/**
 * A participant can hook into the plugin deployer lifecycle.
 */
export interface PluginDeployerParticipant {
    onWillStart?(context: PluginDeployerStartContext): Promise<void>;
}

export enum PluginDeployerEntryType {

    FRONTEND,

    BACKEND,

    HEADLESS // Deployed in the Theia Node server outside the context of a frontend/backend connection
}

export interface UnresolvedPluginEntry {
    id: string;
    type?: PluginType;
}

export interface PluginDeployerEntry {

    /**
     * ID (before any resolution)
     */
    id(): string;

    /**
     * Original resolved path
     */
    originalPath(): string;

    /**
     * Local path on the filesystem.
     */
    path(): string;

    /**
     * Get a specific entry
     */
    getValue<T>(key: string): T;

    /**
     * Store a value
     */
    storeValue<T>(key: string, value: T): void;

    /**
     * Update path
     */
    updatePath(newPath: string): void;

    getChanges(): string[];

    isFile(): Promise<boolean>;

    isDirectory(): Promise<boolean>;

    /**
     * Resolved if a resolver has handle this plugin
     */
    isResolved(): boolean;

    resolvedBy(): string;

    /**
     * Accepted when a handler is telling this location can go live
     */
    isAccepted(...types: PluginDeployerEntryType[]): boolean;

    accept(...types: PluginDeployerEntryType[]): void;

    hasError(): boolean;

    type: PluginType
    /**
     * A fs path to a directory where a plugin is located.
     * Depending on a plugin format it can be different from `path`.
     * Use `path` if you want to resolve something within a plugin, like `README.md` file.
     * Use `rootPath` if you want to manipulate the entire plugin location, like delete or move it.
     */
    rootPath: string
}

export interface PluginDeployerFileHandlerContext {

    unzip(sourcePath: string, destPath: string): Promise<void>;

    pluginEntry(): PluginDeployerEntry;

}

export interface PluginDeployerDirectoryHandlerContext {

    copy(origin: string, target: string): Promise<void>;

    pluginEntry(): PluginDeployerEntry;

}

/**
 * This interface describes some static plugin contributions.
 */
export interface PluginContribution {
    activationEvents?: string[];
    authentication?: AuthenticationProviderInformation[];
    configuration?: PreferenceSchema[];
    configurationDefaults?: JSONObject;
    languages?: LanguageContribution[];
    grammars?: GrammarsContribution[];
    customEditors?: CustomEditor[];
    viewsContainers?: { [location: string]: ViewContainer[] };
    views?: { [location: string]: View[] };
    viewsWelcome?: ViewWelcome[];
    commands?: PluginCommand[];
    menus?: { [location: string]: Menu[] };
    submenus?: Submenu[];
    keybindings?: Keybinding[];
    debuggers?: DebuggerContribution[];
    snippets?: SnippetContribution[];
    themes?: ThemeContribution[];
    iconThemes?: IconThemeContribution[];
    icons?: IconContribution[];
    colors?: ColorDefinition[];
    taskDefinitions?: TaskDefinition[];
    problemMatchers?: ProblemMatcherContribution[];
    problemPatterns?: ProblemPatternContribution[];
    resourceLabelFormatters?: ResourceLabelFormatter[];
    localizations?: Localization[];
    terminalProfiles?: TerminalProfile[];
    notebooks?: NotebookContribution[];
    notebookRenderer?: NotebookRendererContribution[];
    notebookPreload?: notebookPreloadContribution[];
}
export interface NotebookContribution {
    type: string;
    displayName: string;
    selector?: readonly { filenamePattern?: string; excludeFileNamePattern?: string }[];
    priority?: string;
}

export interface NotebookRendererContribution {
    readonly id: string;
    readonly displayName: string;
    readonly mimeTypes: string[];
    readonly entrypoint: string | { readonly extends: string; readonly path: string };
    readonly requiresMessaging?: 'always' | 'optional' | 'never'
}

export interface notebookPreloadContribution {
    type: string;
    entrypoint: string;
}

export interface AuthenticationProviderInformation {
    id: string;
    label: string;
}

export interface TerminalProfile {
    title: string,
    id: string,
    icon?: string
}

export interface Localization {
    languageId: string;
    languageName?: string;
    localizedLanguageName?: string;
    translations: Translation[];
    minimalTranslations?: { [key: string]: string };
}

export interface Translation {
    id: string;
    path: string;
    cachedContents?: { [scope: string]: { [key: string]: string } };
}

export interface SnippetContribution {
    uri: string
    source: string
    language?: string
}

export type UiTheme = 'vs' | 'vs-dark' | 'hc-black';

export interface ThemeContribution {
    id?: string;
    label?: string;
    description?: string;
    uri: string;
    uiTheme?: UiTheme;
}

export interface IconThemeContribution {
    id: string;
    label?: string;
    description?: string;
    uri: string;
    uiTheme?: UiTheme;
}

export interface IconDefinition {
    fontCharacter: string;
    location: string;
}

export type IconDefaults = ThemeIcon | IconDefinition;

export interface IconContribution {
    id: string;
    extensionId: string;
    description: string | undefined;
    defaults: IconDefaults;
}

export namespace IconContribution {
    export function isIconDefinition(defaults: IconDefaults): defaults is IconDefinition {
        return 'fontCharacter' in defaults;
    }
}

export interface GrammarsContribution {
    format: 'json' | 'plist';
    language?: string;
    scope: string;
    grammar?: string | object;
    grammarLocation?: string;
    embeddedLanguages?: ScopeMap;
    tokenTypes?: ScopeMap;
    injectTo?: string[];
    balancedBracketScopes?: string[];
    unbalancedBracketScopes?: string[];
}

/**
 * The language contribution
 */
export interface LanguageContribution {
    id: string;
    extensions?: string[];
    filenames?: string[];
    filenamePatterns?: string[];
    firstLine?: string;
    aliases?: string[];
    mimetypes?: string[];
    configuration?: LanguageConfiguration;
    /**
     * @internal
     */
    icon?: IconUrl;
}

export interface LanguageConfiguration {
    brackets?: CharacterPair[];
    indentationRules?: IndentationRules;
    surroundingPairs?: AutoClosingPair[];
    autoClosingPairs?: AutoClosingPairConditional[];
    comments?: CommentRule;
    folding?: FoldingRules;
    wordPattern?: string | RegExpOptions;
    onEnterRules?: OnEnterRule[];
}

/**
 * This interface describes a package.json debuggers contribution section object.
 */
export interface DebuggerContribution extends PlatformSpecificAdapterContribution {
    type: string,
    label?: string,
    languages?: string[],
    enableBreakpointsFor?: {
        languageIds: string[]
    },
    configurationAttributes?: {
        [request: string]: IJSONSchema
    },
    configurationSnippets?: IJSONSchemaSnippet[],
    variables?: ScopeMap,
    adapterExecutableCommand?: string
    win?: PlatformSpecificAdapterContribution;
    winx86?: PlatformSpecificAdapterContribution;
    windows?: PlatformSpecificAdapterContribution;
    osx?: PlatformSpecificAdapterContribution;
    linux?: PlatformSpecificAdapterContribution;
}

/**
 * Custom Editors contribution
 */
export interface CustomEditor {
    viewType: string;
    displayName: string;
    selector: CustomEditorSelector[];
    priority: CustomEditorPriority;
}

/**
 * Views Containers contribution
 */
export interface ViewContainer {
    id: string;
    title: string;
    iconUrl: string;
    themeIcon?: string;
    when?: string;
}

/**
 * View contribution
 */
export interface View {
    id: string;
    name: string;
    when?: string;
    type?: string;
}

/**
 * View Welcome contribution
 */
export interface ViewWelcome {
    view: string;
    content: string;
    when?: string;
    enablement?: string;
    order: number;
}

export interface PluginCommand {
    command: string;
    title: string;
    shortTitle?: string;
    originalTitle?: string;
    category?: string;
    iconUrl?: IconUrl;
    themeIcon?: string;
    enablement?: string;
}

/**
 * Menu contribution
 */
export interface Menu {
    command?: string;
    submenu?: string
    alt?: string;
    group?: string;
    when?: string;
}

export interface Submenu {
    id: string;
    label: string;
    icon?: IconUrl;
}

/**
 * Keybinding contribution
 */
export interface Keybinding {
    keybinding?: string;
    command: string;
    when?: string;
    mac?: string;
    linux?: string;
    win?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args?: any;
}

/**
 * The export function of initialization module of backend plugin.
 */
export interface BackendInitializationFn {
    (apiFactory: PluginAPIFactory, plugin: Plugin): void;
}

export interface BackendLoadingFn {
    (rpc: RPCProtocol, plugin: Plugin): void;
}

export interface PluginContext {
    subscriptions: Disposable[];
}

export interface ExtensionContext {
    subscriptions: Disposable[];
}

export const MetadataProcessor = Symbol('MetadataProcessor');
export interface MetadataProcessor {
    process(pluginMetadata: PluginMetadata): void;
}

export const HostedPluginClient = Symbol('HostedPluginClient');
export interface HostedPluginClient {
    postMessage(pluginHost: string, buffer: Uint8Array): Promise<void>;

    log(logPart: LogPart): void;

    onDidDeploy(): void;
}

export interface PluginDependencies {
    metadata: PluginMetadata
    /**
     * Actual listing of plugin dependencies.
     * Mapping from {@link PluginIdentifiers.UnversionedId external representation} of plugin identity to a string
     * that can be used to identify the resolver for the specific plugin case, e.g. with scheme `vscode://<id>`.
     */
    mapping?: Map<string, string>
}

export const PluginDeployerHandler = Symbol('PluginDeployerHandler');
export interface PluginDeployerHandler {
    deployFrontendPlugins(frontendPlugins: PluginDeployerEntry[]): Promise<number | undefined>;
    deployBackendPlugins(backendPlugins: PluginDeployerEntry[]): Promise<number | undefined>;
    getDeployedPluginIds(): Promise<readonly PluginIdentifiers.VersionedId[]>;

    getDeployedPlugins(): Promise<DeployedPlugin[]>;
    getDeployedPluginsById(pluginId: string): DeployedPlugin[];

    getDeployedPlugin(pluginId: PluginIdentifiers.VersionedId): DeployedPlugin | undefined;
    /**
     * Removes the plugin from the location it originally resided on disk.
     * Unless `--uncompressed-plugins-in-place` is passed to the CLI, this operation is safe.
     */
    uninstallPlugin(pluginId: PluginIdentifiers.VersionedId): Promise<boolean>;

    /**
     * Removes the plugin from the locations to which it had been deployed.
     * This operation is not safe - references to deleted assets may remain.
     */
    undeployPlugin(pluginId: PluginIdentifiers.VersionedId): Promise<boolean>;

    getPluginDependencies(pluginToBeInstalled: PluginDeployerEntry): Promise<PluginDependencies | undefined>;

    /**
     * Marks the given plugins as "disabled". While the plugin remains installed, it will no longer
     * be used. Has no effect if the plugin is not installed
     * @param pluginId the plugin to disable
     * @returns whether the plugin was installed, enabled and could be disabled
     */
    disablePlugin(pluginId: PluginIdentifiers.UnversionedId): Promise<boolean>;

    /**
     * Marks the given plugins as "enabled". Has no effect if the plugin is not installed.
     * @param pluginId the plugin to enabled
     * @returns whether the plugin was installed, disabled and could be enabled
     */
    enablePlugin(pluginId: PluginIdentifiers.UnversionedId): Promise<boolean>;

}

export interface DeployedPlugin {
    /**
     * defaults to system
     */
    type?: PluginType;
    metadata: PluginMetadata;
    contributes?: PluginContribution;
}

export const HostedPluginServer = Symbol('HostedPluginServer');
export interface HostedPluginServer extends RpcServer<HostedPluginClient> {

    getDeployedPluginIds(): Promise<PluginIdentifiers.VersionedId[]>;

    getInstalledPluginIds(): Promise<PluginIdentifiers.VersionedId[]>;

    getUninstalledPluginIds(): Promise<readonly PluginIdentifiers.VersionedId[]>;

    getDisabledPluginIds(): Promise<readonly PluginIdentifiers.UnversionedId[]>;

    getDeployedPlugins(ids: PluginIdentifiers.VersionedId[]): Promise<DeployedPlugin[]>;

    getExtPluginAPI(): Promise<ExtPluginApi[]>;

    onMessage(targetHost: string, message: Uint8Array): Promise<void>;

}

export interface WorkspaceStorageKind {
    workspace?: string | undefined;
    roots: string[];
}
export type GlobalStorageKind = undefined;
export type PluginStorageKind = GlobalStorageKind | WorkspaceStorageKind;

export interface PluginDeployOptions {
    version: string;
    /** Instructs the deployer to ignore any existing plugins with different versions */
    ignoreOtherVersions?: boolean;
}

export const pluginServerJsonRpcPath = '/services/plugin-ext';
export const PluginServer = Symbol('PluginServer');
export interface PluginServer {

    /**
     * Deploy a plugin.
     *
     * @param type whether a plugin is installed by a system or a user, defaults to a user
     */
    install(pluginEntry: string, type?: PluginType, options?: PluginDeployOptions): Promise<void>;
    uninstall(pluginId: PluginIdentifiers.VersionedId): Promise<void>;

    enablePlugin(pluginId: PluginIdentifiers.UnversionedId): Promise<boolean>;
    disablePlugin(pluginId: PluginIdentifiers.UnversionedId): Promise<boolean>;

    getInstalledPlugins(): Promise<readonly PluginIdentifiers.VersionedId[]>;
    getUninstalledPlugins(): Promise<readonly PluginIdentifiers.VersionedId[]>;
    getDisabledPlugins(): Promise<readonly PluginIdentifiers.UnversionedId[]>;

    setStorageValue(key: string, value: KeysToAnyValues, kind: PluginStorageKind): Promise<boolean>;
    getStorageValue(key: string, kind: PluginStorageKind): Promise<KeysToAnyValues>;
    getAllStorageValues(kind: PluginStorageKind): Promise<KeysToKeysToAnyValue>;
}

export const ServerPluginRunner = Symbol('ServerPluginRunner');
export interface ServerPluginRunner {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    acceptMessage(pluginHostId: string, jsonMessage: Uint8Array): boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onMessage(pluginHostId: string, jsonMessage: Uint8Array): void;
    setClient(client: HostedPluginClient): void;
    setDefault(defaultRunner: ServerPluginRunner): void;
    clientClosed(): void;
}

export const PluginHostEnvironmentVariable = Symbol('PluginHostEnvironmentVariable');
export interface PluginHostEnvironmentVariable {
    process(env: NodeJS.ProcessEnv): void;
}
