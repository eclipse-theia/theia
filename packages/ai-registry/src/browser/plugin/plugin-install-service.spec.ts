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
import { PreferenceService } from '@theia/core';
import { Container } from '@theia/core/shared/inversify';
import { AUTO_UPDATE_OVERRIDES_PREF } from '../../common/ai-registry-preferences';
import { PluginDirectoryNaming, PluginDirectoryNamingImpl } from '../../common/plugin/plugin-directory-naming';
import { PluginInstallBackendService } from '../../common/plugin/plugin-install-protocol';
import { RegistryAutoUpdatePolicy, RegistryAutoUpdatePolicyImpl } from '../auto-update/registry-auto-update-policy';
import { InstalledPluginInfo, ResolvedPluginEntry } from '../../common/plugin/plugin-registry-types';
import { PluginInstallService, PluginInstallServiceImpl } from './plugin-install-service';

/** The directory name an install of {@link entry} would create, and so the only one Link may adopt. */
const CANONICAL_DIRECTORY = 'io.github.acme_bigquery-data-analytics';

/** The real naming service: this is the agreement between the two sides that the tests are about. */
function createService(): PluginInstallService {
    const service = new PluginInstallServiceImpl();
    Object.assign(service, { directoryNaming: new PluginDirectoryNamingImpl() });
    return service;
}

const entry: ResolvedPluginEntry = {
    pluginId: 'io.github.acme/bigquery-data-analytics',
    name: 'BigQuery Data Analytics',
    description: 'Query and explore BigQuery',
    version: '1.2.0',
    sourceUrl: 'https://github.com/acme/bigquery-plugin',
    contentHash: 'hash-v1',
    endorsements: [{ organizationId: 'acme', date: '2026-08-07' }],
    containedSkills: [{ name: 'query-builder', description: 'Build SQL', path: 'skills/query-builder' }],
    containedMcpServers: [{ name: 'bigquery', transport: 'stdio' }]
};

function installed(overrides: Partial<InstalledPluginInfo> = {}): InstalledPluginInfo {
    return {
        directoryName: CANONICAL_DIRECTORY,
        root: '/home/user/.agents/plugins/io.github.acme_bigquery-data-analytics',
        dataRoot: '/home/user/.agents/plugin-data/io.github.acme_bigquery-data-analytics',
        drifted: false,
        skills: [],
        servers: [],
        skipped: [],
        ...overrides
    };
}

describe('PluginInstallService.classifyInstalledPlugin', () => {

    let service: PluginInstallService;

    beforeEach(() => {
        service = createService();
    });

    it('returns installed-user-added when the directory carries no provenance marker and the registry does not know it', () => {
        const info = installed({ directoryName: 'my-own-plugin', name: 'my-own-plugin' });
        expect(service.classifyInstalledPlugin(info, [entry])).to.deep.equal({ kind: 'installed-user-added' });
    });

    it('returns installed-manually when the directory carries no marker but is the one the plugin would occupy', () => {
        const info = installed({ name: 'bigquery-data-analytics' });
        expect(service.classifyInstalledPlugin(info, [entry])).to.deep.equal({ kind: 'installed-manually' });
    });

    it("offers no adoption for a directory named after something other than the plugin's canonical directory", () => {
        // Adopting it would leave Update and Fix - which derive their target from the identifier -
        // creating a second directory beside this one, both marked as the same plugin.
        for (const directoryName of ['bigquery-data-analytics', 'BigQuery Data Analytics', 'bigquery']) {
            const info = installed({ directoryName, name: entry.name });
            expect(service.classifyInstalledPlugin(info, [entry]), directoryName).to.deep.equal({ kind: 'installed-user-added' });
        }
    });

    it('returns installed-link-stale when the provenance marker names a pluginId the registry no longer lists', () => {
        const info = installed({ pluginId: 'io.github.acme/withdrawn', contentHash: 'hash-v1' });
        expect(service.classifyInstalledPlugin(info, [entry])).to.deep.equal({ kind: 'installed-link-stale' });
    });

    it('returns fix-plugin when the registry hash still matches but the local files have drifted', () => {
        const info = installed({ pluginId: entry.pluginId, contentHash: 'hash-v1', drifted: true });
        expect(service.classifyInstalledPlugin(info, [entry])).to.deep.equal({ kind: 'fix-plugin' });
    });

    it('prefers Fix over Update when the root drifted and the registry hash also moved on', () => {
        // Mirrors the skill and MCP classifiers, and is what keeps the auto-updater from replacing
        // edited content: nothing is lost, because Fix and Update are the same clean replace.
        const info = installed({ pluginId: entry.pluginId, contentHash: 'hash-v0', drifted: true });
        expect(service.classifyInstalledPlugin(info, [entry])).to.deep.equal({ kind: 'fix-plugin' });
    });

    it('offers an Update once the registry publishes a hash other than the recorded one', () => {
        const info = installed({ pluginId: entry.pluginId, contentHash: 'hash-v0' });
        expect(service.classifyInstalledPlugin(info, [entry])).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: true });
    });

    it('offers Fix rather than Update when the recorded hash still matches but the tree drifted', () => {
        const info = installed({ pluginId: entry.pluginId, contentHash: 'hash-v1', drifted: true });
        expect(service.classifyInstalledPlugin(info, [entry])).to.deep.equal({ kind: 'fix-plugin' });
    });

    it('returns installed-from-registry without an update when the recorded hash equals the published one', () => {
        const info = installed({ pluginId: entry.pluginId, contentHash: 'hash-v1' });
        expect(service.classifyInstalledPlugin(info, [entry])).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: false });
    });
});

