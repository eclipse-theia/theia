// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { Event } from '@theia/core/lib/common/event';
import { MCPInstallEntry } from './mcp-server-editor';

export const MCPRegistryUiBridge = Symbol('MCPRegistryUiBridge');

/**
 * Optional integration point exposed by `@theia/ai-registry` so that AI-related
 * widgets (e.g. the MCP configuration view in `@theia/ai-ide`) can surface
 * registry affordances without taking a hard dependency on the registry package.
 *
 * If no registry implementation is bound, consumers should treat this as absent
 * and hide all registry-specific affordances.
 */
export interface MCPRegistryUiBridge {
    /** Fires when the cached set of registry server IDs changes (e.g. after a refresh). */
    readonly onDidChange: Event<void>;
    /**
     * Resolves once the bridge has completed its initial registry fetch.
     * Consumers (e.g. the install-mcp URL handler) await this before relying on
     * `hasServer` / `getInstallEntry` so cold-start clicks don't get a false miss.
     */
    ready(): Promise<void>;
    /** Synchronous, cached lookup: is `serverId` currently approved in the registry? */
    hasServer(serverId: string): boolean;
    /**
     * Resolve the registry entry for `serverId` into a self-contained install payload
     * (key, config, version, configHash, display metadata). Returns `undefined` when
     * the registry has no approval for the given id. Used by the `install-mcp` URL
     * handler to drive the install flow purely from the registry.
     */
    getInstallEntry(serverId: string): MCPInstallEntry | undefined;
    /** Opens the registry browser. If `serverId` is provided, the view scrolls to / filters that entry. */
    openRegistry(serverId?: string): Promise<void>;
}
