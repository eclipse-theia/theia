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

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core';
import { AUTO_UPDATE_OVERRIDES_PREF } from '../../common/ai-registry-preferences';
import { SkillInstallBackendService } from '../../common/skill/skill-install-protocol';
import { InstalledSkillInfo, ResolvedSkillEntry } from '../../common/skill/skill-registry-types';
import { RegistryAutoUpdatePolicy, RegistryAutoUpdatePolicyImpl } from '../auto-update/registry-auto-update-policy';
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

    it('returns installed-user-added when the folder has no registry metadata file and the registry does not know its name', () => {
        const info: InstalledSkillInfo = { name: 'unrelated', drifted: false };
        expect(service.classifyInstalledSkill(info, [entry])).to.deep.equal({ kind: 'installed-user-added' });
    });

    it('returns installed-manually when the folder has no registry metadata file but the registry knows its name', () => {
        const info: InstalledSkillInfo = { name: 'Example Skill', drifted: false };
        expect(service.classifyInstalledSkill(info, [entry])).to.deep.equal({ kind: 'installed-manually' });
    });

    it('returns installed-link-stale when the registry metadata file points at a skillId the registry no longer lists', () => {
        const info: InstalledSkillInfo = { name: 'Example Skill', skillId: 'io.github.example/gone', contentHash: 'hash-v1', drifted: false };
        expect(service.classifyInstalledSkill(info, [entry])).to.deep.equal({ kind: 'installed-link-stale' });
    });

    it('returns fix-skill when the registry hash matches but the local files have drifted', () => {
        const info: InstalledSkillInfo = { name: 'Example Skill', skillId: entry.skillId, contentHash: 'hash-v1', drifted: true };
        expect(service.classifyInstalledSkill(info, [entry])).to.deep.equal({ kind: 'fix-skill' });
    });

    it('prefers Fix over Update when the local files have drifted even though the registry hash also differs', () => {
        const info: InstalledSkillInfo = { name: 'Example Skill', skillId: entry.skillId, contentHash: 'hash-v0', drifted: true };
        expect(service.classifyInstalledSkill(info, [entry])).to.deep.equal({ kind: 'fix-skill' });
    });

    it('returns installed-from-registry with no update when the recorded hash matches the registry hash', () => {
        const info: InstalledSkillInfo = { name: 'Example Skill', skillId: entry.skillId, contentHash: 'hash-v1', drifted: false };
        expect(service.classifyInstalledSkill(info, [entry])).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: false });
    });

    it('returns installed-from-registry with an update available when the registry hash differs from the recorded hash', () => {
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

    it('prefers Fix over Update when a linked folder has drifted even though the registry hash also differs', () => {
        const installed: InstalledSkillInfo[] = [{ name: 'Example Skill', skillId: entry.skillId, contentHash: 'hash-v0', drifted: true }];
        expect(service.classifyRegistryEntry(entry, installed)).to.deep.equal({ kind: 'fix-skill' });
    });

    it('returns installed-manually when a folder of the same name exists but is not linked to this skill', () => {
        const installed: InstalledSkillInfo[] = [{ name: 'Example Skill', drifted: false }];
        expect(service.classifyRegistryEntry(entry, installed)).to.deep.equal({ kind: 'installed-manually' });
    });
});

describe('SkillInstallService override cleanup', () => {

    class FakePreferenceService {
        private readonly store = new Map<string, unknown>();
        get<T>(key: string, defaultValue?: T): T | undefined {
            return (this.store.has(key) ? this.store.get(key) : defaultValue) as T | undefined;
        }
        async set(key: string, value: unknown): Promise<void> {
            this.store.set(key, value);
        }
        snapshot<T>(key: string): T | undefined {
            return this.store.get(key) as T | undefined;
        }
    }

    /** A linked folder and a hand-placed one, so both the with- and without-id paths are covered. */
    const installed: InstalledSkillInfo[] = [
        { name: 'Example Skill', skillId: entry.skillId, contentHash: entry.contentHash, drifted: false },
        { name: 'hand-placed', drifted: false }
    ];

    let prefs: FakePreferenceService;
    let uninstalled: string[];
    let unlinked: string[];
    let service: SkillInstallService;

    beforeEach(() => {
        const container = new Container();
        prefs = new FakePreferenceService();
        uninstalled = [];
        unlinked = [];
        container.bind(PreferenceService).toConstantValue(prefs);
        container.bind(SkillInstallBackendService).toConstantValue({
            uninstall: async (name: string) => { uninstalled.push(name); },
            unlink: async (name: string) => { unlinked.push(name); },
            listInstalledSkills: async () => installed
        } as unknown as SkillInstallBackendService);
        container.bind(RegistryAutoUpdatePolicyImpl).toSelf().inSingletonScope();
        container.bind(RegistryAutoUpdatePolicy).toService(RegistryAutoUpdatePolicyImpl);
        container.bind(SkillInstallServiceImpl).toSelf().inSingletonScope();
        container.bind(SkillInstallService).toService(SkillInstallServiceImpl);
        service = container.get(SkillInstallService);
    });

    it('resolves the registry id itself, so uninstall drops the override without being told it', async () => {
        await prefs.set(AUTO_UPDATE_OVERRIDES_PREF, {
            [`skill:${entry.skillId}`]: 'on',
            'skill:io.github.other/other-skill': 'off'
        });

        await service.uninstall('Example Skill');

        expect(uninstalled).to.deep.equal(['Example Skill']);
        expect(prefs.snapshot(AUTO_UPDATE_OVERRIDES_PREF)).to.deep.equal({ 'skill:io.github.other/other-skill': 'off' });
    });

    it('leaves the overrides untouched when the uninstalled folder has no registry identity', async () => {
        await prefs.set(AUTO_UPDATE_OVERRIDES_PREF, { 'skill:io.github.other/other-skill': 'off' });

        await service.uninstall('hand-placed');

        expect(uninstalled).to.deep.equal(['hand-placed']);
        expect(prefs.snapshot(AUTO_UPDATE_OVERRIDES_PREF)).to.deep.equal({ 'skill:io.github.other/other-skill': 'off' });
    });

    it('drops the override on unlink too, since the skill stops being registry-managed', async () => {
        await prefs.set(AUTO_UPDATE_OVERRIDES_PREF, {
            [`skill:${entry.skillId}`]: 'on',
            'skill:io.github.other/other-skill': 'off'
        });

        await service.unlink('Example Skill');

        expect(unlinked).to.deep.equal(['Example Skill']);
        expect(prefs.snapshot(AUTO_UPDATE_OVERRIDES_PREF)).to.deep.equal({ 'skill:io.github.other/other-skill': 'off' });
    });
});
