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

import { expect } from 'chai';
import { InstalledSkillInfo, ResolvedSkillEntry } from '../../common/skill/skill-registry-types';
import { SkillInstallService, SkillInstallServiceImpl } from './skill-install-service';

const entry: ResolvedSkillEntry = {
    skillId: 'io.github.example/example-skill',
    name: 'Example Skill',
    description: 'An example skill',
    sourceUrl: 'https://github.com/example/skills',
    sourcePath: 'skills/example',
    contentHash: 'hash-v1'
};

describe('SkillInstallService.classifyInstalledSkill', () => {

    let service: SkillInstallService;

    beforeEach(() => {
        service = new SkillInstallServiceImpl();
    });

    it('returns installed-user-added when the folder has no sidecar and the registry does not know its name', () => {
        const info: InstalledSkillInfo = { name: 'unrelated', drifted: false };
        expect(service.classifyInstalledSkill(info, [entry])).to.deep.equal({ kind: 'installed-user-added' });
    });

    it('returns installed-manually when the folder has no sidecar but the registry knows its name', () => {
        const info: InstalledSkillInfo = { name: 'Example Skill', drifted: false };
        expect(service.classifyInstalledSkill(info, [entry])).to.deep.equal({ kind: 'installed-manually' });
    });

    it('returns installed-link-stale when the sidecar points at a skillId the registry no longer lists', () => {
        const info: InstalledSkillInfo = { name: 'Example Skill', skillId: 'io.github.example/gone', contentHash: 'hash-v1', drifted: false };
        expect(service.classifyInstalledSkill(info, [entry])).to.deep.equal({ kind: 'installed-link-stale' });
    });

    it('returns fix-skill when the registry hash matches but the local files have drifted', () => {
        const info: InstalledSkillInfo = { name: 'Example Skill', skillId: entry.skillId, contentHash: 'hash-v1', drifted: true };
        expect(service.classifyInstalledSkill(info, [entry])).to.deep.equal({ kind: 'fix-skill' });
    });

    it('prefers Update over Fix when the registry hash differs even if the local files have also drifted', () => {
        const info: InstalledSkillInfo = { name: 'Example Skill', skillId: entry.skillId, contentHash: 'hash-v0', drifted: true };
        expect(service.classifyInstalledSkill(info, [entry])).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: true });
    });

    it('returns installed-from-registry with no update when the sidecar hash matches the registry hash', () => {
        const info: InstalledSkillInfo = { name: 'Example Skill', skillId: entry.skillId, contentHash: 'hash-v1', drifted: false };
        expect(service.classifyInstalledSkill(info, [entry])).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: false });
    });

    it('returns installed-from-registry with an update available when the registry hash differs from the sidecar hash', () => {
        const info: InstalledSkillInfo = { name: 'Example Skill', skillId: entry.skillId, contentHash: 'hash-v0', drifted: false };
        expect(service.classifyInstalledSkill(info, [entry])).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: true });
    });
});

describe('SkillInstallService.classifyRegistryEntry', () => {

    let service: SkillInstallService;

    beforeEach(() => {
        service = new SkillInstallServiceImpl();
    });

    it('returns not-installed when no local folder matches the entry by skillId or name', () => {
        expect(service.classifyRegistryEntry(entry, [])).to.deep.equal({ kind: 'not-installed' });
    });

    it('returns installed-from-registry with no update when a folder is linked by skillId and the hashes match', () => {
        const installed: InstalledSkillInfo[] = [{ name: 'Example Skill', skillId: entry.skillId, contentHash: 'hash-v1', drifted: false }];
        expect(service.classifyRegistryEntry(entry, installed)).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: false });
    });

    it('returns installed-from-registry with an update available when a linked folder has an older hash', () => {
        const installed: InstalledSkillInfo[] = [{ name: 'Example Skill', skillId: entry.skillId, contentHash: 'hash-v0', drifted: false }];
        expect(service.classifyRegistryEntry(entry, installed)).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: true });
    });

    it('returns fix-skill when the registry hash matches but a linked folder has drifted on disk', () => {
        const installed: InstalledSkillInfo[] = [{ name: 'Example Skill', skillId: entry.skillId, contentHash: 'hash-v1', drifted: true }];
        expect(service.classifyRegistryEntry(entry, installed)).to.deep.equal({ kind: 'fix-skill' });
    });

    it('prefers Update over Fix when the registry hash differs even if a linked folder has also drifted', () => {
        const installed: InstalledSkillInfo[] = [{ name: 'Example Skill', skillId: entry.skillId, contentHash: 'hash-v0', drifted: true }];
        expect(service.classifyRegistryEntry(entry, installed)).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: true });
    });

    it('returns installed-manually when a folder of the same name exists but is not linked to this skill', () => {
        const installed: InstalledSkillInfo[] = [{ name: 'Example Skill', drifted: false }];
        expect(service.classifyRegistryEntry(entry, installed)).to.deep.equal({ kind: 'installed-manually' });
    });
});
