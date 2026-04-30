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
import { RPCProtocol } from './rpc-protocol';
import { PluginManager, Plugin } from './plugin-api-rpc';
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
 * Contribution point for assembling pieces of the built-in plugin API (`theia.*` / `vscode.*` namespace).
 *
 * Unlike {@link ExtPluginApiProvider} and {@link MainPluginApiProvider} (which create *separate*
 * API namespaces importable by plugins), implementations of this interface contribute to the
 * core `theia.*` API object that every plugin receives.
 *
 * Each implementation is responsible for a slice of the API — for example, terminal-related
 * functionality, debug, SCM, etc. The contribution registers its RPC implementations on both
 * the main side and the ext (plugin-host) side, and provides the namespace properties and
 * type exports that will be merged into the API object.
 *
 * Implementations are injected directly by the assembler service that composes the full API.
 * The assembler is the typed composition point that ensures the full `typeof theia` contract
 * is satisfied at compile time.
 */
export interface InternalPluginApiContribution {
    /**
     * Main-side: instantiate `*MainImpl` classes and register them on the RPC protocol.
     * Called once per plugin runtime connection.
     *
     * Implementations should call `rpc.set(PLUGIN_RPC_CONTEXT.FOO_MAIN, new FooMainImpl(...))` for
     * each main-side implementation they own.
     */
    registerMainImplementations(rpc: RPCProtocol, container: interfaces.Container): void;

    /**
     * Ext-side: instantiate `*ExtImpl` classes and register them on the RPC protocol.
     * Called once when the plugin host initializes.
     *
     * Implementations should call `rpc.set(MAIN_RPC_CONTEXT.FOO_EXT, fooExtImpl)` for
     * each ext-side implementation they own. Dependencies on other ext-side implementations
     * (e.g., `CommandRegistryImpl`, `EditorsAndDocumentsExtImpl`) should be `@inject`ed
     * from the DI container.
     */
    registerExtImplementations(rpc: RPCProtocol): void;

    /**
     * Ext-side: return the API namespace properties and type exports that will be
     * merged into the `typeof theia` object given to each plugin.
     *
     * Called once per plugin. The returned object's properties are deep-merged into the
     * final API object, so contributions can provide both namespace objects
     * (e.g., `{ window: { createTerminal: ... } }`) and type constructors
     * (e.g., `{ TerminalLocation }`).
     *
     * Implementations should define a concrete return type (e.g., `TerminalPluginApiNamespace`)
     * rather than using `Record<string, unknown>`, so that the assembler can verify the
     * combined result satisfies `typeof theia` at compile time.
     *
     * @param plugin - the plugin for which the API is being created
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createApiNamespace(plugin: Plugin): any;
}
