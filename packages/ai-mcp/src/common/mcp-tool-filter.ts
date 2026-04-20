// *****************************************************************************
// Copyright (C) 2026 Satish Shivaji Rao.
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

import { ToolInformation } from './mcp-server-manager';

/**
 * Outcome of a {@link MCPToolFilter} pass:
 *   - a new {@link ToolInformation} — replaces the advertised tool;
 *   - `undefined` — suppresses the tool entirely (it is not registered);
 *   - `'passthrough'` — defers to the next filter, no change from this one.
 */
export type MCPToolFilterOutcome = ToolInformation | undefined | 'passthrough';

export const MCPToolFilter = Symbol('MCPToolFilter');

/**
 * Contribution point for filtering / rewriting tools advertised by MCP
 * servers before they are registered into Theia's `ToolInvocationRegistry`.
 * Filters are applied in descending-priority order; each filter sees the
 * possibly-rewritten output of the previous filter.
 *
 * Typical use cases:
 *   - Hiding known-dangerous tools unless explicitly opted in.
 *   - Renaming tools to avoid collisions across servers.
 *   - Stamping descriptions with provenance
 *     (e.g. `"[from github-mcp-server]"`).
 *
 * Filters must be synchronous and side-effect free so the order of
 * registration is deterministic.
 */
export interface MCPToolFilter {
    readonly id: string;
    readonly priority?: number;

    /**
     * Inspect a tool advertised by `serverName` and return a replacement,
     * `undefined` to suppress, or `'passthrough'` to defer to the next
     * filter.
     */
    filter(serverName: string, tool: ToolInformation): MCPToolFilterOutcome;
}
