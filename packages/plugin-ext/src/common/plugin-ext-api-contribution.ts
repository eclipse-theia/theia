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
import { RPCProtocol } from './rpc-protocol.js';
import { PluginManager, Plugin } from './plugin-api-rpc.js';
import { interfaces } from '@theia/core/shared/inversify';

export const ExtPluginApiProvider = 'extPluginApi';
/**
 * Provider for extension API description.
 */
export interface ExtPluginApiProvider {
    /**
     * Provide API description.
     */
    provideApi(): ExtPluginApi;
}

/**
 * Provider for backend extension API description.
 */
export interface ExtPluginBackendApiProvider {
    /**
     * Provide API description.
     */
    provideApi(): ExtPluginBackendApi;
}

/**
 * Provider for frontend extension API description.
 */
export interface ExtPluginFrontendApiProvider {
    /**
     * Provide API description.
     */
    provideApi(): ExtPluginFrontendApi;
}

/**
 * Backend Plugin API extension description.
 * This interface describes a script for the backend(NodeJs) runtime.
 */
export interface ExtPluginBackendApi {

    /**
     * Path to the script which should be loaded to provide api, module should export `provideApi` function with
     * [ExtPluginApiBackendInitializationFn](#ExtPluginApiBackendInitializationFn) signature
     */
    backendInitPath?: string;
}

/**
 * Frontend Plugin API extension description.
 * This interface describes a script for the frontend(WebWorker) runtime.
 */
export interface ExtPluginFrontendApi {

    /**
     * Initialization information for frontend part of Plugin API
     */
    frontendExtApi?: FrontendExtPluginApi;
}

/**
 * Plugin API extension description.
 * This interface describes scripts for both plugin runtimes: frontend(WebWorker) and backend(NodeJs)
 */
export interface ExtPluginApi extends ExtPluginBackendApi, ExtPluginFrontendApi { }

export interface ExtPluginApiFrontendInitializationFn {
    (rpc: RPCProtocol, plugins: Map<string, Plugin>): void;
}

export interface ExtPluginApiBackendInitializationFn {
    (rpc: RPCProtocol, pluginManager: PluginManager): void;
}

/**
 * Interface contains information for frontend(WebWorker) Plugin API extension initialization
 */
export interface FrontendExtPluginApi {
    /**
     * path to js file
     */
    initPath: string;
    /** global variable name */
    initVariable: string;
    /**
     * init function name,
     * function should have  [ExtPluginApiFrontendInitializationFn](#ExtPluginApiFrontendInitializationFn)
     */
    initFunction: string;
}

export const MainPluginApiProvider = Symbol('mainPluginApi');

/**
 * Implementation should contains main(Theia) part of new namespace in Plugin API.
 * [initialize](#initialize) will be called once per plugin runtime
 */
export interface MainPluginApiProvider {
    initialize(rpc: RPCProtocol, container: interfaces.Container): void;
}

/**
 * Main-side half of a slice of the built-in plugin API (`theia.*` / `vscode.*` namespace).
 *
 * Unlike {@link MainPluginApiProvider} (which backs a *separate* API namespace importable by
 * plugins), implementations of this interface back part of the core `theia.*` API object that
 * every plugin receives. Its ext-side counterpart is {@link InternalExtPluginApiContribution};
 * the two run in different processes and DI containers.
 *
 * Implementations are injected directly by the main-side assembler, which is the single
 * composition point for the main side.
 */
export interface InternalMainPluginApiContribution {
    /**
     * Instantiate `*MainImpl` classes and register them on the RPC protocol.
     * Called once per plugin runtime connection.
     *
     * Implementations should call `rpc.set(PLUGIN_RPC_CONTEXT.FOO_MAIN, new FooMainImpl(...))` for
     * each main-side implementation they own.
     */
    registerMainImplementations(rpc: RPCProtocol, container: interfaces.Container): void;
}

/**
 * Ext-side (plugin host) half of a slice of the built-in plugin API (`theia.*` / `vscode.*` namespace).
 *
 * Unlike {@link ExtPluginApiProvider} (which creates a *separate* API namespace importable by
 * plugins), implementations of this interface contribute to the core `theia.*` API object that
 * every plugin receives. Each implementation is responsible for a slice of the API, for example
 * terminal, debug or SCM: it registers its `*ExtImpl` classes on the RPC protocol and provides the
 * namespace properties and type exports that are merged into the API object.
 *
 * Implementations are injected directly by the ext-side assembler. Because each injected field
 * keeps its concrete `T`, the assembler can check at compile time that the merged result of all
 * contributions satisfies `typeof theia`.
 *
 * @typeParam T the shape this contribution adds to the API object, e.g. `TerminalPluginApiNamespace`
 */
export interface InternalExtPluginApiContribution<T> {
    /**
     * Instantiate `*ExtImpl` classes and register them on the RPC protocol.
     * Called once when the plugin host initializes.
     *
     * Implementations should call `rpc.set(MAIN_RPC_CONTEXT.FOO_EXT, fooExtImpl)` for
     * each ext-side implementation they own. Dependencies on other ext-side implementations
     * (e.g., `CommandRegistryImpl`, `EditorsAndDocumentsExtImpl`) should be `@inject`ed
     * from the DI container.
     */
    registerExtImplementations(rpc: RPCProtocol): void;

    /**
     * Return the API namespace properties and type exports that will be
     * merged into the `typeof theia` object given to each plugin.
     *
     * Called once per plugin. The returned object's properties are deep-merged into the
     * final API object, so contributions can provide both namespace objects
     * (e.g., `{ window: { createTerminal: ... } }`) and type constructors
     * (e.g., `{ TerminalLocation }`).
     *
     * @param plugin - the plugin for which the API is being created
     */
    createApiNamespace(plugin: Plugin): T;
}
