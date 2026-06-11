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
import { MessageService, PreferenceService } from '@theia/core';
import { MCP_SERVERS_PREF } from '@theia/ai-mcp/lib/common/mcp-preferences';
import { MCPFrontendService } from '@theia/ai-mcp/lib/common/mcp-server-manager';
import { MCPServerEditor, MCPServerEditorImpl, MCPServerEditDialogFactory } from '@theia/ai-mcp/lib/browser/mcp-server-editor';
import { ResolvedRegistryEntry } from '../../common/mcp/mcp-registry-types';
import { MCPInstallService, MCPInstallServiceImpl } from './mcp-install-service';

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

describe('MCPInstallService.classifyRegistryEntry', () => {

    const entry: ResolvedRegistryEntry = {
        serverId: 'io.github.example/example-mcp',
        name: 'Example',
        description: 'Example MCP server',
        localName: 'example',
        config: { command: 'npx', args: ['-y', 'example-mcp'] },
        version: '^1.0.0',
        configHash: 'hash-v1',
        mcpRegistryVerified: true
    };

    let service: MCPInstallService;

    beforeEach(() => {
        service = new MCPInstallServiceImpl();
    });

    it('returns not-installed when no local server matches the registry slug', () => {
        expect(service.classifyRegistryEntry(entry, [], [entry])).to.deep.equal({ kind: 'not-installed' });
    });

    it('returns installed-from-registry with no update when the linked serverId matches and configHash matches', () => {
        const locals = [{
            name: 'example',
            command: 'npx',
            args: ['-y', 'example-mcp'],
            registryMetadata: {
                serverId: entry.serverId,
                version: entry.version,
                configHash: entry.configHash
            }
        }];
        expect(service.classifyRegistryEntry(entry, locals, [entry])).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: false });
    });

    it('returns installed-from-registry with update available when the linked configHash differs from the entry configHash', () => {
        const locals = [{
            name: 'example',
            command: 'npx',
            args: ['-y', 'example-mcp'],
            registryMetadata: {
                serverId: entry.serverId,
                // Display version still matches - update detection must rely on the hash alone.
                version: entry.version,
                configHash: 'hash-v0'
            }
        }];
        expect(service.classifyRegistryEntry(entry, locals, [entry])).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: true });
    });

    it('does not offer an update when the linked version drifts but the configHash still matches - version is display-only', () => {
        const locals = [{
            name: 'example',
            command: 'npx',
            args: ['-y', 'example-mcp'],
            registryMetadata: {
                serverId: entry.serverId,
                // Local version is stale, but the underlying approval hasn't changed.
                version: '^0.9.0',
                configHash: entry.configHash
            }
        }];
        expect(service.classifyRegistryEntry(entry, locals, [entry])).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: false });
    });

    it('does not offer an update when the registry entry has no configHash - keeps older payloads quiet', () => {
        const noHashEntry: ResolvedRegistryEntry = { ...entry, configHash: undefined };
        const locals = [{
            name: 'example',
            command: 'npx',
            args: ['-y', 'example-mcp'],
            registryMetadata: {
                serverId: entry.serverId,
                version: entry.version
            }
        }];
        expect(service.classifyRegistryEntry(noHashEntry, locals, [noHashEntry])).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: false });
    });

    it('returns installed-manually when a local stdio server matches name + command + args but has no registryMetadata', () => {
        const locals = [{
            name: 'example',
            command: 'npx',
            args: ['-y', 'example-mcp']
        }];
        expect(service.classifyRegistryEntry(entry, locals, [entry])).to.deep.equal({ kind: 'installed-manually' });
    });

    it('returns installed-manually for a remote entry when a local server matches name + serverUrl but has no registryMetadata', () => {
        const remoteEntry: ResolvedRegistryEntry = {
            serverId: 'io.github.example/remote-mcp',
            name: 'Remote Example',
            description: 'Remote MCP server',
            localName: 'remote-example',
            config: { serverUrl: 'https://example.com/mcp' },
            version: '^1.0.0',
            configHash: 'hash-remote',
            mcpRegistryVerified: true
        };
        const locals = [{
            name: 'remote-example',
            serverUrl: 'https://example.com/mcp'
        }];
        expect(service.classifyRegistryEntry(remoteEntry, locals, [remoteEntry])).to.deep.equal({ kind: 'installed-manually' });
    });

    it('returns installed-manually for an unlinked local server matching the slug even if the config differs - drift only matters once linked', () => {
        const locals = [{
            name: 'example',
            command: 'node',
            args: ['-y', 'example-mcp']
        }];
        expect(service.classifyRegistryEntry(entry, locals, [entry])).to.deep.equal({ kind: 'installed-manually' });
    });

    it('returns installed-link-stale when the slug-matching local is linked to a server id that is absent from the registry', () => {
        const locals = [{
            name: 'example',
            command: 'npx',
            args: ['-y', 'example-mcp'],
            registryMetadata: {
                serverId: 'io.example/gone',
                version: '^1.0.0',
                configHash: 'hash-v1'
            }
        }];
        // The registry still publishes `entry` (slug `example`) but no longer publishes
        // `io.example/gone`. The local must surface as link-stale so the Search view
        // mirrors what the Installed view shows (Unlink + Uninstall instead of Link).
        expect(service.classifyRegistryEntry(entry, locals, [entry])).to.deep.equal({ kind: 'installed-link-stale' });
    });

    it('returns installed-manually (not link-stale) when the slug-matching local is linked to a different but valid registry id', () => {
        const otherEntry: ResolvedRegistryEntry = {
            ...entry,
            serverId: 'io.github.example/other-mcp',
            localName: 'other'
        };
        const locals = [{
            name: 'example',
            command: 'npx',
            args: ['-y', 'example-mcp'],
            // The id is real - just bound to a different registry entry. The user can still
            // re-link this local to `entry` from Search, so we surface Link, not Unlink.
            registryMetadata: { serverId: otherEntry.serverId }
        }];
        expect(service.classifyRegistryEntry(entry, locals, [entry, otherEntry])).to.deep.equal({ kind: 'installed-manually' });
    });

    it('returns fix-config only when the local server is already linked to this serverId but its registry-set fields diverge', () => {
        const locals = [{
            name: 'example',
            command: 'node',
            args: ['-y', 'example-mcp'],
            registryMetadata: {
                serverId: entry.serverId,
                version: entry.version,
                configHash: entry.configHash
            }
        }];
        expect(service.classifyRegistryEntry(entry, locals, [entry])).to.deep.equal({ kind: 'fix-config' });
    });

    it('treats user-added env keys absent from the registry config as non-drift (installed-from-registry) for linked servers', () => {
        const entryWithEnv: ResolvedRegistryEntry = {
            ...entry,
            config: { command: 'npx', args: ['-y', 'example-mcp'], env: { LOG_LEVEL: 'info' } }
        };
        const locals = [{
            name: 'example',
            command: 'npx',
            args: ['-y', 'example-mcp'],
            env: { LOG_LEVEL: 'info', USER_TOKEN: 'secret' },
            registryMetadata: {
                serverId: entry.serverId,
                version: entry.version,
                configHash: entry.configHash
            }
        }];
        expect(service.classifyRegistryEntry(entryWithEnv, locals, [entryWithEnv])).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: false });
    });

    it('returns fix-config when a linked server has a registry-set env value differing from the local one', () => {
        const entryWithEnv: ResolvedRegistryEntry = {
            ...entry,
            config: { command: 'npx', args: ['-y', 'example-mcp'], env: { LOG_LEVEL: 'info' } }
        };
        const locals = [{
            name: 'example',
            command: 'npx',
            args: ['-y', 'example-mcp'],
            env: { LOG_LEVEL: 'debug' },
            registryMetadata: {
                serverId: entry.serverId,
                version: entry.version,
                configHash: entry.configHash
            }
        }];
        expect(service.classifyRegistryEntry(entryWithEnv, locals, [entryWithEnv])).to.deep.equal({ kind: 'fix-config' });
    });
});

