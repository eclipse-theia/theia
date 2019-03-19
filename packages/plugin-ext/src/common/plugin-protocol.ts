/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { JsonRpcServer } from '@theia/core/lib/common/messaging/proxy-factory';
import { RPCProtocol } from '../api/rpc-protocol';
import { Disposable } from '@theia/core/lib/common/disposable';
import { LogPart, KeysToAnyValues, KeysToKeysToAnyValue } from './types';
import { CharacterPair, CommentRule, PluginAPIFactory, Plugin } from '../api/plugin-api';
// FIXME get rid of browser code in backend
import { PreferenceSchema, PreferenceSchemaProperties } from '@theia/core/lib/browser/preferences';
import { ExtPluginApi } from './plugin-ext-api-contribution';
import { IJSONSchema, IJSONSchemaSnippet } from '@theia/core/lib/common/json-schema';

export const hostedServicePath = '/services/hostedPlugin';

/**
 * Plugin engine (API) type, i.e. 'theiaPlugin', 'vscode', etc.
 */
export type PluginEngine = string;

/**
 * This interface describes a package.json object.
 */
export interface PluginPackage {
    name: string;
    publisher: string;
    version: string;
    engines: {
        [type in PluginEngine]: string;
    };
    theiaPlugin?: {
        frontend?: string;
        backend?: string;
    };
    main?: string;
    displayName: string;
    description: string;
    contributes?: PluginPackageContribution;
    packagePath: string;
}

/**
 * This interface describes a package.json contribution section object.
 */
export interface PluginPackageContribution {
    configuration?: PreferenceSchema;
    configurationDefaults?: PreferenceSchemaProperties;
    languages?: PluginPackageLanguageContribution[];
    grammars?: PluginPackageGrammarsContribution[];
    viewsContainers?: { [location: string]: PluginPackageViewContainer[] };
    views?: { [location: string]: PluginPackageView[] };
    commands?: PluginPackageCommand | PluginPackageCommand[];
    menus?: { [location: string]: PluginPackageMenu[] };
    keybindings?: PluginPackageKeybinding[];
    debuggers?: PluginPackageDebuggersContribution[];
    snippets: PluginPackageSnippetsContribution[];
}

export interface PluginPackageViewContainer {
    id: string;
    title: string;
    icon: string;
}

export interface PluginPackageView {
    id: string;
    name: string;
}

export interface PluginPackageCommand {
    command: string;
    title: string;
    category?: string;
    icon?: string | { light: string; dark: string; };
}

export interface PluginPackageMenu {
    command: string;
    group?: string;
    when?: string;
}

export interface PluginPackageKeybinding {
    key?: string;
    command: string;
    when?: string;
    mac?: string;
    linux?: string;
    win?: string;
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

export interface PlatformSpecificAdapterContribution {
    program?: string;
    args?: string[];
    runtime?: string;
    runtimeArgs?: string[];
}

/**
 * This interface describes a package.json debuggers contribution section object.
 */
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

/**
 * This interface describes a package.json languages contribution section object.
 */
export interface PluginPackageLanguageContribution {
    id: string;
    extensions?: string[];
    filenames?: string[];
    filenamePatterns?: string[];
    firstLine?: string;
    aliases?: string[];
    mimetypes?: string[];
    configuration?: string;
}

export interface PluginPackageLanguageContributionConfiguration {
    comments?: CommentRule;
    brackets?: CharacterPair[];
    autoClosingPairs?: (CharacterPair | AutoClosingPairConditional)[];
    surroundingPairs?: (CharacterPair | AutoClosingPair)[];
    wordPattern?: string;
    indentationRules?: IndentationRules;
    folding?: FoldingRules;
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
}

export const PluginDeployer = Symbol('PluginDeployer');

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

    resolve(pluginResolverContext: PluginDeployerResolverContext): Promise<void>;

}

export const PluginDeployerDirectoryHandler = Symbol('PluginDeployerDirectoryHandler');
export interface PluginDeployerDirectoryHandler {
    accept(pluginDeployerEntry: PluginDeployerEntry): boolean;

    handle(context: PluginDeployerDirectoryHandlerContext): Promise<void>;
}

