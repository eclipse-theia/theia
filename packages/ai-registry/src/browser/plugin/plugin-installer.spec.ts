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

// The installer imports the install dialogs, which extend the DOM-touching `ReactDialog`, so a DOM
// has to exist while those modules are evaluated.
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { InstalledPluginInfo, ResolvedPluginEntry, StagedPluginInstall } from '../../common/plugin/plugin-registry-types';
import { PluginInstallService } from './plugin-install-service';
import { PluginMcpRegistrar } from './plugin-mcp-registrar';
import { PluginInstallerImpl } from './plugin-installer';

disableJSDOM();

const entry: ResolvedPluginEntry = {
    pluginId: 'io.github.acme/bigquery-data-analytics',
    name: 'BigQuery Data Analytics',
    description: 'Query and explore BigQuery',
    sourceUrl: 'https://github.com/acme/bigquery-plugin',
    contentHash: 'hash-v1',
    endorsements: [{ organizationId: 'acme', date: '2026-08-07' }],
    containedSkills: [],
    containedMcpServers: []
};

const installedPlugin: InstalledPluginInfo = {
    directoryName: 'io.github.acme_bigquery-data-analytics',
    root: '/plugins/io.github.acme_bigquery-data-analytics',
    dataRoot: '/plugin-data/io.github.acme_bigquery-data-analytics',
    pluginId: entry.pluginId,
    contentHash: 'hash-v1',
    drifted: false,
    skills: ['query-builder'],
    servers: [],
    skipped: []
};

/** Records which phases of the flow ran, so a test can assert what did *not* happen. */
class RecordingInstallService {
    readonly calls: string[] = [];
    constructor(readonly staged: StagedPluginInstall) { }
    async stage(): Promise<StagedPluginInstall> {
        this.calls.push('stage');
        return this.staged;
    }
    async commit(stagingId: string, replaceExisting: boolean): Promise<InstalledPluginInfo> {
        this.calls.push(`commit(${stagingId}, ${replaceExisting})`);
        return installedPlugin;
    }
    async discard(stagingId: string): Promise<void> {
        this.calls.push(`discard(${stagingId})`);
    }
}

class TestPluginInstaller extends PluginInstallerImpl {

    readonly registered: InstalledPluginInfo[] = [];

    constructor(
        readonly service: RecordingInstallService,
        protected readonly acceptInstall: boolean,
        protected readonly acceptMismatch: boolean,
        protected readonly registrationError?: Error
    ) {
        super();
        Object.assign(this, {
            installService: service as unknown as PluginInstallService,
            mcpRegistrar: {
                register: async (info: InstalledPluginInfo) => {
                    if (this.registrationError) {
                        throw this.registrationError;
                    }
                    this.registered.push(info);
                },
                unregister: async () => undefined,
                reconcile: async () => undefined
            } as PluginMcpRegistrar,
            // Only that the flow is wrapped in one; the notification itself is Theia's.
            messageService: { showProgress: async () => ({ cancel: () => { }, report: () => { } }) }
        });
    }

    // The dialogs themselves are covered by their own rendering; what matters to the flow is the
    // answer they return, so the two confirmations are stubbed rather than opened.
    protected override async confirmInstall(): Promise<boolean> {
        return this.acceptInstall;
    }

    protected override async confirmMismatch(): Promise<boolean> {
        return this.acceptMismatch;
    }
}

describe('PluginInstaller.install', () => {

    it('downloads nothing when the user cancels the pre-install dialog', async () => {
        const service = new RecordingInstallService({ stagingId: 'staging-1' });
        const installer = new TestPluginInstaller(service, false, true);

        expect(await installer.install(entry, { replaceExisting: false, confirm: true })).to.be.false;
        expect(service.calls).to.be.empty;
    });

    it('commits and registers the resolved components when the download verifies', async () => {
        const service = new RecordingInstallService({ stagingId: 'staging-1' });
        const installer = new TestPluginInstaller(service, true, true);

        expect(await installer.install(entry, { replaceExisting: false, confirm: true })).to.be.true;
        expect(service.calls).to.deep.equal(['stage', 'commit(staging-1, false)']);
        expect(installer.registered).to.deep.equal([installedPlugin]);
    });

    it('discards the staged download and installs nothing when the user declines a content-hash mismatch', async () => {
        const service = new RecordingInstallService({ stagingId: 'staging-1', mismatch: { expected: 'a', actual: 'b' } });
        const installer = new TestPluginInstaller(service, true, false);

        expect(await installer.install(entry, { replaceExisting: false, confirm: true })).to.be.false;
        expect(service.calls).to.deep.equal(['stage', 'discard(staging-1)']);
        expect(installer.registered).to.be.empty;
    });

    it('installs a mismatched download only once the user has explicitly accepted it', async () => {
        const service = new RecordingInstallService({ stagingId: 'staging-1', mismatch: { expected: 'a', actual: 'b' } });
        const installer = new TestPluginInstaller(service, true, true);

        expect(await installer.install(entry, { replaceExisting: false, confirm: true })).to.be.true;
        expect(service.calls).to.deep.equal(['stage', 'commit(staging-1, false)']);
    });

    it('replaces the existing root and skips the pre-install dialog on an update', async () => {
        const service = new RecordingInstallService({ stagingId: 'staging-2' });
        // `acceptInstall` is false: an update must not ask again, so the flow has to reach `stage`.
        const installer = new TestPluginInstaller(service, false, true);

        expect(await installer.install(entry, { replaceExisting: true, confirm: false })).to.be.true;
        expect(service.calls).to.deep.equal(['stage', 'commit(staging-2, true)']);
    });

    it('fails loudly, naming the plugin, when the committed plugin\'s MCP servers cannot be registered', async () => {
        const service = new RecordingInstallService({ stagingId: 'staging-1' });
        const installer = new TestPluginInstaller(service, true, true, new Error('preference write failed'));

        let message = '';
        try {
            await installer.install(entry, { replaceExisting: false, confirm: true });
        } catch (error) {
            message = error instanceof Error ? error.message : String(error);
        }

        expect(message).to.contain(entry.name);
        expect(message).to.contain('preference write failed');
    });
});
