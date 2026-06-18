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
import { SkillRegistryEntryResolver, SkillRegistryEntryResolverImpl } from './skill-registry-entry-resolver';
import { RegistrySkill } from './skill-registry-types';

function createResolver(): SkillRegistryEntryResolver {
    return new SkillRegistryEntryResolverImpl();
}

describe('SkillRegistryEntryResolver.resolve', () => {

    let resolver: SkillRegistryEntryResolver;

    beforeEach(() => {
        resolver = createResolver();
    });

    it('normalises an approved skill, carrying the top-level contentHash', () => {
        const raw: RegistrySkill = {
            skillId: 'io.github.example/example-skill',
            name: 'Example Skill',
            description: 'An example skill',
            source: { url: 'https://github.com/example/skills', path: 'skills/example' },
            contentHash: 'abc123abc123',
            approvals: [{
                organizationId: 'theia',
                date: '2026-04-01',
                installConfigs: [{ tool: 'theia-ide', installUrl: 'theia://install-skill?id=io.github.example/example-skill' }]
            }]
        };

        expect(resolver.resolve(raw)).to.deep.equal({
            skillId: 'io.github.example/example-skill',
            name: 'Example Skill',
            description: 'An example skill',
            sourceUrl: 'https://github.com/example/skills',
            sourcePath: 'skills/example',
            contentHash: 'abc123abc123'
        });
    });

    it('omits sourcePath when it is absent', () => {
        const raw: RegistrySkill = {
            skillId: 'io.github.example/root-skill',
            name: 'Root Skill',
            description: 'Skill at the repository root',
            source: { url: 'https://github.com/example/root-skill' },
            contentHash: 'def456def456',
            approvals: [{
                organizationId: 'theia',
                date: '2026-04-01',
                installConfigs: [{ tool: 'theia-ide' }]
            }]
        };

        const resolved = resolver.resolve(raw);
        expect(resolved).to.not.have.property('sourcePath');
        expect(resolved?.sourceUrl).to.equal('https://github.com/example/root-skill');
        expect(resolved?.contentHash).to.equal('def456def456');
    });

    it('returns undefined when the skill has no approvals', () => {
        const raw: RegistrySkill = {
            skillId: 'io.github.example/orphan',
            name: 'Orphan',
            description: 'No approvals',
            source: { url: 'https://github.com/example/orphan' },
            contentHash: 'aaa',
            approvals: []
        };
        expect(resolver.resolve(raw)).to.be.undefined;
    });

    it('returns undefined when the source URL is missing', () => {
        const raw = {
            skillId: 'io.github.example/no-source',
            name: 'No Source',
            description: 'Missing source url',
            source: {},
            contentHash: 'bbb',
            approvals: [{ organizationId: 'theia', date: '2026-04-01', installConfigs: [{ tool: 'theia-ide' }] }]
        } as unknown as RegistrySkill;
        expect(resolver.resolve(raw)).to.be.undefined;
    });
});
