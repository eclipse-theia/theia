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
import { Container } from '@theia/core/shared/inversify';
import { Emitter, MessageService, PreferenceService } from '@theia/core';
import { MCP_SERVERS_PREF } from '@theia/ai-mcp/lib/common/mcp-preferences';
import { MCPFrontendService } from '@theia/ai-mcp/lib/common/mcp-server-manager';
import { MCPServerEditor } from '@theia/ai-mcp/lib/browser/mcp-server-editor';
import { RegistryFetchService } from '../../common/registry-fetch-service';
import { ResolvedRegistryEntry } from '../../common/mcp/mcp-registry-types';
import { MCPRegistryEntryResolver } from '../../common/mcp/mcp-registry-entry-resolver';
import { MCPInstallService } from './mcp-install-service';
import { MCPExtensionsContribution } from './mcp-extensions-contribution';
import { MCPInstalledEntry, MCPSearchResultEntry } from './mcp-entries';

class FakePreferenceService {
    private readonly store = new Map<string, unknown>();
    private readonly listeners: ((change: { preferenceName: string }) => void)[] = [];
    get<T>(key: string, defaultValue?: T): T | undefined {
        return (this.store.has(key) ? this.store.get(key) : defaultValue) as T | undefined;
    }
    async set(key: string, value: unknown): Promise<void> {
        this.store.set(key, value);
        for (const l of this.listeners) {
            l({ preferenceName: key });
        }
    }
    onPreferenceChanged(listener: (change: { preferenceName: string }) => void): { dispose(): void } {
        this.listeners.push(listener);
        return { dispose: () => { /* no-op for tests */ } };
    }
}

class StubRegistryFetchService {
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    constructor(public entries: ResolvedRegistryEntry[] = []) { }
    async getEntries(): Promise<ResolvedRegistryEntry[]> {
        return this.entries;
    }
}

function buildContainer(prefs: FakePreferenceService, fetch: StubRegistryFetchService): Container {
    const container = new Container();
    container.bind(PreferenceService).toConstantValue(prefs);
    container.bind(RegistryFetchService).toConstantValue(fetch as unknown as RegistryFetchService);
    container.bind(MCPRegistryEntryResolver).toSelf().inSingletonScope();
    // Editor dependencies — the contribution doesn't invoke the install path here, but
    // MCPInstallService now injects MCPServerEditor so we stub its required services.
    container.bind(MessageService).toConstantValue({ error: () => undefined } as unknown as MessageService);
    container.bind(MCPFrontendService).toConstantValue({} as unknown as MCPFrontendService);
    container.bind(MCPServerEditor).toSelf().inSingletonScope();
    container.bind(MCPInstallService).toSelf().inSingletonScope();
    container.bind(MCPExtensionsContribution).toSelf().inSingletonScope();
    return container;
}

const exampleRegistryEntry: ResolvedRegistryEntry = {
    serverId: 'io.github.example/example-mcp',
    name: 'Example',
    description: 'Example MCP server',
    localSlug: 'example',
    config: { command: 'npx', args: ['-y', 'example-mcp'] },
    version: '^1.0.0',
    configHash: 'hash-v1',
    mcpRegistryVerified: true
};

describe('MCPExtensionsContribution.resolveInstalled', () => {

    it('only surfaces servers tied to a registry entry; user-added entries are filtered out', async () => {
        const prefs = new FakePreferenceService();
        await prefs.set(MCP_SERVERS_PREF, {
            // Linked: matches a registry entry by serverId.
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp'],
                registryServerId: exampleRegistryEntry.serverId,
                registryVersion: exampleRegistryEntry.version,
                registryConfigHash: exampleRegistryEntry.configHash
            },
            // User-added: no registry counterpart at all.
            standalone: { command: 'node', args: ['srv.js'] }
        });
        const fetch = new StubRegistryFetchService([exampleRegistryEntry]);
        const contribution = buildContainer(prefs, fetch).get(MCPExtensionsContribution);

        const entries = [...await contribution.resolveInstalled()] as MCPInstalledEntry[];

        expect(entries.map(e => e.local.name)).to.deep.equal(['example']);
        expect(entries[0].state).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: false });
    });

    it('surfaces installed-registry-revoked entries so the view can render the warning + Remove action', async () => {
        const prefs = new FakePreferenceService();
        await prefs.set(MCP_SERVERS_PREF, {
            revoked: {
                command: 'npx',
                args: ['-y', 'gone-mcp'],
                registryServerId: 'io.github.example/gone-server',
                registryVersion: '^1.0.0'
            }
        });
        const fetch = new StubRegistryFetchService([exampleRegistryEntry]);
        const contribution = buildContainer(prefs, fetch).get(MCPExtensionsContribution);

        const entries = [...await contribution.resolveInstalled()] as MCPInstalledEntry[];

        expect(entries.map(e => e.local.name)).to.deep.equal(['revoked']);
        expect(entries[0].state).to.deep.equal({ kind: 'installed-registry-revoked' });
    });

    it('shows installed-registry-revoked (Remove) when the local is linked to a missing id, even if the slug still matches a registry entry', async () => {
        // PR scenario: user installs from the registry, then manually rewrites
        // `registryServerId` to a value that no longer exists. The local slug still
        // matches a registry `localSlug`, but the broken id linkage must take precedence
        // — the entry has to surface as revoked so the user sees Remove + warning, not
        // Link (which would suggest the entry is merely unlinked).
        const prefs = new FakePreferenceService();
        await prefs.set(MCP_SERVERS_PREF, {
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp'],
                registryServerId: 'io.example/gone',
                registryVersion: '^1.0.0',
                registryConfigHash: 'hash-v1'
            }
        });
        const fetch = new StubRegistryFetchService([exampleRegistryEntry]);
        const contribution = buildContainer(prefs, fetch).get(MCPExtensionsContribution);

        const entries = [...await contribution.resolveInstalled()] as MCPInstalledEntry[];

        expect(entries).to.have.length(1);
        expect(entries[0].state).to.deep.equal({ kind: 'installed-registry-revoked' });
    });

    it('skips malformed stored entries whose `command` is not a string — mere key presence is not enough', async () => {
        const prefs = new FakePreferenceService();
        await prefs.set(MCP_SERVERS_PREF, {
            // `command` is present but typed wrong; the shared MCPServersPreference.isValue
            // guard must reject this so it doesn't get cast to MCPServerDescription.
            broken: { command: 42, args: ['-y', 'whatever'] },
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp'],
                registryServerId: exampleRegistryEntry.serverId,
                registryVersion: exampleRegistryEntry.version,
                registryConfigHash: exampleRegistryEntry.configHash
            }
        });
        const fetch = new StubRegistryFetchService([exampleRegistryEntry]);
        const contribution = buildContainer(prefs, fetch).get(MCPExtensionsContribution);

        const entries = [...await contribution.resolveInstalled()] as MCPInstalledEntry[];

        expect(entries.map(e => e.local.name)).to.deep.equal(['example']);
    });
});

