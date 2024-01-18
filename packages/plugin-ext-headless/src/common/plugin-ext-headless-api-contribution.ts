// *****************************************************************************
// Copyright (C) 2024 EclipseSource and others.
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

import { PluginManager } from '@theia/plugin-ext';
import { RPCProtocol } from '@theia/plugin-ext/lib/common/rpc-protocol';

export * from '@theia/plugin-ext';

declare module '@theia/plugin-ext' {
    /**
     * Plugin API extension description.
     * This interface describes scripts for all three plugin runtimes: frontend (WebWorker), backend (NodeJs), and headless (NodeJs).
     */
    interface ExtPluginApi extends ExtPluginHeadlessApi {
        // Note that the frontendInitPath and backendInitPath properties are included by
        // Typescript interface merge from the @theia/plugin-ext::ExtPluginApi interface.
    }
}

/**
 * Provider for headless extension API description.
 */
export interface ExtPluginHeadlessApiProvider {
    /**
     * Provide API description.
     */
    provideApi(): ExtPluginHeadlessApi;
}

/**
 * Headless Plugin API extension description.
 * This interface describes a script for the headless (NodeJs) runtime outside of the scope of frontend connections.
 */
export interface ExtPluginHeadlessApi {
    /**
     * Path to the script which should be loaded to provide api, module should export `provideApi` function with
     * [ExtPluginApiBackendInitializationFn](#ExtPluginApiBackendInitializationFn) signature
     */
    headlessInitPath?: string;
}

/**
 * Signature of the extension API initialization function for APIs contributed to headless plugins.
 */
export interface ExtPluginApiHeadlessInitializationFn {
    (rpc: RPCProtocol, pluginManager: PluginManager): void;
}
