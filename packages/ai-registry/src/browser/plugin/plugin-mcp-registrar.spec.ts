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
import { MCP_SERVERS_PREF } from '@theia/ai-mcp/lib/common/mcp-preferences';
import { InstalledPluginInfo } from '../../common/plugin/plugin-registry-types';
import { PluginMcpRegistrarImpl } from './plugin-mcp-registrar';

/** Minimal preference double: the registrar only reads and writes the MCP servers preference. */
class FakePreferenceService {
    constructor(public value: Record<string, unknown> = {}) { }
    get<T>(key: string, defaultValue?: T): T | undefined {
        return (key === MCP_SERVERS_PREF ? this.value : defaultValue) as T | undefined;
    }
    async set(key: string, value: unknown): Promise<void> {
        if (key === MCP_SERVERS_PREF) {
            this.value = value as Record<string, unknown>;
        }
    }
}

class TestPluginMcpRegistrar extends PluginMcpRegistrarImpl {
    constructor(readonly preferences: FakePreferenceService) {
        super();
        Object.assign(this, { preferenceService: preferences as unknown as PreferenceService });
    }
}

const PLUGIN_ID = 'io.github.acme/bigquery-data-analytics';
const PLUGIN_DIRECTORY = 'io.github.acme_bigquery-data-analytics';
const PLUGIN_ROOT = '/home/user/.agents/plugins/io.github.acme_bigquery-data-analytics';
const PLUGIN_DATA = '/home/user/.agents/plugin-data/io.github.acme_bigquery-data-analytics';

function installedPlugin(overrides: Partial<InstalledPluginInfo> = {}): InstalledPluginInfo {
    return {
        directoryName: PLUGIN_DIRECTORY,
        root: PLUGIN_ROOT,
        dataRoot: PLUGIN_DATA,
        skills: [],
        pluginId: PLUGIN_ID,
        contentHash: 'hash-v1',
        drifted: false,
        servers: [{ kind: 'stdio', name: 'bigquery', command: 'node', args: ['server.js'], cwd: PLUGIN_ROOT }],
        skipped: [],
        ...overrides
    };
}

describe('PluginMcpRegistrar.register', () => {

    it("writes the plugin's own mcp.json key when nothing else occupies it", async () => {
        const preferences = new FakePreferenceService();
        const registrar = new TestPluginMcpRegistrar(preferences);

        await registrar.register(installedPlugin());

        expect(Object.keys(preferences.value)).to.deep.equal(['bigquery']);
        expect(preferences.value.bigquery).to.deep.equal({
            command: 'node',
            args: ['server.js'],
            cwd: PLUGIN_ROOT,
            pluginRoot: PLUGIN_ROOT,
            pluginData: PLUGIN_DATA,
            autostart: true,
            registryMetadata: { pluginId: PLUGIN_ID, configHash: 'hash-v1' }
        });
    });

    it('falls back to the qualified key when the plain one is already taken, leaving the existing entry untouched', async () => {
        const preferences = new FakePreferenceService({ bigquery: { command: 'my-own-server' } });
        const registrar = new TestPluginMcpRegistrar(preferences);

        await registrar.register(installedPlugin());

        expect(preferences.value.bigquery).to.deep.equal({ command: 'my-own-server' });
        expect(preferences.value[`${PLUGIN_DIRECTORY}_bigquery`]).to.deep.include({
            command: 'node',
            registryMetadata: { pluginId: PLUGIN_ID, configHash: 'hash-v1' }
        });
    });

    it('writes a streamable-http server as a remote entry with its headers', async () => {
        const preferences = new FakePreferenceService();
        const registrar = new TestPluginMcpRegistrar(preferences);

        await registrar.register(installedPlugin({
            servers: [{ kind: 'http', name: 'remote', serverUrl: 'https://example.org/mcp', headers: { 'X-Api-Key': 'k' } }]
        }));

        expect(preferences.value.remote).to.deep.equal({
            serverUrl: 'https://example.org/mcp',
            headers: { 'X-Api-Key': 'k' },
            autostart: true,
            registryMetadata: { pluginId: PLUGIN_ID, configHash: 'hash-v1' }
        });
    });

    it('replaces the entries it previously owned rather than reconciling them, so a removed server disappears on update', async () => {
        const preferences = new FakePreferenceService({
            gone: { command: 'old', registryMetadata: { pluginId: PLUGIN_ID } },
            unrelated: { command: 'other' }
        });
        const registrar = new TestPluginMcpRegistrar(preferences);

        await registrar.register(installedPlugin());

        expect(Object.keys(preferences.value).sort()).to.deep.equal(['bigquery', 'unrelated']);
    });

    it('writes a differing entry after an update whose mcp.json is unchanged, so the running server restarts', async () => {
        const preferences = new FakePreferenceService();
        const registrar = new TestPluginMcpRegistrar(preferences);

        await registrar.register(installedPlugin());
        const beforeUpdate = JSON.stringify(preferences.value);
        // Same servers, same key, same everything the plugin declares - only the plugin's own content
        // changed. The entry still has to differ, or nothing restarts the process whose `cwd` points
        // into the plugin root that the update just deleted and re-created.
        await registrar.register(installedPlugin({ contentHash: 'hash-v2' }));

        expect(JSON.stringify(preferences.value)).to.not.equal(beforeUpdate);
        expect(preferences.value.bigquery).to.deep.include({ registryMetadata: { pluginId: PLUGIN_ID, configHash: 'hash-v2' } });
    });

    it('writes nothing for a directory without a provenance marker, which is the user\'s own', async () => {
        const preferences = new FakePreferenceService({ unrelated: { command: 'other' } });
        const registrar = new TestPluginMcpRegistrar(preferences);

        await registrar.register(installedPlugin({ pluginId: undefined }));

        expect(preferences.value).to.deep.equal({ unrelated: { command: 'other' } });
    });

    it('registers no entry for a server the plugin root rejected', async () => {
        const preferences = new FakePreferenceService();
        const registrar = new TestPluginMcpRegistrar(preferences);

        await registrar.register(installedPlugin({ servers: [], skipped: [{ name: 'legacy', reason: 'The MCP transport "sse" is not supported.' }] }));

        expect(preferences.value).to.deep.equal({});
    });
});