export const PluginDeployerFileHandler = Symbol('PluginDeployerFileHandler');
export interface PluginDeployerFileHandler {

    accept(pluginDeployerEntry: PluginDeployerEntry): boolean;

    handle(context: PluginDeployerFileHandlerContext): Promise<void>;
}

export interface PluginDeployerResolverInit {

}

export interface PluginDeployerResolverContext {

    addPlugin(pluginId: string, path: string): void;

    getOriginId(): string;

}

export interface PluginDeployer {

    start(): void;

}

export enum PluginDeployerEntryType {

    FRONTEND,

    BACKEND
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
     * Local path on the filesystem
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

    isFile(): boolean;

    isDirectory(): boolean;

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
}

export interface PluginDeployerFileHandlerContext {

    unzip(sourcePath: string, destPath: string): Promise<void>;

    pluginEntry(): PluginDeployerEntry;

}

export interface PluginDeployerDirectoryHandlerContext {

    pluginEntry(): PluginDeployerEntry;

}

/**
 * This interface describes a plugin model object, which is populated from package.json.
 */
export interface PluginModel {
    id: string;
    name: string;
    publisher: string;
    version: string;
    displayName: string;
    description: string;
    engine: {
        type: PluginEngine;
        version: string;
    };
    entryPoint: {
        frontend?: string;
        backend?: string;
    };
    contributes?: PluginContribution;
}

/**
 * This interface describes some static plugin contributions.
 */
export interface PluginContribution {
    configuration?: PreferenceSchema;
    configurationDefaults?: PreferenceSchemaProperties;
    languages?: LanguageContribution[];
    grammars?: GrammarsContribution[];
    viewsContainers?: { [location: string]: ViewContainer[] };
    views?: { [location: string]: View[] };
    commands?: PluginCommand[]
    menus?: { [location: string]: Menu[] };
    keybindings?: Keybinding[];
    debuggers?: DebuggerContribution[];
    snippets?: SnippetContribution[];
}

export interface SnippetContribution {
    uri: string
    source: string
    language?: string
}

export interface GrammarsContribution {
    format: 'json' | 'plist';
    language?: string;
    scope: string;
    grammar?: string | object;
    embeddedLanguages?: ScopeMap;
    tokenTypes?: ScopeMap;
    injectTo?: string[];
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
}

export interface LanguageConfiguration {
    brackets?: CharacterPair[];
    indentationRules?: IndentationRules;
    surroundingPairs?: AutoClosingPair[];
    autoClosingPairs?: AutoClosingPairConditional[];
    comments?: CommentRule;
    folding?: FoldingRules;
    wordPattern?: string;
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
    configurationAttributes?: IJSONSchema[],
    configurationSnippets?: IJSONSchemaSnippet[],
    variables?: ScopeMap,
    adapterExecutableCommand?: string
    win?: PlatformSpecificAdapterContribution;
    winx86?: PlatformSpecificAdapterContribution;
    windows?: PlatformSpecificAdapterContribution;
    osx?: PlatformSpecificAdapterContribution;
    linux?: PlatformSpecificAdapterContribution;
}

export interface IndentationRules {
    increaseIndentPattern: string;
    decreaseIndentPattern: string;
    unIndentedLinePattern?: string;
    indentNextLinePattern?: string;
}
export interface AutoClosingPair {
    close: string;
    open: string;
}

export interface AutoClosingPairConditional extends AutoClosingPair {
    notIn?: string[];
}

export interface FoldingMarkers {
    start: string;
    end: string;
}

export interface FoldingRules {
    offSide?: boolean;
    markers?: FoldingMarkers;
}

/**
 * Views Containers contribution
 */
export interface ViewContainer {
    id: string;
    title: string;
    iconUrl: string;
}

/**
 * View contribution
 */
export interface View {
    id: string;
    name: string;
}

export interface PluginCommand {
    command: string;
    title: string;
    category?: string;
    iconUrl?: IconUrl;
}

export type IconUrl = string | { light: string; dark: string; };

/**
 * Menu contribution
 */
export interface Menu {
    command: string;
    group?: string;
    when?: string;
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
}

