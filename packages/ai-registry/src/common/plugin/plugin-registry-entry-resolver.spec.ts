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
import { PluginRegistryEntryResolverImpl } from './plugin-registry-entry-resolver';
import { RegistryPlugin, RegistryPluginApproval } from './plugin-registry-types';

function approval(organizationId: string, date: string, installConfigs: RegistryPluginApproval['installConfigs'] = []): RegistryPluginApproval {
    return { organizationId, date, configHash: `hash-${organizationId}`, installConfigs };
}

function plugin(overrides: Partial<RegistryPlugin> = {}): RegistryPlugin {
    return {
        pluginId: 'io.github.acme/bigquery-data-analytics',
        name: 'BigQuery Data Analytics',
        description: 'Analyse BigQuery data.',
        version: '1.2.0',
        source: { url: 'https://github.com/acme/bigquery-data-analytics.git' },
        contentHash: '5b8ad3f0e174',
        containedSkills: [{ name: 'query-builder', description: 'Build SQL.', path: 'skills/query-builder' }],
        containedMcpServers: [{ name: 'bigquery', transport: 'stdio' }],
        approvals: [approval('example-org', '2026-08-07')],
        ...overrides
    };
}

describe('PluginRegistryEntryResolver', () => {

    let resolver: PluginRegistryEntryResolverImpl;

    beforeEach(() => {
        resolver = new PluginRegistryEntryResolverImpl();
    });

    it('resolves a plugin entry, carrying the source, hash and consolidated components through', () => {
        const resolved = resolver.resolve(plugin());

        expect(resolved?.pluginId).to.equal('io.github.acme/bigquery-data-analytics');
        expect(resolved?.name).to.equal('BigQuery Data Analytics');
        expect(resolved?.version).to.equal('1.2.0');
        expect(resolved?.sourceUrl).to.equal('https://github.com/acme/bigquery-data-analytics.git');
        expect(resolved?.sourcePath).to.equal(undefined);
        expect(resolved?.contentHash).to.equal('5b8ad3f0e174');
        expect(resolved?.containedSkills.map(skill => skill.name)).to.deep.equal(['query-builder']);
        expect(resolved?.containedMcpServers.map(server => server.name)).to.deep.equal(['bigquery']);
    });

    it('keeps the in-repository plugin path when the source declares one', () => {
        expect(resolver.resolve(plugin({ source: { url: 'https://github.com/acme/monorepo', path: 'plugins/bigquery' } }))?.sourcePath)
            .to.equal('plugins/bigquery');
    });

    it('returns undefined for an entry without a source URL', () => {
        expect(resolver.resolve(plugin({ source: { url: '' } }))).to.equal(undefined);
    });

    it('returns undefined for an entry no organization has endorsed', () => {
        expect(resolver.resolve(plugin({ approvals: [] }))).to.equal(undefined);
    });

    it('orders endorsements by date descending', () => {
        const resolved = resolver.resolve(plugin({
            approvals: [approval('older-org', '2026-01-05'), approval('newest-org', '2026-08-07'), approval('middle-org', '2026-04-01')]
        }));

        expect(resolved?.endorsements.map(endorsement => endorsement.organizationId)).to.deep.equal(['newest-org', 'middle-org', 'older-org']);
    });

    it('breaks a date tie by organization id ascending, so two clients reading the same feed agree', () => {
        const resolved = resolver.resolve(plugin({
            approvals: [approval('zeta-org', '2026-08-07'), approval('alpha-org', '2026-08-07'), approval('mid-org', '2026-08-07')]
        }));

        expect(resolved?.endorsements.map(endorsement => endorsement.organizationId)).to.deep.equal(['alpha-org', 'mid-org', 'zeta-org']);
    });

    it('resolves an approval whose install configs were filtered out of the per-tool view, and still counts its endorsement', () => {
        // In `tools/<id>.json` another organization's approval survives stripped of its install configs,
        // so that every endorsing organization stays visible.
        const resolved = resolver.resolve(plugin({
            approvals: [approval('endorsing-org', '2026-08-07', []), approval('other-org', '2026-08-06', [{ tool: 'theia-ide' }])]
        }));

        expect(resolved).to.not.equal(undefined);
        expect(resolved?.endorsements.map(endorsement => endorsement.organizationId)).to.deep.equal(['endorsing-org', 'other-org']);
    });

    it('reports the organization an endorsement was filed through when it came via trust', () => {
        const resolved = resolver.resolve(plugin({
            approvals: [{ ...approval('trusting-org', '2026-08-07'), viaTrust: 'filing-org' }]
        }));

        expect(resolved?.endorsements).to.deep.equal([{ organizationId: 'trusting-org', date: '2026-08-07', viaTrust: 'filing-org' }]);
    });

    it('does not mutate the approval order of the raw entry', () => {
        const raw = plugin({ approvals: [approval('older-org', '2026-01-05'), approval('newest-org', '2026-08-07')] });

        resolver.resolve(raw);

        expect(raw.approvals.map(item => item.organizationId)).to.deep.equal(['older-org', 'newest-org']);
    });
});

describe('PluginRegistryEntryResolver plugin id validation', () => {

    const resolver = new PluginRegistryEntryResolverImpl();

    it('accepts the identifier shapes the registry publishes', () => {
        for (const pluginId of ['io.github.acme/bigquery-data-analytics', 'acme/tools', 'a', 'a.b_c-d/e.f_g-h']) {
            expect(resolver.resolve(plugin({ pluginId })), pluginId).to.not.be.undefined;
        }
    });

    it('drops an identifier carrying a character the directory encoding or the chat parser would mangle', () => {
        // Each of these either folds to the same directory name as another identifier, or survives into
        // a skill qualifier that `/`-command parsing stops at.
        for (const pluginId of ['acme tools', 'acme|tools', 'acme:tools', 'acme#tools', 'acme(tools)', 'acme%tools', '', '/leading', 'trailing/']) {
            expect(resolver.resolve(plugin({ pluginId })), JSON.stringify(pluginId)).to.be.undefined;
        }
    });

    it('drops two identifiers that would encode to the same directory name', () => {
        // `filenamify` folds the reserved set to one character and collapses runs of it, so `a:b`, `a|b`
        // and `a//b` all become `a_b`. Only the plain form survives validation, so the collision - and
        // with it two plugins claiming one directory - cannot arise.
        expect(resolver.resolve(plugin({ pluginId: 'acme/tools' }))).to.not.be.undefined;
        expect(resolver.resolve(plugin({ pluginId: 'acme:tools' }))).to.be.undefined;
        expect(resolver.resolve(plugin({ pluginId: 'acme|tools' }))).to.be.undefined;
    });

    it('drops an identifier long enough for the encoding to truncate', () => {
        expect(resolver.resolve(plugin({ pluginId: `acme/${'x'.repeat(120)}` }))).to.be.undefined;
    });
});