describe('MCPInstallService.classifyLocalServer', () => {

    const exampleEntry: ResolvedRegistryEntry = {
        serverId: 'io.github.example/example-mcp',
        name: 'Example',
        description: 'Example MCP server',
        localName: 'example',
        config: { command: 'npx', args: ['-y', 'example-mcp'] },
        version: '^1.0.0',
        configHash: 'hash-v1',
        mcpRegistryVerified: true
    };

    let service: MCPInstallService;

    beforeEach(() => {
        service = new MCPInstallServiceImpl();
    });

    it('returns installed-user-added when the local server has no registryMetadata and no registry entry matches its slug', () => {
        const local = { name: 'unrelated', command: 'node', args: ['my-script.js'] };
        expect(service.classifyLocalServer(local, [exampleEntry])).to.deep.equal({ kind: 'installed-user-added' });
    });

    it('returns installed-from-registry with no update when the linked serverId matches and configHash matches', () => {
        const local = {
            name: 'example',
            command: 'npx',
            args: ['-y', 'example-mcp'],
            registryMetadata: {
                serverId: exampleEntry.serverId,
                version: exampleEntry.version,
                configHash: exampleEntry.configHash
            }
        };
        expect(service.classifyLocalServer(local, [exampleEntry])).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: false });
    });

    it('returns installed-from-registry with update available when the linked configHash differs from the matched entry configHash', () => {
        const local = {
            name: 'example',
            command: 'npx',
            args: ['-y', 'example-mcp'],
            registryMetadata: {
                serverId: exampleEntry.serverId,
                version: exampleEntry.version,
                configHash: 'hash-v0'
            }
        };
        expect(service.classifyLocalServer(local, [exampleEntry])).to.deep.equal({ kind: 'installed-from-registry', updateAvailable: true });
    });

    it('returns installed-link-stale when the linked serverId points to a serverId no longer in the registry', () => {
        const local = {
            name: 'example',
            command: 'npx',
            args: ['-y', 'example-mcp'],
            registryMetadata: {
                serverId: 'io.github.example/removed-mcp',
                version: '^1.0.0',
                configHash: 'hash-removed'
            }
        };
        expect(service.classifyLocalServer(local, [exampleEntry])).to.deep.equal({ kind: 'installed-link-stale' });
    });

    it('returns installed-manually when the local server has no registryMetadata but its slug matches a registry entry', () => {
        const local = {
            name: 'example',
            command: 'npx',
            args: ['-y', 'example-mcp']
        };
        expect(service.classifyLocalServer(local, [exampleEntry])).to.deep.equal({ kind: 'installed-manually' });
    });

    it('returns installed-manually when an unlinked local server has a diverging command - Link must be offered before drift is actioned', () => {
        const local = {
            name: 'example',
            command: 'node',
            args: ['-y', 'example-mcp']
        };
        expect(service.classifyLocalServer(local, [exampleEntry])).to.deep.equal({ kind: 'installed-manually' });
    });

    it('returns fix-config when a linked local server has drifted away from the registry config', () => {
        const local = {
            name: 'example',
            command: 'node',
            args: ['-y', 'example-mcp'],
            registryMetadata: {
                serverId: exampleEntry.serverId,
                version: exampleEntry.version,
                configHash: exampleEntry.configHash
            }
        };
        expect(service.classifyLocalServer(local, [exampleEntry])).to.deep.equal({ kind: 'fix-config' });
    });
});

