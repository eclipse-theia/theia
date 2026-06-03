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

import { InstalledSkillInfo, ResolvedSkillEntry } from './skill-registry-types';

export const SkillInstallBackendServicePath = '/services/ai-registry/skill-install';

export const SkillInstallClient = Symbol('SkillInstallClient');
/**
 * Frontend-side client the backend notifies whenever the on-disk set of skills under
 * `~/.agents/skills` changes (installs, removals, or external edits picked up by the
 * backend watcher), so the Extensions view can refresh its cards.
 */
export interface SkillInstallClient {
    notifyDidChangeInstalledSkills(): void;
    /**
     * Notifies the frontend that the skills-folder watcher stopped after an error, so live
     * refreshes are no longer delivered until the window is reloaded.
     */
    notifyWatcherStopped(): void;
}

export const SkillInstallBackendService = Symbol('SkillInstallBackendService');

/**
 * Backend service that performs all skill filesystem and network work. The browser only
 * triggers actions and renders results - `~/.agents/skills` is outside the browser
 * FileService sandbox, so all fetch + filesystem writes happen here.
 */
export interface SkillInstallBackendService {
    /** Downloads a skill into `~/.agents/skills/<name>` and writes the registry sidecar. Refuses to overwrite an existing folder. */
    install(entry: ResolvedSkillEntry): Promise<void>;
    /** Clean-replaces an installed skill with the latest registry content (delete folder + re-download). */
    update(entry: ResolvedSkillEntry): Promise<void>;
    /** Clean-replaces a drifted skill with the registry content (delete folder + re-download). */
    fixSkill(entry: ResolvedSkillEntry): Promise<void>;
    /** Removes a skill folder - only when it carries our registry sidecar. */
    uninstall(name: string): Promise<void>;
    /** Adopts an existing local skill folder by stamping the registry sidecar without overwriting any files. */
    link(entry: ResolvedSkillEntry): Promise<void>;
    /** Drops the registry sidecar from a skill folder while keeping its files. */
    unlink(name: string): Promise<void>;
    /** Lists every skill folder under `~/.agents/skills`, including drift information for registry-managed ones. */
    listInstalledSkills(): Promise<InstalledSkillInfo[]>;
}