describe('PluginMcpRegistrar.unregister', () => {

    it('removes exactly the entries owned by the plugin, whatever key they were stored under', async () => {
        const preferences = new FakePreferenceService({
            // A user renamed the key; ownership rides on `registryMetadata.pluginId`, not on the key.
            renamed: { command: 'node', registryMetadata: { pluginId: PLUGIN_ID } },
            other_plugin: { command: 'node', registryMetadata: { pluginId: 'io.github.other/plugin' } },
            standalone: { command: 'npx', registryMetadata: { serverId: 'io.github.example/example-mcp' } },
            handAdded: { command: 'my-own-server' }
        });
        const registrar = new TestPluginMcpRegistrar(preferences);

        await registrar.unregister(PLUGIN_ID);

        expect(Object.keys(preferences.value).sort()).to.deep.equal(['handAdded', 'other_plugin', 'standalone']);
    });

    it('leaves the preference untouched when the plugin owns no entry', async () => {
        const stored = { handAdded: { command: 'my-own-server' } };
        const preferences = new FakePreferenceService(stored);
        const registrar = new TestPluginMcpRegistrar(preferences);

        await registrar.unregister(PLUGIN_ID);

        expect(preferences.value).to.equal(stored);
    });
});

describe('PluginMcpRegistrar.reconcile', () => {

    it('registers a server that appeared after the install, which is how a later mcp.json takes effect', async () => {
        const preferences = new FakePreferenceService({ handAdded: { command: 'my-own-server' } });
        const registrar = new TestPluginMcpRegistrar(preferences);

        await registrar.reconcile([installedPlugin()]);

        expect(Object.keys(preferences.value).sort()).to.deep.equal(['bigquery', 'handAdded']);
        expect((preferences.value.bigquery as { registryMetadata: { pluginId: string } }).registryMetadata.pluginId).to.equal(PLUGIN_ID);
    });

    it('drops the entries of a plugin that is no longer installed', async () => {
        const preferences = new FakePreferenceService({
            bigquery: { command: 'node', registryMetadata: { pluginId: PLUGIN_ID } },
            handAdded: { command: 'my-own-server' }
        });
        const registrar = new TestPluginMcpRegistrar(preferences);

        await registrar.reconcile([]);

        expect(Object.keys(preferences.value)).to.deep.equal(['handAdded']);
    });

    it('writes nothing when the plugins already match, so a filesystem event cannot restart a server', async () => {
        const preferences = new FakePreferenceService();
        const registrar = new TestPluginMcpRegistrar(preferences);
        await registrar.reconcile([installedPlugin()]);
        const afterFirst = preferences.value;

        await registrar.reconcile([installedPlugin()]);

        expect(preferences.value).to.equal(afterFirst);
    });

    it('removes an entry whose server disappeared from the plugin root', async () => {
        const preferences = new FakePreferenceService();
        const registrar = new TestPluginMcpRegistrar(preferences);
        await registrar.reconcile([installedPlugin()]);

        await registrar.reconcile([installedPlugin({ servers: [] })]);

        expect(preferences.value).to.deep.equal({});
    });

    it('never touches an entry the user wrote themselves', async () => {
        const own = { command: 'my-own-server' };
        const standalone = { command: 'npx', registryMetadata: { serverId: 'io.github.example/example-mcp' } };
        const preferences = new FakePreferenceService({ handAdded: own, standalone });
        const registrar = new TestPluginMcpRegistrar(preferences);

        await registrar.reconcile([installedPlugin()]);

        expect(preferences.value.handAdded).to.equal(own);
        expect(preferences.value.standalone).to.equal(standalone);
    });
});
