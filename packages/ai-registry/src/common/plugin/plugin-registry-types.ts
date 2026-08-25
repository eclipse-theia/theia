// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { ResolvedPluginServer, SkippedPluginComponent } from './agent-plugin-manifest';

/** The registry points at a plugin; it does not host it. `path` omitted means the repository root. */
export interface RegistryPluginSource {
    url: string;
    path?: string;
}

export interface RegistryPluginInstallConfig {
    tool?: string;
    installUrl?: string;
    config?: Record<string, unknown>;
    instructions?: string;
}

export interface RegistryPluginApproval {
    organizationId: string;
    date: string;
    configHash: string;
    /**
     * Never assume this is non-empty: in the per-tool view an approval filed for another tool
     * survives with its configs filtered away, so that every endorsing organization stays visible.
     */
    installConfigs: RegistryPluginInstallConfig[];
    /** The organization that actually filed the approval, when endorsed via trust. */
    viaTrust?: string;
}

export interface RegistryContainedSkill {
    name: string;
    description: string;
    /** Plugin-root-relative, e.g. `skills/query-builder`. */
    path: string;
}

export interface RegistryContainedMcpServer {
    name: string;
    /** Empty when the entry declared no `type`, which v1 treats as invalid - the server is skipped. */
    transport: string;
}

/**
 * Top-level Agent Plugin entry as published by the registry. `containedSkills` and
 * `containedMcpServers` are what consolidation saw when it last ran, for telling the user what they
 * are about to install; the plugin root is authoritative once downloaded and wins on disagreement.
 */
export interface RegistryPlugin {
    pluginId: string;
    name: string;
    description: string;
    version?: string;
    author?: string;
    homepage?: string;
    keywords?: string[];
    source: RegistryPluginSource;
    contentHash: string;
    containedSkills: RegistryContainedSkill[];
    containedMcpServers: RegistryContainedMcpServer[];
    approvals: RegistryPluginApproval[];
}

export interface PluginEndorsement {
    organizationId: string;
    date: string;
    /** The organization that actually filed the approval, when endorsed via trust. */
    viaTrust?: string;
}

/** A registry entry with its approvals resolved down to the shape the install service operates on. */
export interface ResolvedPluginEntry {
    pluginId: string;
    name: string;
    description: string;
    /** Display only - never an update signal, the content hash decides. */
    version?: string;
    sourceUrl: string;
    sourcePath?: string;
    contentHash: string;
    /** Every endorsing organization, not only the one whose install config was selected. */
    endorsements: PluginEndorsement[];
    containedSkills: RegistryContainedSkill[];
    containedMcpServers: RegistryContainedMcpServer[];
}

/**
 * Provenance marker written to `<pluginRoot>/.registry.json`.
 *
 * Dot-prefixed so it is excluded from the content hash. Its presence is what distinguishes a plugin
 * we installed from a directory the user placed there, which must never be modified or removed.
 */
export interface PluginRegistryMetadata {
    pluginId: string;
    /**
     * The registry hash this install was accepted against, exactly as the skill marker records it:
     * one baseline driving both update detection (the registry publishes a different hash) and
     * drift detection (the hash computed from disk differs).
     */
    contentHash: string;
    /**
     * The prefix this plugin's skills are addressed by, chosen when the plugin was installed or
     * linked. Recorded rather than derived so that it never changes underneath a plugin: it is the
     * last segment of the identifier while that is free, and the full directory name otherwise.
     */
    qualifier: string;
    /**
     * When the root was last written. Load-bearing: it is carried into the plugin's MCP entries so
     * that replacing the root restarts the servers running out of it, even when their own
     * configuration is unchanged.
     */
    installedAt?: string;
}

/**
 * A directory found under the plugins root. `pluginId` and `contentHash` are present only when it
 * carries our `.registry.json`; `drifted` means the on-disk hash no longer matches the recorded one.
 */
export interface InstalledPluginInfo {
    /**
     * The one name a plugin may occupy: install creates it, adoption accepts no other, and every
     * other operation derives its target from the identifier the same way. Unique across installed
     * plugins, which is why it is also the fallback qualifier and the MCP server key disambiguator.
     */
    directoryName: string;
    /** `PLUGIN_ROOT`. */
    root: string;
    /**
     * `PLUGIN_DATA`. Outside the plugin root on purpose: the root is content hashed, so anything
     * written inside it would report the plugin as drifted the moment its own server ran, and an
     * update replaces the root wholesale.
     */
    dataRoot: string;
    pluginId?: string;
    contentHash?: string;
    /** See {@link PluginRegistryMetadata.qualifier}. Absent for a directory without our marker. */
    qualifier?: string;
    installedAt?: string;
    drifted: boolean;
    name?: string;
    version?: string;
    /**
     * Discovered under `<root>/skills` rather than taken from the feed, which only records what
     * consolidation last saw. Names only: reading each `SKILL.md`'s frontmatter here would mean a
     * second frontmatter parser in the backend when `@theia/ai-core` already owns one.
     */
    skills: string[];
    servers: ResolvedPluginServer[];
    skipped: SkippedPluginComponent[];
    /** Set when `mcp.json` as a whole was rejected, disabling MCP for this plugin. */
    mcpDisabledReason?: string;
}

/**
 * Outcome of classifying a plugin against the opposite side. Mirrors the skill union.
 *
 * `installed-link-stale` means the marker names a `pluginId` the registry no longer lists - either a
 * withdrawn endorsement or a source briefly unreachable during consolidation. Nothing in the data
 * separates the two, so it is surfaced and acted on only by the user.
 */
export type PluginClassificationResult =
    | { kind: 'installed-from-registry'; updateAvailable: boolean }
    | { kind: 'installed-manually' }
    | { kind: 'fix-plugin' }
    | { kind: 'not-installed' }
    | { kind: 'installed-link-stale' }
    | { kind: 'installed-user-added' };

export interface PluginHashMismatch {
    expected: string;
    actual: string;
}

/** Verified while still in staging, so nothing lands at its final path until the hash is settled. */
export interface StagedPluginInstall {
    stagingId: string;
    /** Set when the computed hash differed from the endorsed one; the user must then choose. */
    mismatch?: PluginHashMismatch;
}
