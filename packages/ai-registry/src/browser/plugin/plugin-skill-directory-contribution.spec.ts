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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
// The contribution imports `@theia/ai-core`'s skill service and the install service, both of which
// reach browser-side modules at import time.
const disableJSDOM = enableJSDOM();
try {
    FrontendApplicationConfigProvider.get();
} catch {
    FrontendApplicationConfigProvider.set({});
}

import { expect } from 'chai';
import { ILogger } from '@theia/core';
import { InstalledPluginInfo } from '../../common/plugin/plugin-registry-types';
import { PluginInstallService } from './plugin-install-service';
import { PluginSkillDirectoryContribution } from './plugin-skill-directory-contribution';

after(() => disableJSDOM());

const silentLogger = { warn: () => undefined, error: () => undefined } as unknown as ILogger;

class TestPluginSkillDirectoryContribution extends PluginSkillDirectoryContribution {
    constructor(plugins: InstalledPluginInfo[]) {
        super();
        Object.assign(this, {
            logger: silentLogger,
            installService: { listInstalledPlugins: async () => plugins } as unknown as PluginInstallService
        });
    }
}

function plugin(pluginId: string | undefined, directoryName: string, name?: string): InstalledPluginInfo {
    return {
        directoryName,
        root: `/home/user/.agents/plugins/${directoryName}`,
        dataRoot: `/home/user/.agents/plugin-data/${directoryName}`,
        drifted: false,
        skills: [],
        servers: [],
        skipped: [],
        ...(pluginId !== undefined && { pluginId }),
        ...(name !== undefined && { name })
    };
}

describe('PluginSkillDirectoryContribution.getSkillDirectories', () => {

    it('contributes the skills directory of every installed plugin as a plugin-tier root, qualified by its directory name', async () => {
        const contribution = new TestPluginSkillDirectoryContribution([
            plugin('io.github.acme/bigquery-data-analytics', 'io.github.acme_bigquery-data-analytics', 'BigQuery Data Analytics')
        ]);

        expect(await contribution.getSkillDirectories()).to.deep.equal([{
            path: '/home/user/.agents/plugins/io.github.acme_bigquery-data-analytics/skills',
            tier: 'plugin',
            qualifier: 'io.github.acme_bigquery-data-analytics'
        }]);
    });

    it('contributes nothing for a directory without a provenance marker, which has no identifier to qualify its skills with', async () => {
        const contribution = new TestPluginSkillDirectoryContribution([plugin(undefined, 'my-own-plugin', 'my-own-plugin')]);

        expect(await contribution.getSkillDirectories()).to.be.empty;
    });
});

describe('PluginSkillDirectoryContribution qualifier assignment', () => {

    async function qualifiers(plugins: InstalledPluginInfo[]): Promise<(string | undefined)[]> {
        return (await new TestPluginSkillDirectoryContribution(plugins).getSkillDirectories()).map(directory => directory.qualifier);
    }

    it('qualifies with the plugin directory name, which is unique by construction', async () => {
        expect(await qualifiers([
            plugin('io.github.acme/bigquery', 'io.github.acme_bigquery'),
            plugin('io.github.other/athena', 'io.github.other_athena')
        ])).to.deep.equal(['io.github.acme_bigquery', 'io.github.other_athena']);
    });

    it('keeps two plugins sharing a last identifier segment apart without any collision handling', async () => {
        expect(await qualifiers([
            plugin('io.github.acme/tools', 'io.github.acme_tools'),
            plugin('io.github.other/tools', 'io.github.other_tools')
        ])).to.deep.equal(['io.github.acme_tools', 'io.github.other_tools']);
    });

    it('does not rename an installed plugin\'s skills when another plugin is installed beside it', async () => {
        const acme = plugin('io.github.acme/tools', 'io.github.acme_tools');

        expect(await qualifiers([acme])).to.deep.equal(['io.github.acme_tools']);
        expect(await qualifiers([acme, plugin('io.github.other/tools', 'io.github.other_tools')]))
            .to.deep.equal(['io.github.acme_tools', 'io.github.other_tools']);
    });

    it('contributes the roots in identifier order whatever order they were discovered in', async () => {
        // The sort is about the roots, not the qualifiers: `readdir` order is filesystem-dependent, and
        // each qualifier is read off its own plugin so it could not depend on the order anyway.
        const acmeTools = plugin('io.github.acme/tools', 'io.github.acme_tools');
        const otherTools = plugin('io.github.other/tools', 'io.github.other_tools');
        const acmeBigquery = plugin('io.github.acme/bigquery', 'io.github.acme_bigquery');
        const expected = ['io.github.acme_bigquery', 'io.github.acme_tools', 'io.github.other_tools'];

        expect(await qualifiers([acmeTools, otherTools, acmeBigquery])).to.deep.equal(expected);
        expect(await qualifiers([acmeBigquery, otherTools, acmeTools])).to.deep.equal(expected);
    });

    it('yields no roots when the backend cannot be reached, so skills from every other tier keep loading', async () => {
        const contribution = new TestPluginSkillDirectoryContribution([]);
        Object.assign(contribution, {
            installService: { listInstalledPlugins: async () => { throw new Error('backend unavailable'); } } as unknown as PluginInstallService
        });

        expect(await contribution.getSkillDirectories()).to.be.empty;
    });
});
