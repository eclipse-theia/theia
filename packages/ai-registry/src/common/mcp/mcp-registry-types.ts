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

import { MCPInstallEntryConfig } from '@theia/ai-mcp/lib/common/mcp-server-manager';

/**
 * Shape of `installConfigs[].config` for Theia: a `servers` map keyed by the local
 * MCP server key chosen by the registry maintainer. Server entries use the canonical
 * {@link MCPInstallEntryConfig} type from `@theia/ai-mcp` so the registry and the
 * install path can never drift in shape.
 */
export interface RegistryMCPInstallConfigBlob {
    servers: Record<string, MCPInstallEntryConfig>;
}

/**
 * A single install config inside an approval. Already filtered per-tool by the registry
 * for the per-tool view (`<baseUrl>/<toolName>.json`).
 */
export interface RegistryInstallConfig {
    tool?: string;
    installUrl?: string;
    openVsxUrl?: string;
    config?: RegistryMCPInstallConfigBlob;
    instructions?: string;
}

/**
 * One organization's approval of an MCP server entry, with the install configs for the
 * tools that organization approved.
 */
export interface RegistryApproval {
    organizationId: string;
    date: string;
    /** Pinned server version (per the AI-registry approval schema). Omitted means "use the latest from the Anthropic MCP registry". */
    version?: string;
    /**
     * Content hash of the approval produced by the registry's consolidation pipeline.
     * Drives update detection on the client - when the hash differs from the locally
     * stored `registryMetadata.configHash`, the registry has published a new approval
     * and Theia offers an Update action. Optional for backwards compatibility with
     * older payloads that pre-date the field.
     */
    configHash?: string;
    installConfigs: RegistryInstallConfig[];
}

/**
 * Top-level MCP server entry as returned by the registry's per-tool JSON endpoint.
 */
export interface RegistryMCPServer {
    serverId: string;
    name: string;
    description: string;
    mcpRegistryVerified: boolean;
    approvals: RegistryApproval[];
}

/**
 * A registry MCP entry after resolving the (potentially multiple) approvals and install configs
 * down to the single (key, config, version) tuple the install service operates on.
 *
 * Resolution lives in the fetch layer; the install service expects this normalised shape.
 */
export interface ResolvedRegistryEntry {
    serverId: string;
    name: string;
    description: string;
    /** The local preference key the registry maintainer chose (inner config.servers key). */
    localName: string;
    /** The config blob to write into `ai-features.mcp.mcpServers[localName]`. */
    config: MCPInstallEntryConfig;
    /** Registry-published version. Stored alongside installed entries for display only - update detection uses {@link configHash}. */
    version?: string;
    /**
     * Content hash of the chosen approval - compared against the local
     * `registryMetadata.configHash` to decide whether an Update is available. Optional
     * for backwards compatibility with older registry payloads - when absent the client
     * does not offer Update, since "no hash" is not evidence of a new version.
     */
    configHash?: string;
    /** True if the entry is verified against the Anthropic MCP registry - drives the "verified only" search filter. */
    mcpRegistryVerified: boolean;
}

/**
 * Outcome of classifying an entry against the opposite side (registry -> local prefs
 * for search/list views, or local prefs -> registry for the Installed view).
 *
 * Not every state is producible in both directions:
 *
 * - `not-installed` is only produced by `classifyRegistryEntry`.
 * - `installed-user-added` is only produced by `classifyLocalServer`.
 * - `installed-link-stale` is produced by both classifiers - `classifyLocalServer`
 *   when a linked local points to an unknown id, and `classifyRegistryEntry` when the
 *   key-matching local does so. The Installed and Search views show the same Unlink
 *   and Uninstall affordances in either case.
 * - `installed-from-registry`, `installed-manually`, and `fix-config` are common.
 */
export type ClassificationResult =
    | { kind: 'installed-from-registry'; updateAvailable: boolean }
    | { kind: 'installed-manually' }
    | { kind: 'fix-config' }
    | { kind: 'not-installed' }
    | { kind: 'installed-link-stale' }
    | { kind: 'installed-user-added' };