describe('PluginInstallService.classifyRegistryEntry', () => {

    let service: PluginInstallService;

    beforeEach(() => {
        service = createService();
    });

    it('returns not-installed when nothing under the plugins root corresponds to the entry', () => {
        expect(service.classifyRegistryEntry(entry, [])).to.deep.equal({ kind: 'not-installed' });
    });

    it("returns installed-manually when the plugin's own directory exists without a marker, so Link is offered before any download", () => {
        expect(service.classifyRegistryEntry(entry, [installed()])).to.deep.equal({ kind: 'installed-manually' });
    });

    it('returns installed-from-registry with an update when the published hash differs from the recorded one', () => {
        const info = installed({ pluginId: entry.pluginId, contentHash: 'hash-v0' });
        expect(service.classifyRegistryEntry(entry, [info])).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: true });
    });

    it('returns fix-plugin when the published hash matches the recorded one but the local files have drifted', () => {
        const info = installed({ pluginId: entry.pluginId, contentHash: 'hash-v1', drifted: true });
        expect(service.classifyRegistryEntry(entry, [info])).to.deep.equal({ kind: 'fix-plugin' });
    });

    it('returns installed-from-registry without an update when the plugin is installed and unchanged', () => {
        const info = installed({ pluginId: entry.pluginId, contentHash: 'hash-v1' });
        expect(service.classifyRegistryEntry(entry, [info])).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: false });
    });
});

describe('PluginInstallService.findLinkDirectory', () => {

    let service: PluginInstallService;

    beforeEach(() => {
        service = createService();
    });

    it('names the marker-less directory a Link action would adopt, which is the canonical one', () => {
        expect(service.findLinkDirectory(entry, [installed()])).to.equal(CANONICAL_DIRECTORY);
    });

    it('names no directory when the only marker-less one is not the canonical directory', () => {
        expect(service.findLinkDirectory(entry, [installed({ directoryName: 'bigquery-data-analytics' })])).to.be.undefined;
    });

    it('returns undefined for a directory that already carries a provenance marker, which needs no adoption', () => {
        const info = installed({ pluginId: entry.pluginId, contentHash: 'hash-v1' });
        expect(service.findLinkDirectory(entry, [info])).to.be.undefined;
    });
});

describe('PluginInstallService override cleanup', () => {

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

    let prefs: FakePreferenceService;
    let uninstalled: string[];
    let unlinked: string[];
    let service: PluginInstallService;

    beforeEach(() => {
        const container = new Container();
        prefs = new FakePreferenceService();
        uninstalled = [];
        unlinked = [];
        container.bind(PreferenceService).toConstantValue(prefs);
        container.bind(PluginInstallBackendService).toConstantValue({
            uninstall: async (pluginId: string) => { uninstalled.push(pluginId); },
            unlink: async (pluginId: string) => { unlinked.push(pluginId); }
        } as unknown as PluginInstallBackendService);
        container.bind(PluginDirectoryNaming).to(PluginDirectoryNamingImpl).inSingletonScope();
        container.bind(RegistryAutoUpdatePolicyImpl).toSelf().inSingletonScope();
        container.bind(RegistryAutoUpdatePolicy).toService(RegistryAutoUpdatePolicyImpl);
        container.bind(PluginInstallServiceImpl).toSelf().inSingletonScope();
        container.bind(PluginInstallService).toService(PluginInstallServiceImpl);
        service = container.get(PluginInstallService);
    });

    it('drops the override on uninstall, since nothing is left to apply it to', async () => {
        await prefs.set(AUTO_UPDATE_OVERRIDES_PREF, {
            [`plugin:${entry.pluginId}`]: 'on',
            'plugin:io.github.other/other-plugin': 'off'
        });

        await service.uninstall(entry.pluginId);

        expect(uninstalled).to.deep.equal([entry.pluginId]);
        expect(prefs.snapshot(AUTO_UPDATE_OVERRIDES_PREF)).to.deep.equal({ 'plugin:io.github.other/other-plugin': 'off' });
    });

    it('drops the override on unlink too, since the plugin stops being registry-managed', async () => {
        await prefs.set(AUTO_UPDATE_OVERRIDES_PREF, { [`plugin:${entry.pluginId}`]: 'off' });

        await service.unlink(entry.pluginId);

        expect(unlinked).to.deep.equal([entry.pluginId]);
        expect(prefs.snapshot(AUTO_UPDATE_OVERRIDES_PREF)).to.deep.equal({});
    });

    it('writes nothing when the plugin had no override', async () => {
        await service.uninstall(entry.pluginId);

        expect(uninstalled).to.deep.equal([entry.pluginId]);
        expect(prefs.snapshot(AUTO_UPDATE_OVERRIDES_PREF)).to.be.undefined;
    });
});
