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

import { MCPServerDescription, ToolInformation } from './mcp-server-manager';

/**
 * Workspace trust level the backend currently knows about for the
 * connection driving the filter chain. The backend cannot resolve trust
 * itself (the canonical `WorkspaceTrustService` is frontend-only); the
 * value is pushed down by the frontend (see
 * {@link MCPServerManager.setWorkspaceTrustLevel}).
 *
 * - `'trusted'`: the user has accepted the workspace trust prompt, or
 *   workspace trust is disabled in preferences.
 * - `'restricted'`: the workspace is open in restricted mode. Filters
 *   that key off this should err toward suppression / softening.
 * - `'unknown'`: the frontend hasn't pushed a value yet, or no frontend
 *   is connected (headless / RPC consumer). Filters that strictly gate
 *   on trust should treat this as untrusted.
 */
export type MCPWorkspaceTrustLevel = 'trusted' | 'restricted' | 'unknown';

/**
 * Context passed to every {@link MCPToolFilter.filter} call. Replaces the
 * earlier `(serverName, tool)` argument pair so the contribution point
 * has a stable shape that can grow without breaking existing filters
 * each time a new signal is added.
 *
 * Filters typically key off:
 * - `serverName` for per-server allow/deny rules;
 * - `serverDescription` for richer policy (e.g. block tools from any
 *   server whose `command` matches an unsafe pattern, or stamp
 *   provenance from the server's configured URL);
 * - `tool` for name / description / parameter-shape inspection;
 * - `workspaceTrustLevel` to soften capability when the workspace is
 *   restricted (vs the `MCPFrontendApplicationContribution`'s hard block
 *   on autostart, which only applies to autostarted servers).
 *
 * Federated / gateway-fronted deployments should populate
 * {@link ToolInformation.originalName} and
 * {@link ToolInformation.provenance} as the rewritten tool flows through
 * the chain so downstream filters and consent UIs can attribute back
 * to the upstream server.
 */
export interface MCPToolFilterContext {
    readonly serverName: string;
    readonly serverDescription: MCPServerDescription;
    readonly tool: ToolInformation;
    readonly workspaceTrustLevel: MCPWorkspaceTrustLevel;
}

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
 * possibly-rewritten output of the previous filter via
 * {@link MCPToolFilterContext.tool}.
 *
 * Typical use cases:
 *   - Hiding known-dangerous tools unless explicitly opted in.
 *   - Renaming tools to avoid collisions across servers (the previous
 *     name should be preserved in {@link ToolInformation.originalName}).
 *   - Stamping {@link ToolInformation.provenance} so downstream consumers
 *     and consent UIs can attribute tools back to their upstream
 *     (e.g. `"github-mcp-server"`, `"agentgateway:jira"`).
 *   - Soft-gating on {@link MCPToolFilterContext.workspaceTrustLevel}.
 *
 * Filters must be synchronous and side-effect free so the order of
 * registration is deterministic.
 */
export interface MCPToolFilter {
    readonly id: string;
    readonly priority?: number;

    /**
     * Inspect a tool advertised by the server identified in `context` and
     * return a replacement, `undefined` to suppress, or `'passthrough'`
     * to defer to the next filter.
     */
    filter(context: MCPToolFilterContext): MCPToolFilterOutcome;
}
