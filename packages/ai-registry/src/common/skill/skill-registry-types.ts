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

/**
 * The git source of a skill. The registry only points to the skill's content - it does
 * not host it. Installing downloads `path` (or the repository root when omitted) from
 * `url` into `~/.agents/skills/<name>`.
 */
export interface RegistrySkillSource {
    url: string;
    path?: string;
}

/**
 * A single install config inside a skill approval. Pre-filtered per-tool by the registry
 * for the per-tool view (`<baseUrl>/<toolName>.json`).
 */
export interface RegistrySkillInstallConfig {
    tool?: string;
    installUrl?: string;
}

/**
 * One organization's approval of a skill entry, with the install configs for the tools
 * that organization approved.
 */
export interface RegistrySkillApproval {
    organizationId: string;
    date: string;
    configHash?: string;
    installConfigs: RegistrySkillInstallConfig[];
}

/**
 * Top-level skill entry as returned by the registry's per-tool JSON endpoint. The
 * registry points to the skill (a git repo) and carries the `contentHash` of the
 * referenced content; it does not host the content itself.
 */
export interface RegistrySkill {
    skillId: string;
    name: string;
    description: string;
    source: RegistrySkillSource;
    contentHash: string;
    approvals: RegistrySkillApproval[];
}

/**
 * A registry skill entry after resolving its (potentially multiple) approvals down to the
 * single shape the install service operates on.
 *
 * Resolution lives in the fetch layer; the install service expects this normalised shape.
 */
export interface ResolvedSkillEntry {
    skillId: string;
    name: string;
    description: string;
    /** Git repository URL the skill content is downloaded from. */
    sourceUrl: string;
    /** Path within the repository pointing at the skill root. Omitted means the repository root. */
    sourcePath?: string;
    /** Content hash published by the registry - compared against the installed sidecar to detect updates. */
    contentHash: string;
}

/**
 * Information about a skill folder found under `~/.agents/skills`.
 *
 * `skillId` and `contentHash` are present only when the folder carries our
 * `.registry.json` sidecar (i.e. it is registry-managed). `drifted` is true when the
 * on-disk content hash no longer matches the sidecar's recorded hash.
 */
export interface InstalledSkillInfo {
    name: string;
    skillId?: string;
    contentHash?: string;
    drifted: boolean;
}

/**
 * Outcome of classifying a skill against the opposite side (registry -> local folders
 * for search, or local folders -> registry for the Installed view). Mirrors the MCP
 * {@link ClassificationResult} union:
 *
 * - `not-installed` is only produced by `classifyRegistryEntry`.
 * - `installed-user-added` is only produced by `classifyInstalledSkill`.
 * - `installed-link-stale` surfaces a sidecar pointing at a skillId the registry no
 *   longer lists.
 * - `installed-from-registry`, `installed-manually`, and `fix-skill` are common.
 */
export type SkillClassificationResult =
    | { kind: 'installed-from-registry'; updateAvailable: boolean }
    | { kind: 'installed-manually' }
    | { kind: 'fix-skill' }
    | { kind: 'not-installed' }
    | { kind: 'installed-link-stale' }
    | { kind: 'installed-user-added' };
