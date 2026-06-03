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

import { inject, injectable } from '@theia/core/shared/inversify';
import { SkillInstallBackendService } from '../../common/skill/skill-install-protocol';
import { InstalledSkillInfo, ResolvedSkillEntry, SkillClassificationResult } from '../../common/skill/skill-registry-types';

export const SkillInstallService = Symbol('SkillInstallService');
export interface SkillInstallService {
    /** Downloads and installs a registry skill into `~/.agents/skills/<name>`. */
    install(entry: ResolvedSkillEntry): Promise<void>;
    /** Clean-replaces an installed skill with the latest registry content. */
    update(entry: ResolvedSkillEntry): Promise<void>;
    /** Restores a drifted skill from the registry content. */
    fixSkill(entry: ResolvedSkillEntry): Promise<void>;
    /** Adopts an existing local skill folder by stamping the registry sidecar. */
    link(entry: ResolvedSkillEntry): Promise<void>;
    /** Drops the registry sidecar from a skill folder while keeping its files. */
    unlink(name: string): Promise<void>;
    /** Removes an installed (registry-managed) skill folder. */
    uninstall(name: string): Promise<void>;
    /** Lists every skill folder under `~/.agents/skills`. */
    listInstalledSkills(): Promise<InstalledSkillInfo[]>;
    /** Classifies a local skill folder against the registry (for the Installed view). */
    classifyInstalledSkill(info: InstalledSkillInfo, entries: ResolvedSkillEntry[]): SkillClassificationResult;
    /** Classifies a registry entry against the local skill folders (for the Search view). */
    classifyRegistryEntry(entry: ResolvedSkillEntry, installed: InstalledSkillInfo[]): SkillClassificationResult;
}

@injectable()
export class SkillInstallServiceImpl implements SkillInstallService {

    @inject(SkillInstallBackendService)
    protected readonly backend: SkillInstallBackendService;

    install(entry: ResolvedSkillEntry): Promise<void> {
        return this.backend.install(entry);
    }

    update(entry: ResolvedSkillEntry): Promise<void> {
        return this.backend.update(entry);
    }

    fixSkill(entry: ResolvedSkillEntry): Promise<void> {
        return this.backend.fixSkill(entry);
    }

    link(entry: ResolvedSkillEntry): Promise<void> {
        return this.backend.link(entry);
    }

    unlink(name: string): Promise<void> {
        return this.backend.unlink(name);
    }

    uninstall(name: string): Promise<void> {
        return this.backend.uninstall(name);
    }

    listInstalledSkills(): Promise<InstalledSkillInfo[]> {
        return this.backend.listInstalledSkills();
    }

    classifyInstalledSkill(info: InstalledSkillInfo, entries: ResolvedSkillEntry[]): SkillClassificationResult {
        if (info.skillId !== undefined) {
            const matched = entries.find(entry => entry.skillId === info.skillId);
            if (!matched) {
                // Sidecar points at a skillId the registry no longer lists.
                return { kind: 'installed-link-stale' };
            }
            // Update takes precedence: a changed registry content hash always means an
            // Update is available, even if the local files have also drifted. Only when the
            // registry hash still matches do local edits surface as a Fix.
            if (matched.contentHash !== info.contentHash) {
                return { kind: 'installed-from-registry', updateAvailable: true };
            }
            if (info.drifted) {
                return { kind: 'fix-skill' };
            }
            return { kind: 'installed-from-registry', updateAvailable: false };
        }
        // No sidecar: a hand-placed folder. Offer Link only when the registry knows the name.
        const byName = entries.find(entry => entry.name === info.name);
        return byName ? { kind: 'installed-manually' } : { kind: 'installed-user-added' };
    }

    classifyRegistryEntry(entry: ResolvedSkillEntry, installed: InstalledSkillInfo[]): SkillClassificationResult {
        const linked = installed.find(info => info.skillId === entry.skillId);
        if (linked) {
            // Update takes precedence over Fix, mirroring classifyInstalledSkill.
            if (entry.contentHash !== linked.contentHash) {
                return { kind: 'installed-from-registry', updateAvailable: true };
            }
            if (linked.drifted) {
                return { kind: 'fix-skill' };
            }
            return { kind: 'installed-from-registry', updateAvailable: false };
        }
        const byName = installed.find(info => info.name === entry.name);
        if (!byName) {
            return { kind: 'not-installed' };
        }
        // A folder of this name exists but is not linked to this skill - offer Link before
        // any download (Install would refuse to overwrite an existing folder).
        return { kind: 'installed-manually' };
    }
}
