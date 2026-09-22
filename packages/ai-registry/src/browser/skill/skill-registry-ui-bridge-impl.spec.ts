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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
// The view contribution import chain pulls in browser-side modules, so a DOM is required at import time.
const disableJSDOM = enableJSDOM();
try {
    FrontendApplicationConfigProvider.get();
} catch {
    FrontendApplicationConfigProvider.set({});
}

import { expect } from 'chai';
import { Event, ILogger } from '@theia/core';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { Skill } from '@theia/ai-core/lib/common/skill';
import { RegistryFetchService } from '../../common/registry-fetch-service';
import { InstalledSkillInfo, ResolvedSkillEntry } from '../../common/skill/skill-registry-types';
import { SkillInstallService } from './skill-install-service';
import { SkillInstallClientImpl } from './skill-install-client';
import { SkillRegistryUiBridgeImpl } from './skill-registry-ui-bridge-impl';

after(() => disableJSDOM());

const HOME = '/home/alex';
const SKILLS_ROOT = `${HOME}/.agents/skills`;

const silentLogger = { warn: () => undefined, error: () => undefined } as unknown as ILogger;

function skill(location: string, name = 'query-builder'): Skill {
    return { name, qualifiedName: name, description: 'Build SQL', location } as Skill;
}

function installed(name: string, skillId?: string): InstalledSkillInfo {
    return { name, drifted: false, ...(skillId !== undefined && { skillId }) };
}

/** Only `getSkillEntries` is reached; the ids are all the bridge reads off the entries. */
function stubFetchService(skillIds: string[]): RegistryFetchService {
    return {
        onDidChange: Event.None,
        getSkillEntries: async () => skillIds.map(skillId => ({ skillId } as ResolvedSkillEntry))
    } as unknown as RegistryFetchService;
}

/**
 * The bridge with its collaborators stubbed; `openedViews` records the reveal calls. The registry
 * lists every installed id unless `listedSkillIds` says otherwise, which is the ordinary case.
 */
async function buildBridge(
    skills: InstalledSkillInfo[],
    hooks: { searchModel?: { query: string }, openedViews?: string[], listedSkillIds?: string[] } = {}
): Promise<SkillRegistryUiBridgeImpl> {
    const bridge = new SkillRegistryUiBridgeImpl();
    const installClient = new SkillInstallClientImpl();
    Object.assign(bridge, {
        logger: silentLogger,
        installClient,
        installService: { listInstalledSkills: async () => skills } as unknown as SkillInstallService,
        envVariablesServer: { getHomeDirUri: async () => `file://${HOME}` } as unknown as EnvVariablesServer,
        fetchService: stubFetchService(hooks.listedSkillIds ?? skills.flatMap(info => info.skillId ?? [])),
        searchModel: hooks.searchModel ?? { query: '' },
        viewContribution: { openView: async () => { hooks.openedViews?.push('extensions'); } }
    });
    (bridge as unknown as { init: () => void }).init();
    // `init` primes the cache asynchronously; the bridge answers synchronously once it has.
    await (bridge as unknown as { refreshCache: () => Promise<void> }).refreshCache();
    return bridge;
}

describe('SkillRegistryUiBridgeImpl', () => {

    it('resolves the registry entry of a skill installed into the registry skills root', async () => {
        const bridge = await buildBridge([installed('query-builder', 'io.github.acme/query-builder')]);
        expect(bridge.getRegistryEntryId(skill(`${SKILLS_ROOT}/query-builder/SKILL.md`))).to.equal('io.github.acme/query-builder');
    });

    it('resolves nothing for a folder in the skills root that carries no registry metadata', async () => {
        const bridge = await buildBridge([installed('hand-placed')]);
        expect(bridge.getRegistryEntryId(skill(`${SKILLS_ROOT}/hand-placed/SKILL.md`, 'hand-placed'))).to.equal(undefined);
    });

    it('resolves nothing for a workspace skill of the same name, which the registry did not install', async () => {
        // The name matches a managed skill, but the file is the user's own: a workspace root takes
        // precedence over the registry root, so this is the skill the list actually shows.
        const bridge = await buildBridge([installed('query-builder', 'io.github.acme/query-builder')]);
        expect(bridge.getRegistryEntryId(skill('/workspace/.agents/skills/query-builder/SKILL.md'))).to.equal(undefined);
    });

    it('resolves nothing for a skill nested deeper than a folder below the skills root', async () => {
        const bridge = await buildBridge([installed('query-builder', 'io.github.acme/query-builder')]);
        expect(bridge.getRegistryEntryId(skill(`${SKILLS_ROOT}/query-builder/nested/SKILL.md`))).to.equal(undefined);
    });

    it('reveals a skill by searching the Extensions view for its registry id', async () => {
        const searchModel = { query: '' };
        const openedViews: string[] = [];
        const bridge = await buildBridge([installed('query-builder', 'io.github.acme/query-builder')], { searchModel, openedViews });

        bridge.revealSkill('io.github.acme/query-builder');

        expect(searchModel.query).to.equal('io.github.acme/query-builder');
        expect(openedViews).to.deep.equal(['extensions']);
    });

    it('opens the view without a search for a linked id the registry no longer lists, which a search would hide', async () => {
        // A stale link shows up in the Installed section with a warning; a query switches the view to
        // its search results, where a revoked id matches nothing.
        const searchModel = { query: '' };
        const openedViews: string[] = [];
        const bridge = await buildBridge(
            [installed('query-builder', 'io.github.acme/query-builder')],
            { searchModel, openedViews, listedSkillIds: [] });

        bridge.revealSkill('io.github.acme/query-builder');

        expect(searchModel.query).to.equal('');
        expect(openedViews).to.deep.equal(['extensions']);
    });

    it('refreshes when the installed skills change, so a link or unlink is reflected', async () => {
        let skills = [installed('query-builder')];
        const bridge = new SkillRegistryUiBridgeImpl();
        const installClient = new SkillInstallClientImpl();
        Object.assign(bridge, {
            logger: silentLogger,
            installClient,
            installService: { listInstalledSkills: async () => skills } as unknown as SkillInstallService,
            envVariablesServer: { getHomeDirUri: async () => `file://${HOME}` } as unknown as EnvVariablesServer,
            fetchService: stubFetchService(['io.github.acme/query-builder']),
            searchModel: { query: '' },
            viewContribution: { openView: async () => { } }
        });
        (bridge as unknown as { init: () => void }).init();
        const changes: number[] = [];
        bridge.onDidChange(() => changes.push(1));

        skills = [installed('query-builder', 'io.github.acme/query-builder')];
        installClient.notifyDidChangeInstalledSkills();
        await (bridge as unknown as { refreshCache: () => Promise<void> }).refreshCache();

        expect(bridge.getRegistryEntryId(skill(`${SKILLS_ROOT}/query-builder/SKILL.md`))).to.equal('io.github.acme/query-builder');
        expect(changes.length).to.be.greaterThan(0);
    });

    it('keeps the previous answers when the backend cannot be reached, rather than dropping every label', async () => {
        const bridge = await buildBridge([installed('query-builder', 'io.github.acme/query-builder')]);
        Object.assign(bridge, {
            installService: { listInstalledSkills: (): Promise<never> => { throw new Error('backend unavailable'); } } as unknown as SkillInstallService
        });

        await (bridge as unknown as { refreshCache: () => Promise<void> }).refreshCache();

        expect(bridge.getRegistryEntryId(skill(`${SKILLS_ROOT}/query-builder/SKILL.md`))).to.equal('io.github.acme/query-builder');
    });
});
