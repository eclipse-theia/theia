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
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ILogger } from '@theia/core';
import { computeContentHash } from '../common/content-hash';
import { AgentPluginManifestReader } from '../common/plugin/agent-plugin-manifest';
import { PluginDirectoryNamingImpl } from '../common/plugin/plugin-directory-naming';
import { ResolvedPluginEntry } from '../common/plugin/plugin-registry-types';
import { ExtractedPluginTree, GitHubTarballSource, PluginTarballRequest } from './github-tarball-source';
import { PluginInstallBackendServiceImpl } from './plugin-install-backend-service';

const REGISTRY_METADATA_FILE = '.registry.json';
const DIRECTORY_NAME = 'io.github.example_demo-plugin';

const PLUGIN_JSON = JSON.stringify({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'demo-plugin',
    version: '1.2.0',
    description: 'A demo plugin'
});
const MCP_JSON = JSON.stringify({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: { demo: { type: 'stdio', command: './bin/serve' } }
});
const SKILL_MD = '---\nname: deploy\n---\n# Deploy';

/** The plugin tree the fake source extracts, i.e. what the registry consolidated the hash from. */
const PLUGIN_FILES: Record<string, string> = {
    'plugin.json': PLUGIN_JSON,
    'mcp.json': MCP_JSON,
    'bin/serve': '#!/bin/sh\n',
    'skills/deploy/SKILL.md': SKILL_MD
};

