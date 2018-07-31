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
import { LogPart } from './types';

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
    contributes: {};
    packagePath: string;
}

export const PluginScanner = Symbol('PluginScanner');
export const PluginDeployer = Symbol('PluginDeployer');

/**
 * A plugin resolver is handling how to resolve a plugin link into a local resource.
 */
export const PluginDeployerResolver = Symbol('PluginDeployerResolver');

export const PluginDeployerDirectoryHandler = Symbol('PluginDeployerDirectoryHandler');

export const PluginDeployerFileHandler = Symbol('PluginDeployerFileHandler');

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

export interface PluginDeployerResolverInit {

}

export interface PluginDeployerResolverContext {

    addPlugin(pluginId: string, path: string): void;

    getOriginId(): string;

}

export interface PluginDeployer {

    start(): void;

}

/**
 * A resolver handle a set of resource
 */
export interface PluginDeployerResolver {

    init?(pluginDeployerResolverInit: PluginDeployerResolverInit): void;

    accept(pluginSourceId: string): boolean;

    resolve(pluginResolverContext: PluginDeployerResolverContext): Promise<void>;

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

export interface PluginDeployerFileHandler {

    accept(pluginDeployerEntry: PluginDeployerEntry): boolean;

    handle(context: PluginDeployerFileHandlerContext): Promise<void>;
}

export interface PluginDeployerDirectoryHandler {
    accept(pluginDeployerEntry: PluginDeployerEntry): boolean;

    handle(context: PluginDeployerDirectoryHandlerContext): Promise<void>;
}

/**
 * This interface describes a plugin model object, which is populated from package.json.
 */
export interface PluginModel {
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
    }
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
    (rpc: RPCProtocol, pluginMetadata: PluginMetadata): void;
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
    source: PluginPackage;
    model: PluginModel;
    lifecycle: PluginLifecycle;
}

export function getPluginId(plugin: PluginPackage | PluginModel): string {
    return `${plugin.publisher}_${plugin.name}`.replace(/\W/g, '_');
}

export function buildFrontendModuleName(plugin: PluginPackage | PluginModel): string {
    return `${plugin.publisher}_${plugin.name}`.replace(/\W/g, '_');
}

export const HostedPluginClient = Symbol('HostedPluginClient');
export interface HostedPluginClient {
    postMessage(message: string): Promise<void>;

    log(logPart: LogPart): void;
}

export const HostedPluginServer = Symbol('HostedPluginServer');
export interface HostedPluginServer extends JsonRpcServer<HostedPluginClient> {
    getHostedPlugin(): Promise<PluginMetadata | undefined>;

    getDeployedMetadata(): Promise<PluginMetadata[]>;
    getDeployedFrontendMetadata(): Promise<PluginMetadata[]>;
    deployFrontendPlugins(frontendPlugins: PluginDeployerEntry[]): Promise<void>;
    getDeployedBackendMetadata(): Promise<PluginMetadata[]>;
    deployBackendPlugins(backendPlugins: PluginDeployerEntry[]): Promise<void>;

    onMessage(message: string): Promise<void>;

    isPluginValid(uri: string): Promise<boolean>;
    runHostedPluginInstance(uri: string): Promise<string>;
    terminateHostedPluginInstance(): Promise<void>;
    isHostedTheiaRunning(): Promise<boolean>;
    getHostedPluginInstanceURI(): Promise<string>;
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
    deploy(pluginEntry: string): Promise<void>
}