describe('MCPInstallService actions', () => {

    const entry: ResolvedRegistryEntry = {
        serverId: 'io.github.example/example-mcp',
        name: 'Example',
        description: 'Example MCP server',
        localName: 'example',
        config: { command: 'npx', args: ['-y', 'example-mcp'] },
        version: '^1.0.0',
        configHash: 'hash-v1',
        mcpRegistryVerified: true
    };

    let prefs: FakePreferenceService;
    let service: MCPInstallService;

    beforeEach(() => {
        const container = new Container();
        prefs = new FakePreferenceService();
        container.bind(PreferenceService).toConstantValue(prefs);
        // Stubs for the editor's deps - we only exercise installFromEntry which uses
        // PreferenceService; MessageService and MCPFrontendService are referenced by other
        // editor methods that the install path doesn't touch.
        container.bind(MessageService).toConstantValue({ error: () => undefined } as unknown as MessageService);
        container.bind(MCPFrontendService).toConstantValue({} as unknown as MCPFrontendService);
        // The install path here only writes preferences; bind a dialog factory that fails loudly if used.
        container.bind(MCPServerEditDialogFactory).toConstantValue(() => {
            throw new Error('MCPServerEditDialogFactory should not be invoked in these tests');
        });
        container.bind(MCPServerEditorImpl).toSelf().inSingletonScope();
        container.bind(MCPServerEditor).toService(MCPServerEditorImpl);
        container.bind(MCPInstallServiceImpl).toSelf().inSingletonScope();
        container.bind(MCPInstallService).toService(MCPInstallServiceImpl);
        service = container.get(MCPInstallService);
    });

    it('install with override autostart=false persists the user choice instead of leaving the registry default', async () => {
        await service.install(entry, { autostart: false });

        expect(prefs.snapshot<Record<string, { autostart?: boolean }>>(MCP_SERVERS_PREF)!.example.autostart).to.equal(false);
    });

    it('install with auth token override fills it into a remote entry that advertises a serverAuthToken slot', async () => {
        const remoteEntry: ResolvedRegistryEntry = {
            ...entry,
            config: { serverUrl: 'https://example.com', serverAuthToken: '' }
        };

        await service.install(remoteEntry, { serverAuthToken: 'secret-123' });

        expect(prefs.snapshot<Record<string, { serverAuthToken?: string }>>(MCP_SERVERS_PREF)!.example.serverAuthToken).to.equal('secret-123');
    });

    it('install ignores a token override when the registry entry has no serverAuthToken slot - keeps local entries from accidentally storing one', async () => {
        await service.install(entry, { serverAuthToken: 'ignored' });

        expect(prefs.snapshot<Record<string, Record<string, unknown>>>(MCP_SERVERS_PREF)!.example).to.not.have.property('serverAuthToken');
    });

    it('install writes a new entry with the registry config and a registryMetadata block (including configHash) to the preference', async () => {
        await service.install(entry);

        expect(prefs.snapshot(MCP_SERVERS_PREF)).to.deep.equal({
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp'],
                registryMetadata: {
                    serverId: 'io.github.example/example-mcp',
                    version: '^1.0.0',
                    configHash: 'hash-v1'
                }
            }
        });
    });

    it('uninstall removes the entry by slug and leaves unrelated servers intact', async () => {
        await prefs.set(MCP_SERVERS_PREF, {
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp'],
                registryMetadata: { serverId: 'io.github.example/example-mcp' }
            },
            other: { command: 'node', args: ['unrelated.js'] }
        });

        await service.uninstall('example');

        expect(prefs.snapshot(MCP_SERVERS_PREF)).to.deep.equal({
            other: { command: 'node', args: ['unrelated.js'] }
        });
    });

    it('unlink removes the registryMetadata block while leaving the server config intact', async () => {
        await prefs.set(MCP_SERVERS_PREF, {
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp'],
                env: { USER_TOKEN: 'secret' },
                autostart: true,
                registryMetadata: {
                    serverId: 'io.github.example/example-mcp',
                    version: '^1.0.0',
                    configHash: 'hash-v1'
                }
            }
        });

        await service.unlink('example');

        expect(prefs.snapshot(MCP_SERVERS_PREF)).to.deep.equal({
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp'],
                env: { USER_TOKEN: 'secret' },
                autostart: true
            }
        });
    });

    it('unlink is a no-op on entries that have no registryMetadata block', async () => {
        await prefs.set(MCP_SERVERS_PREF, {
            example: { command: 'npx', args: ['-y', 'example-mcp'] }
        });

        await service.unlink('example');

        expect(prefs.snapshot(MCP_SERVERS_PREF)).to.deep.equal({
            example: { command: 'npx', args: ['-y', 'example-mcp'] }
        });
    });

    it('fixConfig overwrites the local config with the registry config and sets the registryMetadata block', async () => {
        await prefs.set(MCP_SERVERS_PREF, {
            example: {
                command: 'node',
                args: ['drifted-args']
            }
        });

        await service.fixConfig(entry);

        expect(prefs.snapshot(MCP_SERVERS_PREF)).to.deep.equal({
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp'],
                registryMetadata: {
                    serverId: 'io.github.example/example-mcp',
                    version: '^1.0.0',
                    configHash: 'hash-v1'
                }
            }
        });
    });

    it('fixConfig preserves the existing autostart preference - the registry has no opinion on it', async () => {
        await prefs.set(MCP_SERVERS_PREF, {
            example: {
                command: 'node',
                args: ['drifted-args'],
                autostart: false
            }
        });

        await service.fixConfig(entry);

        expect(prefs.snapshot<Record<string, { autostart?: boolean }>>(MCP_SERVERS_PREF)!.example.autostart).to.equal(false);
    });

    it('link sets the registryMetadata block on the existing entry, leaving its config untouched', async () => {
        await prefs.set(MCP_SERVERS_PREF, {
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp'],
                env: { USER_TOKEN: 'secret' },
                autostart: true
            }
        });

        await service.link(entry);

        expect(prefs.snapshot(MCP_SERVERS_PREF)).to.deep.equal({
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp'],
                env: { USER_TOKEN: 'secret' },
                autostart: true,
                registryMetadata: {
                    serverId: 'io.github.example/example-mcp',
                    version: '^1.0.0',
                    configHash: 'hash-v1'
                }
            }
        });
    });

    it('update preserves a user-supplied serverAuthToken when the registry approval ships an empty slot', async () => {
        const remoteEntry: ResolvedRegistryEntry = {
            ...entry,
            config: { serverUrl: 'https://example.com/mcp', serverAuthToken: '' },
            configHash: 'hash-v2'
        };
        await prefs.set(MCP_SERVERS_PREF, {
            example: {
                serverUrl: 'https://example.com/mcp',
                serverAuthToken: 'user-secret',
                registryMetadata: {
                    serverId: 'io.github.example/example-mcp',
                    version: '^1.0.0',
                    configHash: 'hash-v1'
                }
            }
        });

        await service.update(remoteEntry);

        expect(prefs.snapshot<Record<string, { serverAuthToken?: string }>>(MCP_SERVERS_PREF)!.example.serverAuthToken).to.equal('user-secret');
    });

    it('update strips stale local fields when the registry switches a remote entry from command/args to serverUrl', async () => {
        const remoteEntry: ResolvedRegistryEntry = {
            ...entry,
            config: { serverUrl: 'https://example.com/mcp' },
            configHash: 'hash-v2'
        };
        await prefs.set(MCP_SERVERS_PREF, {
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp'],
                env: { LOG_LEVEL: 'debug' },
                autostart: true,
                registryMetadata: {
                    serverId: 'io.github.example/example-mcp',
                    version: '^1.0.0',
                    configHash: 'hash-v1'
                }
            }
        });

        await service.update(remoteEntry);

        expect(prefs.snapshot(MCP_SERVERS_PREF)).to.deep.equal({
            example: {
                serverUrl: 'https://example.com/mcp',
                autostart: true,
                registryMetadata: {
                    serverId: 'io.github.example/example-mcp',
                    version: '^1.0.0',
                    configHash: 'hash-v2'
                }
            }
        });
    });

    it('update strips stale remote fields when the registry switches an entry from serverUrl to command/args', async () => {
        const localEntry: ResolvedRegistryEntry = {
            ...entry,
            config: { command: 'npx', args: ['-y', 'example-mcp'] },
            configHash: 'hash-v2'
        };
        await prefs.set(MCP_SERVERS_PREF, {
            example: {
                serverUrl: 'https://example.com/mcp',
                serverAuthToken: 'user-secret',
                serverAuthTokenHeader: 'X-Token',
                headers: { 'X-Custom': 'value' },
                autostart: true,
                registryMetadata: {
                    serverId: 'io.github.example/example-mcp',
                    version: '^1.0.0',
                    configHash: 'hash-v1'
                }
            }
        });

        await service.update(localEntry);

        expect(prefs.snapshot(MCP_SERVERS_PREF)).to.deep.equal({
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp'],
                autostart: true,
                registryMetadata: {
                    serverId: 'io.github.example/example-mcp',
                    version: '^1.0.0',
                    configHash: 'hash-v2'
                }
            }
        });
    });

    it('update overwrites registry-set fields, preserves user-added env keys and autostart, and bumps the registryMetadata block', async () => {
        const newEntry: ResolvedRegistryEntry = {
            ...entry,
            config: {
                command: 'npx',
                args: ['-y', 'example-mcp@1.0.0'],
                env: { LOG_LEVEL: 'info' }
            },
            version: '^1.0.0',
            configHash: 'hash-v2'
        };
        await prefs.set(MCP_SERVERS_PREF, {
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp@0.9.0'],
                env: { LOG_LEVEL: 'debug', USER_TOKEN: 'secret' },
                autostart: false,
                registryMetadata: {
                    serverId: 'io.github.example/example-mcp',
                    version: '^0.9.0',
                    configHash: 'hash-v1'
                }
            }
        });

        await service.update(newEntry);

        expect(prefs.snapshot(MCP_SERVERS_PREF)).to.deep.equal({
            example: {
                command: 'npx',
                args: ['-y', 'example-mcp@1.0.0'],
                env: { LOG_LEVEL: 'info', USER_TOKEN: 'secret' },
                autostart: false,
                registryMetadata: {
                    serverId: 'io.github.example/example-mcp',
                    version: '^1.0.0',
                    configHash: 'hash-v2'
                }
            }
        });
    });
});