function encode(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

/**
 * The registry hash equals the hash the backend computes for a faithfully-downloaded tree: reproducing
 * the registry algorithm is what lets a single recorded hash drive both update and drift detection.
 * Derived from the production function, never hardcoded.
 */
function hashOf(files: Record<string, string>): string {
    return computeContentHash(Object.entries(files).map(([relativePath, content]) => ({ relativePath, content: encode(content) })));
}

const REGISTRY_HASH = hashOf(PLUGIN_FILES);

const entry: ResolvedPluginEntry = {
    pluginId: 'io.github.example/demo-plugin',
    name: 'Demo Plugin',
    description: 'A demo plugin',
    version: '1.2.0',
    sourceUrl: 'https://github.com/example/demo-plugin.git',
    contentHash: REGISTRY_HASH,
    endorsements: [{ organizationId: 'theia', date: '2026-08-07' }],
    containedSkills: [{ name: 'deploy', description: 'Deploy things.', path: 'skills/deploy' }],
    containedMcpServers: [{ name: 'demo', transport: 'stdio' }]
};

const silentLogger = {
    warn: () => Promise.resolve(),
    error: () => Promise.resolve(),
    info: () => Promise.resolve(),
    debug: () => Promise.resolve(),
    trace: () => Promise.resolve()
} as unknown as ILogger;

/** Writes a canned plugin tree into the staging directory the service asks it to fill. */
class FakeTarballSource implements GitHubTarballSource {
    public requests: PluginTarballRequest[] = [];
    constructor(private readonly files: Record<string, string>, private readonly failAfterWriting?: Error) { }
    async fetch(request: PluginTarballRequest): Promise<ExtractedPluginTree> {
        this.requests.push(request);
        for (const [relativePath, content] of Object.entries(this.files)) {
            const target = path.join(request.destination, ...relativePath.split('/'));
            await fs.mkdir(path.dirname(target), { recursive: true });
            await fs.writeFile(target, content);
        }
        if (this.failAfterWriting) {
            throw this.failAfterWriting;
        }
        return { fileCount: Object.keys(this.files).length, droppedLinks: [] };
    }
}

class TestPluginInstallBackendService extends PluginInstallBackendServiceImpl {
    constructor(private readonly pluginsDirectory: string, private readonly dataDirectory: string, tarballSource: GitHubTarballSource) {
        super();
        Object.assign(this, {
            tarballSource,
            manifestReader: new AgentPluginManifestReader(),
            directoryNaming: new PluginDirectoryNamingImpl(),
            logger: silentLogger
        });
    }
    protected override pluginsRoot(): string {
        return this.pluginsDirectory;
    }
    protected override pluginDataRoot(): string {
        return this.dataDirectory;
    }
    /** Exposes the in-memory drift-hash cache size so eviction can be asserted. */
    cacheSize(): number {
        return this.hashCache.size;
    }
    /** Exposes the startup staging sweep so it can be asserted without going through @postConstruct. */
    sweepStaging(): Promise<void> {
        return this.sweepStagingFolders();
    }
}

async function exists(target: string): Promise<boolean> {
    try {
        await fs.lstat(target);
        return true;
    } catch {
        return false;
    }
}

async function expectRejection(promise: Promise<unknown>): Promise<Error> {
    try {
        await promise;
    } catch (error) {
        return error as Error;
    }
    throw new Error('Expected the promise to be rejected.');
}

describe('PluginInstallBackendService', () => {

    let root: string;
    let dataRoot: string;
    const created: TestPluginInstallBackendService[] = [];

    beforeEach(async () => {
        const base = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-install-test-'));
        root = path.join(base, 'plugins');
        dataRoot = path.join(base, 'plugin-data');
        created.length = 0;
    });

    afterEach(async () => {
        created.forEach(instance => instance.dispose());
        await fs.rm(path.dirname(root), { recursive: true, force: true });
    });

    function service(files: Record<string, string> = PLUGIN_FILES, failAfterWriting?: Error): TestPluginInstallBackendService {
        const instance = new TestPluginInstallBackendService(root, dataRoot, new FakeTarballSource(files, failAfterWriting));
        created.push(instance);
        return instance;
    }

    async function stagingFolders(): Promise<string[]> {
        return (await fs.readdir(root)).filter(name => name.startsWith('.installing-'));
    }

    async function install(instance: TestPluginInstallBackendService, replaceExisting = false): Promise<void> {
        const staged = await instance.stage(entry);
        await instance.commit(staged.stagingId, replaceExisting);
    }

    it('stages a download without writing anything to the plugin root', async () => {
        const instance = service();

        const staged = await instance.stage(entry);

        expect(staged.mismatch).to.equal(undefined);
        expect(await exists(path.join(root, DIRECTORY_NAME))).to.equal(false);
        expect(await stagingFolders()).to.have.length(1);
        expect(await instance.listInstalledPlugins()).to.deep.equal([]);
    });

    it('commits a staged download into <pluginsRoot>/<filenamified id> and records the endorsed hash', async () => {
        const instance = service();

        const staged = await instance.stage(entry);
        const installed = await instance.commit(staged.stagingId, false);

        const pluginRoot = path.join(root, DIRECTORY_NAME);
        expect(await fs.readFile(path.join(pluginRoot, 'plugin.json'), 'utf8')).to.equal(PLUGIN_JSON);
        expect(await fs.readFile(path.join(pluginRoot, 'skills', 'deploy', 'SKILL.md'), 'utf8')).to.equal(SKILL_MD);
        const metadata = JSON.parse(await fs.readFile(path.join(pluginRoot, REGISTRY_METADATA_FILE), 'utf8'));
        expect(metadata.pluginId).to.equal(entry.pluginId);
        expect(metadata.contentHash).to.equal(REGISTRY_HASH);
        expect(installed.directoryName).to.equal(DIRECTORY_NAME);
        expect(installed.root).to.equal(pluginRoot);
        expect(installed.drifted).to.equal(false);
        expect(await stagingFolders()).to.deep.equal([]);
    });

    describe('qualifier', () => {

        it('uses the last segment of the identifier, not the publisher-qualified directory name', async () => {
            const instance = service();

            const installed = await instance.commit((await instance.stage(entry)).stagingId, false);

            expect(installed.directoryName).to.equal(DIRECTORY_NAME);
            expect(installed.qualifier).to.equal('demo-plugin');
        });

        it('leaves the qualifier of the plugin that claimed it first alone, and falls back for the second', async () => {
            const first = service();
            await first.commit((await first.stage(entry)).stagingId, false);

            const rival = { ...entry, pluginId: 'io.github.other/demo-plugin' };
            const second = service();
            const installed = await second.commit((await second.stage(rival)).stagingId, false);

            expect(installed.qualifier).to.equal('io.github.other_demo-plugin');
            expect((await second.listInstalledPlugins()).find(p => p.pluginId === entry.pluginId)?.qualifier).to.equal('demo-plugin');
        });

        it('keeps the recorded qualifier across an update, so a plugin never renames its own skills', async () => {
            const instance = service();
            await instance.commit((await instance.stage(entry)).stagingId, false);

            const updated = await instance.commit((await instance.stage(entry)).stagingId, true);

            expect(updated.qualifier).to.equal('demo-plugin');
        });

        it('records a qualifier on link, so an adopted directory qualifies like an installed one', async () => {
            const instance = service();
            await fs.mkdir(path.join(root, DIRECTORY_NAME), { recursive: true });
            await fs.writeFile(path.join(root, DIRECTORY_NAME, 'plugin.json'), PLUGIN_JSON);

            const linked = await instance.link(entry, DIRECTORY_NAME);

            expect(linked.qualifier).to.equal('demo-plugin');
        });
    });

    it('creates the plugin data directory on commit, because it must exist before any server is launched', async () => {
        const instance = service();

        const installed = await instance.commit((await instance.stage(entry)).stagingId, false);

        expect(installed.dataRoot).to.equal(path.join(dataRoot, DIRECTORY_NAME));
        expect(await exists(installed.dataRoot)).to.equal(true);
    });

    it('reports a content hash mismatch instead of throwing, and leaves the plugins root untouched', async () => {
        const instance = service();

        const staged = await instance.stage({ ...entry, contentHash: 'deadbeefdead' });

        expect(staged.mismatch).to.deep.equal({ expected: 'deadbeefdead', actual: REGISTRY_HASH });
        expect(await exists(path.join(root, DIRECTORY_NAME))).to.equal(false);
    });

    it('records the endorsed hash when the user overrides a mismatch, so the difference shows as drift', async () => {
        const instance = service();

        const staged = await instance.stage({ ...entry, contentHash: 'deadbeefdead' });
        const installed = await instance.commit(staged.stagingId, false);

        const metadata = JSON.parse(await fs.readFile(path.join(root, DIRECTORY_NAME, REGISTRY_METADATA_FILE), 'utf8'));
        expect(metadata.contentHash).to.equal('deadbeefdead');
        expect(installed.drifted).to.equal(true);
    });

    it('rejects a download without a plugin.json and cleans up its staging directory', async () => {
        const instance = service({ 'mcp.json': MCP_JSON });

        const error = await expectRejection(instance.stage(entry));

        expect(error.message).to.match(/plugin\.json/);
        expect(await stagingFolders()).to.deep.equal([]);
        expect(await exists(path.join(root, DIRECTORY_NAME))).to.equal(false);
    });

    it('rejects a download whose plugin.json violates the manifest schema and cleans up its staging directory', async () => {
        const instance = service({ ...PLUGIN_FILES, 'plugin.json': JSON.stringify({ name: 'demo-plugin' }) });

        const error = await expectRejection(instance.stage(entry));

        expect(error.message).to.match(/\$schema/);
        expect(await stagingFolders()).to.deep.equal([]);
    });

    it('cleans up the staging directory when the download fails partway through', async () => {
        const instance = service(PLUGIN_FILES, new Error('connection reset'));

        const error = await expectRejection(instance.stage(entry));

        expect(error.message).to.equal('connection reset');
        expect(await stagingFolders()).to.deep.equal([]);
        expect(await exists(path.join(root, DIRECTORY_NAME))).to.equal(false);
    });

    it('discards a staged download the user declined, and then refuses to commit it', async () => {
        const instance = service();
        const staged = await instance.stage(entry);

        await instance.discard(staged.stagingId);

        expect(await stagingFolders()).to.deep.equal([]);
        expect((await expectRejection(instance.commit(staged.stagingId, false))).message).to.match(/no longer available/i);
    });

    it('refuses to commit over an existing plugin directory rather than failing on the rename', async () => {
        const instance = service();
        await install(instance);
        const staged = await instance.stage(entry);

        const error = await expectRejection(instance.commit(staged.stagingId, false));

        // Without the check this is a raw ENOTEMPTY quoting the user's home directory.
        expect(error.message).to.match(/already installed/i);
        expect(error.message).to.not.match(/ENOTEMPTY/);
        // The install that is already there is untouched, and nothing is left in staging.
        expect(await exists(path.join(root, DIRECTORY_NAME, 'plugin.json'))).to.equal(true);
        expect(await stagingFolders()).to.deep.equal([]);
    });

    it('refuses a plugin id that does not encode to a usable directory name', async () => {
        const error = await expectRejection(service().stage({ ...entry, pluginId: '' }));

        expect(error.message).to.match(/invalid plugin directory name/i);
        expect(await exists(root)).to.equal(false);
    });

    it('replaces the plugin root on update while preserving the plugin data directory', async () => {
        const instance = service();
        await install(instance);
        const pluginRoot = path.join(root, DIRECTORY_NAME);
        const dataDirectory = path.join(dataRoot, DIRECTORY_NAME);
        await fs.writeFile(path.join(dataDirectory, 'state.db'), 'plugin state');
        // A file the new version no longer ships must be gone after the update.
        await fs.writeFile(path.join(pluginRoot, 'stale.txt'), 'from the old version');

        const updated = service({ ...PLUGIN_FILES, 'plugin.json': PLUGIN_JSON.replace('1.2.0', '1.3.0') });
        await install(updated, true);

        expect(await fs.readFile(path.join(dataDirectory, 'state.db'), 'utf8')).to.equal('plugin state');
        expect(await exists(path.join(pluginRoot, 'stale.txt'))).to.equal(false);
        expect((await updated.listInstalledPlugins())[0].version).to.equal('1.3.0');
    });

    it('uninstalls a plugin root that carries our provenance marker, including its data directory', async () => {
        const instance = service();
        await install(instance);

        await instance.uninstall(entry.pluginId);

        expect(await exists(path.join(root, DIRECTORY_NAME))).to.equal(false);
        expect(await exists(path.join(dataRoot, DIRECTORY_NAME))).to.equal(false);
    });

    it('leaves a directory without our provenance marker untouched on uninstall', async () => {
        const handPlaced = path.join(root, DIRECTORY_NAME);
        await fs.mkdir(handPlaced, { recursive: true });
        await fs.writeFile(path.join(handPlaced, 'plugin.json'), PLUGIN_JSON);

        await service().uninstall(entry.pluginId);

        expect(await exists(path.join(handPlaced, 'plugin.json'))).to.equal(true);
    });

    it('links a hand-placed directory by writing only the provenance marker', async () => {
        const handPlaced = path.join(root, DIRECTORY_NAME);
        await fs.mkdir(handPlaced, { recursive: true });
        await fs.writeFile(path.join(handPlaced, 'plugin.json'), PLUGIN_JSON);

        await service().link(entry, DIRECTORY_NAME);

        expect(await fs.readFile(path.join(handPlaced, 'plugin.json'), 'utf8')).to.equal(PLUGIN_JSON);
        expect(JSON.parse(await fs.readFile(path.join(handPlaced, REGISTRY_METADATA_FILE), 'utf8')).pluginId).to.equal(entry.pluginId);
    });

    it('refuses to link a directory that does not exist', async () => {
        expect((await expectRejection(service().link(entry, DIRECTORY_NAME))).message).to.match(/no local plugin directory/i);
    });

    it('creates the plugin data directory on link, because adoption also ends in launching a subprocess', async () => {
        const handPlaced = path.join(root, DIRECTORY_NAME);
        await fs.mkdir(handPlaced, { recursive: true });
        await fs.writeFile(path.join(handPlaced, 'plugin.json'), PLUGIN_JSON);

        const linked = await service().link(entry, DIRECTORY_NAME);

        expect(await exists(path.join(dataRoot, DIRECTORY_NAME))).to.equal(true);
        expect(linked.dataRoot).to.equal(path.join(dataRoot, DIRECTORY_NAME));
    });

    it('returns the adopted plugin from link, so the caller needs no second listing to register it', async () => {
        const handPlaced = path.join(root, DIRECTORY_NAME);
        await fs.mkdir(path.join(handPlaced, 'skills', 'deploy'), { recursive: true });
        await fs.writeFile(path.join(handPlaced, 'plugin.json'), PLUGIN_JSON);
        await fs.writeFile(path.join(handPlaced, 'mcp.json'), MCP_JSON);
        await fs.writeFile(path.join(handPlaced, 'skills', 'deploy', 'SKILL.md'), SKILL_MD);

        const linked = await service().link(entry, DIRECTORY_NAME);

        expect(linked.pluginId).to.equal(entry.pluginId);
        expect(linked.name).to.equal('demo-plugin');
        expect(linked.skills).to.deep.equal(['deploy']);
        expect(linked.servers.map(server => server.name)).to.deep.equal(['demo']);
        expect(linked.installedAt).to.be.a('string');
    });

    it("refuses to link a directory that is not the one the plugin's identifier names", async () => {
        // Update, Fix and Uninstall all derive their target from the identifier, so adopting any other
        // directory would leave them creating a second one beside it.
        const handPlaced = path.join(root, 'hand-placed-plugin');
        await fs.mkdir(handPlaced, { recursive: true });

        const error = await expectRejection(service().link(entry, 'hand-placed-plugin'));

        expect(error.message).to.match(/can only be linked to a directory named/i);
        expect(await exists(path.join(handPlaced, REGISTRY_METADATA_FILE))).to.equal(false);
    });

    it('unlinks by removing the provenance marker while keeping every other file', async () => {
        const instance = service();
        await install(instance);

        await instance.unlink(entry.pluginId);

        expect(await exists(path.join(root, DIRECTORY_NAME, REGISTRY_METADATA_FILE))).to.equal(false);
        expect(await exists(path.join(root, DIRECTORY_NAME, 'plugin.json'))).to.equal(true);
    });

    it('creates a server working directory declared under ${PLUGIN_DATA}, which nothing else would create', async () => {
        // A subprocess cannot create its own cwd, and the manifest reader does no I/O - so without this
        // the spawn fails with ENOENT on the working directory, reading like a missing executable.
        const files = {
            ...PLUGIN_FILES,
            'mcp.json': JSON.stringify({
                $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
                mcpServers: { demo: { type: 'stdio', command: './bin/serve', cwd: '${PLUGIN_DATA}/work' } }
            })
        };
        const instance = service(files);
        const staged = await instance.stage({ ...entry, contentHash: hashOf(files) });

        const installed = await instance.commit(staged.stagingId, false);

        expect(await exists(path.join(dataRoot, DIRECTORY_NAME, 'work'))).to.equal(true);
        expect(installed.servers[0]).to.have.property('cwd', path.join(dataRoot, DIRECTORY_NAME, 'work'));
    });

    it('does not invent a server working directory that should have shipped with the plugin', async () => {
        // A cwd under the plugin root is the plugin's own content. Creating it would hide a broken
        // plugin behind an empty directory.
        const files = {
            ...PLUGIN_FILES,
            'mcp.json': JSON.stringify({
                $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
                mcpServers: { demo: { type: 'stdio', command: './bin/serve', cwd: './missing' } }
            })
        };
        const instance = service(files);
        const staged = await instance.stage({ ...entry, contentHash: hashOf(files) });

        await instance.commit(staged.stagingId, false);

        expect(await exists(path.join(root, DIRECTORY_NAME, 'missing'))).to.equal(false);
    });

    it('records the endorsed hash the install was accepted against, alongside the computed one', async () => {
        const instance = service();
        const staged = await instance.stage(entry);

        const installed = await instance.commit(staged.stagingId, false);

        expect(installed.contentHash).to.equal(REGISTRY_HASH);
    });

    it('records the endorsed hash, so content the user accepted despite a mismatch reads as drifted', async () => {
        // One stored hash, as the skill marker does it: the registry's. Accepting a mismatch means the
        // content really does differ from what was endorsed, and Fix is the honest offer.
        const instance = service({ ...PLUGIN_FILES, 'extra.txt': 'not in the endorsed tree' });
        const staged = await instance.stage(entry);
        expect(staged.mismatch).to.not.equal(undefined);

        const installed = await instance.commit(staged.stagingId, false);

        expect(installed.contentHash).to.equal(REGISTRY_HASH);
        expect(installed.drifted).to.equal(true);
    });

    it('resolves the manifest, the MCP servers and the skills from the installed plugin root', async () => {
        const instance = service();
        await install(instance);

        const installed = await instance.listInstalledPlugins();

        expect(installed).to.have.length(1);
        const pluginRoot = path.join(root, DIRECTORY_NAME);
        expect(installed[0].pluginId).to.equal(entry.pluginId);
        expect(installed[0].name).to.equal('demo-plugin');
        expect(installed[0].version).to.equal('1.2.0');
        expect(installed[0].skills).to.deep.equal(['deploy']);
        expect(installed[0].servers).to.have.length(1);
        expect(installed[0].servers[0].name).to.equal('demo');
        expect(installed[0].servers[0].kind).to.equal('stdio');
        expect(installed[0].skipped).to.deep.equal([]);
        expect(installed[0].mcpDisabledReason).to.equal(undefined);
        expect(installed[0].root).to.equal(pluginRoot);
    });

    it('discovers only immediate children of skills/ and never recurses deeper', async () => {
        const instance = service({
            ...PLUGIN_FILES,
            'skills/report/SKILL.md': '# Report',
            'skills/report/nested/SKILL.md': '# Not a skill of its own',
            'skills/no-manifest/notes.md': 'no SKILL.md here',
            'skills/SKILL.md': '# Not a skill either - not inside a child directory'
        });
        await install(instance);

        const installed = await instance.listInstalledPlugins();

        // Sorted, not in readdir order, so a card rendered from this does not reshuffle between scans.
        expect(installed[0].skills).to.deep.equal(['deploy', 'report']);
    });

    it('reports the skills component as invalid when skills is not a directory', async () => {
        const instance = service({ 'plugin.json': PLUGIN_JSON, skills: 'not a directory' });
        await install(instance);

        const installed = await instance.listInstalledPlugins();

        expect(installed[0].skills).to.deep.equal([]);
        expect(installed[0].skipped).to.deep.equal([{ name: 'skills', reason: '"skills" is not a directory.' }]);
    });

    it('disables MCP for the plugin when mcp.json is not valid JSON, keeping the skills', async () => {
        const instance = service({ ...PLUGIN_FILES, 'mcp.json': 'not json at all' });
        await install(instance);

        const installed = await instance.listInstalledPlugins();

        expect(installed[0].mcpDisabledReason).to.match(/not valid JSON/i);
        expect(installed[0].servers).to.deep.equal([]);
        expect(installed[0].skills).to.deep.equal(['deploy']);
    });

    it('reports a plugin whose plugin.json cannot be parsed without components, rather than hiding it', async () => {
        const instance = service();
        await install(instance);
        await fs.writeFile(path.join(root, DIRECTORY_NAME, 'plugin.json'), 'not json at all');

        const installed = await instance.listInstalledPlugins();

        expect(installed[0].name).to.equal(undefined);
        expect(installed[0].servers).to.deep.equal([]);
        expect(installed[0].skipped[0].name).to.equal('plugin.json');
        expect(installed[0].drifted).to.equal(true);
    });

    it('lists a hand-placed directory without provenance, and skips dot-prefixed entries and plain files', async () => {
        const instance = service();
        await install(instance);
        await fs.mkdir(path.join(root, 'hand-placed-plugin'), { recursive: true });
        await fs.writeFile(path.join(root, 'hand-placed-plugin', 'plugin.json'), PLUGIN_JSON);
        await fs.mkdir(path.join(root, '.hidden'), { recursive: true });
        await fs.writeFile(path.join(root, 'loose-file.txt'), 'not a plugin');

        const installed = await instance.listInstalledPlugins();

        expect(installed.map(info => info.directoryName).sort()).to.deep.equal(['hand-placed-plugin', DIRECTORY_NAME]);
        const handPlaced = installed.find(info => info.directoryName === 'hand-placed-plugin');
        expect(handPlaced?.pluginId).to.equal(undefined);
        expect(handPlaced?.drifted).to.equal(false);
        expect(handPlaced?.name).to.equal('demo-plugin');
    });

    it('reports the plugin data directory even for a directory that has none yet, so PLUGIN_DATA is always known', async () => {
        await fs.mkdir(path.join(root, 'hand-placed-plugin'), { recursive: true });
        await fs.writeFile(path.join(root, 'hand-placed-plugin', 'plugin.json'), PLUGIN_JSON);

        const installed = await service().listInstalledPlugins();

        expect(installed[0].dataRoot).to.equal(path.join(dataRoot, 'hand-placed-plugin'));
        expect(await exists(installed[0].dataRoot)).to.equal(false);
    });

    it('reports drift once the installed files diverge from the recorded hash', async () => {
        const instance = service();
        await install(instance);

        expect((await instance.listInstalledPlugins())[0].drifted).to.equal(false);
        await fs.writeFile(path.join(root, DIRECTORY_NAME, 'bin', 'serve'), '#!/bin/sh\necho edited locally\n');

        expect((await instance.listInstalledPlugins())[0].drifted).to.equal(true);
    });

    it('evicts cached drift hashes for plugins that no longer exist', async () => {
        const instance = service();
        await install(instance);
        await instance.listInstalledPlugins();
        expect(instance.cacheSize()).to.equal(1);

        await instance.uninstall(entry.pluginId);
        await instance.listInstalledPlugins();

        expect(instance.cacheSize()).to.equal(0);
    });

    it('sweeps staging directories left behind by a previous backend, keeping other dot-directories', async () => {
        await fs.mkdir(path.join(root, `.installing-${DIRECTORY_NAME}-123`), { recursive: true });
        await fs.mkdir(path.join(root, '.other'), { recursive: true });

        await service().sweepStaging();

        expect(await exists(path.join(root, `.installing-${DIRECTORY_NAME}-123`))).to.equal(false);
        expect(await exists(path.join(root, '.other'))).to.equal(true);
    });

    it('keeps a staging directory of the running process when sweeping', async () => {
        const instance = service();
        const staged = await instance.stage(entry);

        await instance.sweepStaging();

        expect(await exists(path.join(root, staged.stagingId))).to.equal(true);
    });

    it('notifies a registered client when the plugins directory changes on disk', async function (): Promise<void> {
        this.timeout(8000);
        const instance = service();
        let notifications = 0;
        instance.setClient({ notifyDidChangeInstalledPlugins: () => { notifications += 1; }, notifyWatcherStopped: () => { } });
        // Allow the (async) recursive watcher to start before triggering a change.
        await new Promise(resolve => setTimeout(resolve, 700));
        await fs.mkdir(path.join(root, 'externally-added'), { recursive: true });
        // Wait past the debounce window for the notification to land.
        await new Promise(resolve => setTimeout(resolve, 1000));

        expect(notifications).to.be.greaterThan(0);
    });

    it('exposes the plugins root so the frontend can contribute skill roots beneath it', async () => {
        expect(await service().getPluginsRoot()).to.equal(root);
    });
});