describe('MCPExtensionsContribution.resolveSearchResults', () => {

    const githubEntry: ResolvedRegistryEntry = {
        serverId: 'io.github.github/github-mcp-server',
        name: 'GitHub',
        description: 'Connect AI assistants to GitHub repositories',
        localSlug: 'github',
        config: { command: 'docker', args: ['run', '-i', '--rm'] },
        version: '^1.0.0',
        configHash: 'hash-github',
        mcpRegistryVerified: true
    };

    it('returns nothing for an empty or whitespace-only query', async () => {
        const prefs = new FakePreferenceService();
        const fetch = new StubRegistryFetchService([exampleRegistryEntry, githubEntry]);
        const contribution = buildContainer(prefs, fetch).get(MCPExtensionsContribution);

        const empty = [...await contribution.resolveSearchResults('', { verifiedOnly: false })];
        const whitespace = [...await contribution.resolveSearchResults('   ', { verifiedOnly: false })];

        expect(empty).to.be.empty;
        expect(whitespace).to.be.empty;
    });

    it('returns all entries with searchableText covering name, serverId and description so the global fuzzy ranker can match any of them', async () => {
        const prefs = new FakePreferenceService();
        const fetch = new StubRegistryFetchService([exampleRegistryEntry, githubEntry]);
        const contribution = buildContainer(prefs, fetch).get(MCPExtensionsContribution);

        // The contribution intentionally does not filter by the query string: that's the
        // view's job (`VSXExtensionsSource.collectSearchResults` runs `FuzzySearch.filter`
        // across results from every contribution). The contribution's only responsibility
        // is to supply candidates with rich `searchableText`.
        const results = [...await contribution.resolveSearchResults('REPOSITORIES', { verifiedOnly: false })];

        expect(results).to.have.length(2);
        const githubResult = results.find(r => (r.element as MCPSearchResultEntry).entry.serverId === githubEntry.serverId)!;
        expect(githubResult.searchableText).to.contain(githubEntry.name);
        expect(githubResult.searchableText).to.contain(githubEntry.serverId);
        expect(githubResult.searchableText).to.contain(githubEntry.description);
    });

    it('classifies a registry entry as installed-registry-revoked when the matching-slug local is linked to a server id missing from the registry', async () => {
        // PR scenario: user installed `example` from the registry, then manually pointed
        // its `registryServerId` at an id not in the registry. In Search results the
        // matching registry entry must show the **Remove** affordance — mirroring what
        // the Installed view shows — instead of **Link** (which would imply the local is
        // merely unlinked rather than revoked).
        const prefs = new FakePreferenceService();
        await prefs.set(MCP_SERVERS_PREF, {
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp'],
                registryServerId: 'io.example/gone',
                registryVersion: '^1.0.0',
                registryConfigHash: 'hash-v1'
            }
        });
        const fetch = new StubRegistryFetchService([exampleRegistryEntry]);
        const contribution = buildContainer(prefs, fetch).get(MCPExtensionsContribution);

        const results = [...await contribution.resolveSearchResults('example', { verifiedOnly: false })];
        const exampleResult = results.find(r => (r.element as MCPSearchResultEntry).entry.serverId === exampleRegistryEntry.serverId);

        expect(exampleResult, 'registry entry must surface in search results').to.not.be.undefined;
        expect((exampleResult!.element as MCPSearchResultEntry).state).to.deep.equal({ kind: 'installed-registry-revoked' });
    });

    it('omits unverified entries when verifiedOnly is true and keeps verified ones', async () => {
        const unverified: ResolvedRegistryEntry = { ...exampleRegistryEntry, mcpRegistryVerified: false };
        const prefs = new FakePreferenceService();
        const fetch = new StubRegistryFetchService([unverified, githubEntry]);
        const contribution = buildContainer(prefs, fetch).get(MCPExtensionsContribution);

        const all = [...await contribution.resolveSearchResults('example', { verifiedOnly: false })];
        const verifiedOnly = [...await contribution.resolveSearchResults('example', { verifiedOnly: true })];

        expect(all).to.have.length(2);
        expect(verifiedOnly).to.have.length(1);
        expect((verifiedOnly[0].element as MCPSearchResultEntry).entry.serverId).to.equal(githubEntry.serverId);
    });
});