/**
 * This interface describes a plugin lifecycle object.
 */
export interface PluginLifecycle {
    startMethod: string;
    stopMethod: string;
    /**
     * Frontend module name, frontend plugin should expose this name.
     */
    frontendModuleName?: string;
    /**
     * Path to the script which should do some initialization before frontend plugin is loaded.
     */
    frontendInitPath?: string;
    /**
     * Path to the script which should do some initialization before backend plugin is loaded.
     */
    backendInitPath?: string;
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

export interface PluginMetadata {
    host: string;
    source: PluginPackage;
    model: PluginModel;
    lifecycle: PluginLifecycle;
}

export const MetadataProcessor = Symbol('MetadataProcessor');
export interface MetadataProcessor {
    process(pluginMetadata: PluginMetadata): void;
}

export function getPluginId(plugin: PluginPackage | PluginModel): string {
    return `${plugin.publisher}_${plugin.name}`.replace(/\W/g, '_');
}

export function buildFrontendModuleName(plugin: PluginPackage | PluginModel): string {
    return `${plugin.publisher}_${plugin.name}`.replace(/\W/g, '_');
}

export interface DebugConfiguration {
    port?: number;
    debugMode?: string;
}

export const HostedPluginClient = Symbol('HostedPluginClient');
export interface HostedPluginClient {
    postMessage(message: string): Promise<void>;

    log(logPart: LogPart): void;
}

export const PluginDeployerHandler = Symbol('PluginDeployerHandler');
export interface PluginDeployerHandler {
    deployFrontendPlugins(frontendPlugins: PluginDeployerEntry[]): Promise<void>;
    deployBackendPlugins(backendPlugins: PluginDeployerEntry[]): Promise<void>;
}

export const HostedPluginServer = Symbol('HostedPluginServer');
export interface HostedPluginServer extends JsonRpcServer<HostedPluginClient> {
    getHostedPlugin(): Promise<PluginMetadata | undefined>;

    getDeployedMetadata(): Promise<PluginMetadata[]>;
    getDeployedFrontendMetadata(): Promise<PluginMetadata[]>;
    getDeployedBackendMetadata(): Promise<PluginMetadata[]>;

    getExtPluginAPI(): Promise<ExtPluginApi[]>;

    onMessage(message: string): Promise<void>;

    isPluginValid(uri: string): Promise<boolean>;
    runHostedPluginInstance(uri: string): Promise<string>;
    runDebugHostedPluginInstance(uri: string, debugConfig: DebugConfiguration): Promise<string>;
    terminateHostedPluginInstance(): Promise<void>;
    isHostedPluginInstanceRunning(): Promise<boolean>;
    getHostedPluginInstanceURI(): Promise<string>;
    getHostedPluginURI(): Promise<string>;

    runWatchCompilation(uri: string): Promise<void>;
    stopWatchCompilation(uri: string): Promise<void>;
    isWatchCompilationRunning(uri: string): Promise<boolean>;
}

/**
 * The JSON-RPC workspace interface.
 */
export const pluginServerJsonRpcPath = '/services/plugin-ext';
export const PluginServer = Symbol('PluginServer');
export interface PluginServer {

    /**
     * Deploy a plugin
     */
    deploy(pluginEntry: string): Promise<void>;

    keyValueStorageSet(key: string, value: KeysToAnyValues, isGlobal: boolean): Promise<boolean>;
    keyValueStorageGet(key: string, isGlobal: boolean): Promise<KeysToAnyValues>;
    keyValueStorageGetAll(isGlobal: boolean): Promise<KeysToKeysToAnyValue>;
}

export const ServerPluginRunner = Symbol('ServerPluginRunner');
export interface ServerPluginRunner {
    // tslint:disable-next-line:no-any
    acceptMessage(jsonMessage: any): boolean;
    // tslint:disable-next-line:no-any
    onMessage(jsonMessage: any): void;
    setClient(client: HostedPluginClient): void;
    setDefault(defaultRunner: ServerPluginRunner): void;
    clientClosed(): void;

    /**
     * Provides additional metadata.
     */
    getExtraPluginMetadata(): Promise<PluginMetadata[]>;
}
