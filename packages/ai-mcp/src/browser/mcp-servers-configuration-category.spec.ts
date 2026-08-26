// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Event } from '@theia/core';
import { createRoot } from '@theia/core/shared/react-dom/client';
import { flushSync } from '@theia/core/shared/react-dom';
import { AgentPluginUiBridge, InstalledAgentPluginInfo } from '@theia/ai-core/lib/browser/agent-plugin-ui-bridge';
import { MCPServerDescription, MCPServerStatus } from '../common/mcp-server-manager';
import { AiConfigurationCategoryId, AiConfigurationRenderContext } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { McpServersConfigurationCategory } from './mcp-servers-configuration-category';
import { MCPRegistryUiBridge } from './mcp-registry-ui-bridge';

disableJSDOM();

function server(name: string, status?: MCPServerStatus, tools: { name: string; description?: string }[] = []): MCPServerDescription {
    return { name, command: 'run', status, tools } as unknown as MCPServerDescription;
}

function createCategory(servers: MCPServerDescription[]): McpServersConfigurationCategory {
    const category = new McpServersConfigurationCategory();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).servers = servers;
    return category;
}

/** Renders a server's detail page into a detached host, so the read-only rows and provenance links can be inspected. */
function withServerDetail(category: McpServersConfigurationCategory, serverName: string, assertions: (host: HTMLElement) => void): void {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const ctx: AiConfigurationRenderContext = { scope: 'user', navigate: () => { }, update: () => { } };
    try {
        flushSync(() => root.render(category.renderItemDetail(serverName, ctx)));
        assertions(container);
    } finally {
        flushSync(() => root.unmount());
        container.remove();
    }
}

describe('McpServersConfigurationCategory', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('declares the mcp-servers collection metadata', () => {
        const category = createCategory([]);
        expect(category.id).to.equal(AiConfigurationCategoryId.MCP_SERVERS);
        expect(category.kind).to.equal('collection');
    });

    it('maps server status to a tree-item status kind', () => {
        const category = createCategory([
            server('running', MCPServerStatus.Running),
            server('auth', MCPServerStatus.AuthenticationRequired),
            server('errored', MCPServerStatus.Errored),
            server('idle', MCPServerStatus.NotRunning)
        ]);
        const children = category.getTreeChildren();
        expect(children.map(c => c.status?.kind)).to.deep.equal(['on', 'warn', 'error', 'off']);
    });

    it('indexes each server and its tools for search, all navigating to the server', () => {
        const category = createCategory([server('git', MCPServerStatus.Running, [{ name: 'commit', description: 'make a commit' }])]);
        const items = category.getSearchItems();
        expect(items).to.have.lengthOf(2);
        expect(items[0].target).to.deep.equal({ categoryId: AiConfigurationCategoryId.MCP_SERVERS, itemId: 'git' });
        expect(items[1].label).to.equal('commit');
        expect(items[1].target).to.deep.equal({ categoryId: AiConfigurationCategoryId.MCP_SERVERS, itemId: 'git' });
    });

    it('summarizes a server by type and tool count rather than command/url', () => {
        const category = createCategory([
            server('git', MCPServerStatus.Running, [{ name: 'a' }, { name: 'b' }]),
            server('empty', MCPServerStatus.NotRunning)
        ]);
        const children = category.getTreeChildren();
        expect(children[0].description).to.equal('Local · 2 tools');
        expect(children[1].description).to.equal('Local');
    });

    it('summarizes a remote server as Remote', () => {
        const remote = { name: 'r', serverUrl: 'https://example.com', status: MCPServerStatus.Connected, tools: [] } as unknown as MCPServerDescription;
        expect(createCategory([remote]).getTreeChildren()[0].description).to.equal('Remote');
    });

    it('labels the server type (Local / Remote / Remote (OAuth))', () => {
        const category = createCategory([]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const typeLabel = (server_: MCPServerDescription) => (category as any).getServerTypeLabel(server_) as string;
        expect(typeLabel(server('local'))).to.equal('Local');
        expect(typeLabel({ name: 'r', serverUrl: 'https://x' } as unknown as MCPServerDescription)).to.equal('Remote');
        expect(typeLabel({ name: 'o', serverUrl: 'https://x', oauth: {} } as unknown as MCPServerDescription)).to.equal('Remote (OAuth)');
    });

    it('persists an inline field edit by patching the form and re-saving it', () => {
        const category = createCategory([server('git', MCPServerStatus.Running)]);
        const saved: Array<{ name: string; command: string; serverType: string }> = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).serverEditor = {
            toFormData: (description: MCPServerDescription) => ({
                name: description.name, serverType: 'local', command: 'old', args: '', env: '', autostart: true, deferLoading: false
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            save: (form: any) => { saved.push(form); return Promise.resolve(); }
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).updateServer(server('git'), { command: 'npx server' });
        expect(saved).to.have.lengthOf(1);
        expect(saved[0]).to.include({ name: 'git', command: 'npx server', serverType: 'local' });
    });

    describe('Agent Plugin paths', () => {

        const pluginRoot = '/home/user/.agents/plugins/io.github.acme_devtools';
        const pluginData = '/home/user/.agents/plugin-data/io.github.acme_devtools';
        const pluginServer = {
            name: 'validator',
            command: './bin/validator',
            status: MCPServerStatus.NotRunning,
            cwd: pluginRoot,
            pluginRoot,
            pluginData
        } as unknown as MCPServerDescription;

        it('shows the working directory and the plugin roots, which the user cannot author', () => {
            withServerDetail(createCategory([pluginServer]), 'validator', host => {
                const readOnly = Array.from(host.querySelectorAll('.mcp-property-readonly')).map(node => node.textContent);
                expect(readOnly).to.have.lengthOf(3);
                expect(readOnly[0]).to.contain(pluginRoot);
                expect(readOnly[1]).to.contain('PLUGIN_ROOT');
                expect(readOnly[2]).to.contain(pluginData);
                expect(readOnly[2]).to.contain('PLUGIN_DATA');
            });
        });

        it('shows no plugin path rows for a server the user configured by hand', () => {
            withServerDetail(createCategory([server('own', MCPServerStatus.NotRunning)]), 'own', host => {
                expect(host.querySelectorAll('.mcp-property-readonly')).to.have.lengthOf(0);
            });
        });
    });

    describe('Agent Plugin provenance', () => {

        const devtools: InstalledAgentPluginInfo = { pluginId: 'io.github.acme/devtools', name: 'Acme Devtools' };
        const pluginServer = {
            name: 'validator',
            command: './bin/validator',
            status: MCPServerStatus.NotRunning,
            registryMetadata: { pluginId: devtools.pluginId }
        } as unknown as MCPServerDescription;

        /** Leaves the bridge unbound when `installedPlugins` is omitted, i.e. a product without `@theia/ai-registry`. */
        function categoryWithPlugins(
            servers: MCPServerDescription[],
            installedPlugins: InstalledAgentPluginInfo[] | undefined,
            hooks: { revealed?: string[], openedRegistryEntries?: (string | undefined)[] } = {}
        ): McpServersConfigurationCategory {
            const category = createCategory(servers);
            if (installedPlugins) {
                const bridge: AgentPluginUiBridge = {
                    getPlugin: pluginId => installedPlugins.find(plugin => plugin.pluginId === pluginId),
                    // Only the skills page looks a plugin up by qualifier; a server carries the identifier.
                    getPluginByQualifier: () => undefined,
                    revealPlugin: pluginId => { hooks.revealed?.push(pluginId); },
                    onDidChange: Event.None
                };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (category as any).agentPluginBridge = bridge;
            }
            if (hooks.openedRegistryEntries) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (category as any).registryBridge = {
                    openRegistry: async (serverId?: string) => { hooks.openedRegistryEntries?.push(serverId); }
                } as Partial<MCPRegistryUiBridge>;
            }
            return category;
        }

        const bothOrigins = { ...pluginServer, registryMetadata: { serverId: 'io.github.acme/validator', pluginId: devtools.pluginId } } as MCPServerDescription;

        function pluginBadge(host: HTMLElement): HTMLButtonElement | null {
            return host.querySelector('.ai-configuration-origin-badge[title^="Open the Agent Plugin"]') as HTMLButtonElement | null;
        }

        function originLabels(category: McpServersConfigurationCategory): string[] | undefined {
            return category.getTreeChildren()[0].origins?.map(origin => origin.label);
        }

        it('labels a plugin-provided server in the list, so it is told apart without being opened', () => {
            expect(originLabels(categoryWithPlugins([pluginServer], [devtools]))).to.deep.equal(['via Acme Devtools']);
        });

        it('labels a server that carries both a registry entry and a plugin with both origins, which lead to different places', () => {
            expect(originLabels(categoryWithPlugins([bothOrigins], [devtools], { openedRegistryEntries: [] })))
                .to.deep.equal(['From registry', 'via Acme Devtools']);
        });

        it('labels nothing rather than a bare identifier when the owning plugin is not installed', () => {
            expect(originLabels(categoryWithPlugins([pluginServer], []))).to.equal(undefined);
        });

        it('labels nothing when no bridge is bound, i.e. without `@theia/ai-registry`', () => {
            expect(originLabels(categoryWithPlugins([pluginServer], undefined))).to.equal(undefined);
        });

        it('still states a registry origin without a registry UI to open, but not as a link', () => {
            // Unlike a plugin, whose display name only the bridge knows, a registry entry names itself in
            // the server's own preference entry - so the fact survives even when nothing can act on it.
            const linked = { ...pluginServer, registryMetadata: { serverId: 'io.github.acme/validator' } } as MCPServerDescription;
            const origins = categoryWithPlugins([linked], undefined).getTreeChildren()[0].origins;
            expect(origins?.map(origin => origin.label)).to.deep.equal(['From registry']);
            expect(origins![0].activate).to.equal(undefined);
        });

        it('shows the same origin badges on the detail header as in the list, rather than a second design', () => {
            const category = categoryWithPlugins([bothOrigins], [devtools], { openedRegistryEntries: [] });
            withServerDetail(category, 'validator', host => {
                const badges = Array.from(host.querySelectorAll('.ai-configuration-origin-badge')).map(badge => badge.textContent);
                expect(badges).to.deep.equal(originLabels(category));
            });
        });

        it('reveals the owning plugin rather than a registry server when the plugin badge is clicked', () => {
            const revealed: string[] = [];
            const openedRegistryEntries: (string | undefined)[] = [];
            const category = categoryWithPlugins([bothOrigins], [devtools], { revealed, openedRegistryEntries });
            withServerDetail(category, 'validator', host => {
                flushSync(() => pluginBadge(host)!.click());
            });
            expect(revealed).to.deep.equal([devtools.pluginId]);
            expect(openedRegistryEntries).to.be.empty;
        });

        it('shows no origin badge for a server that was not contributed by a plugin', () => {
            withServerDetail(categoryWithPlugins([server('plain-local', MCPServerStatus.NotRunning)], [devtools]), 'plain-local', host => {
                expect(host.querySelector('.ai-configuration-origin-badge')).to.be.null;
            });
        });
    });
});
