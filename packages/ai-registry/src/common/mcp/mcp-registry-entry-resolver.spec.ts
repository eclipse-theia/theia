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
import { AIRegistryConfiguration } from '../ai-registry-configuration';
import { MCPRegistryEntryResolver, MCPRegistryEntryResolverImpl } from './mcp-registry-entry-resolver';
import { RegistryMCPServer } from './mcp-registry-types';

function createResolver(toolName: string = 'theia-ide'): MCPRegistryEntryResolver {
    const resolver = new MCPRegistryEntryResolverImpl();
    const configuration: AIRegistryConfiguration = Object.assign(new AIRegistryConfiguration(), {
        getToolName(): string {
            return toolName;
        }
    });
    Object.assign(resolver, { configuration });
    return resolver;
}

describe('MCPRegistryEntryResolver.resolve', () => {

    let resolver: MCPRegistryEntryResolver;

    beforeEach(() => {
        resolver = createResolver();
    });

    it('normalises a server with a single approval, install config and inner server, propagating configHash', () => {
        const raw: RegistryMCPServer = {
            serverId: 'io.github.example/example-mcp',
            name: 'Example',
            description: 'Example MCP server',
            mcpRegistryVerified: true,
            approvals: [{
                organizationId: 'theia',
                date: '2026-04-01',
                version: '^1.0.0',
                configHash: 'hash-v1',
                installConfigs: [{
                    tool: 'theia-ide',
                    config: { servers: { example: { command: 'npx', args: ['-y', 'example-mcp'] } } }
                }]
            }]
        };

        expect(resolver.resolve(raw)).to.deep.equal({
            serverId: 'io.github.example/example-mcp',
            name: 'Example',
            description: 'Example MCP server',
            localName: 'example',
            config: { command: 'npx', args: ['-y', 'example-mcp'] },
            version: '^1.0.0',
            configHash: 'hash-v1',
            mcpRegistryVerified: true
        });
    });

    it('omits configHash when the approval has none - supports payloads pre-dating the field', () => {
        const raw: RegistryMCPServer = {
            serverId: 'io.github.example/legacy-mcp',
            name: 'Legacy',
            description: 'Legacy MCP server with no configHash',
            mcpRegistryVerified: true,
            approvals: [{
                organizationId: 'theia',
                date: '2026-04-01',
                version: '^1.0.0',
                installConfigs: [{
                    tool: 'theia-ide',
                    config: { servers: { legacy: { command: 'npx', args: ['-y', 'legacy-mcp'] } } }
                }]
            }]
        };

        const resolved = resolver.resolve(raw);
        expect(resolved).to.not.have.property('configHash');
        expect(resolved?.version).to.equal('^1.0.0');
    });

    it('picks the most recent approval when multiple organisations approved the same server', () => {
        const raw: RegistryMCPServer = {
            serverId: 'io.github.example/example-mcp',
            name: 'Example',
            description: 'Example MCP server',
            mcpRegistryVerified: true,
            approvals: [
                {
                    organizationId: 'older-org',
                    date: '2025-01-01',
                    version: '^0.5.0',
                    installConfigs: [{
                        tool: 'theia-ide',
                        config: { servers: { example: { command: 'old-cmd' } } }
                    }]
                },
                {
                    organizationId: 'newer-org',
                    date: '2026-04-01',
                    version: '^1.0.0',
                    installConfigs: [{
                        tool: 'theia-ide',
                        config: { servers: { example: { command: 'new-cmd' } } }
                    }]
                }
            ]
        };

        const resolved = resolver.resolve(raw);
        expect(resolved?.version).to.equal('^1.0.0');
        expect(resolved?.config).to.deep.equal({ command: 'new-cmd' });
    });

    it('returns undefined when the server has no approvals', () => {
        const raw: RegistryMCPServer = {
            serverId: 'io.github.example/orphan',
            name: 'Orphan',
            description: 'No approvals',
            mcpRegistryVerified: false,
            approvals: []
        };
        expect(resolver.resolve(raw)).to.be.undefined;
    });

    it('returns undefined when the picked approval has no usable install config', () => {
        const raw: RegistryMCPServer = {
            serverId: 'io.github.example/empty',
            name: 'Empty',
            description: 'Approval with no usable config',
            mcpRegistryVerified: false,
            approvals: [{
                organizationId: 'theia',
                date: '2026-04-01',
                version: '^1.0.0',
                installConfigs: [{ tool: 'theia-ide' }]
            }]
        };
        expect(resolver.resolve(raw)).to.be.undefined;
    });

    it('picks the install config matching the configured tool name when multiple are present', () => {
        const productResolver = createResolver('my-product');
        const raw: RegistryMCPServer = {
            serverId: 'io.github.example/multi-tool',
            name: 'Multi Tool',
            description: 'Approval carrying configs for several tools',
            mcpRegistryVerified: true,
            approvals: [{
                organizationId: 'theia',
                date: '2026-04-01',
                version: '^1.0.0',
                installConfigs: [
                    { tool: 'theia-ide', config: { servers: { example: { command: 'theia-cmd' } } } },
                    { tool: 'my-product', config: { servers: { example: { command: 'product-cmd' } } } }
                ]
            }]
        };

        expect(productResolver.resolve(raw)?.config).to.deep.equal({ command: 'product-cmd' });
    });

    it('accepts an untagged install config as a fallback when no tool-specific config matches', () => {
        const productResolver = createResolver('my-product');
        const raw: RegistryMCPServer = {
            serverId: 'io.github.example/untagged',
            name: 'Untagged',
            description: 'Approval whose install config has no tool tag',
            mcpRegistryVerified: true,
            approvals: [{
                organizationId: 'theia',
                date: '2026-04-01',
                version: '^1.0.0',
                installConfigs: [
                    { config: { servers: { example: { command: 'untagged-cmd' } } } }
                ]
            }]
        };

        expect(productResolver.resolve(raw)?.config).to.deep.equal({ command: 'untagged-cmd' });
    });

    it("accepts every install config when the configured tool name is 'all'", () => {
        const allResolver = createResolver('all');
        const raw: RegistryMCPServer = {
            serverId: 'io.github.example/all',
            name: 'Any tool',
            description: 'Approval whose install config is tagged for a different tool',
            mcpRegistryVerified: true,
            approvals: [{
                organizationId: 'theia',
                date: '2026-04-01',
                version: '^1.0.0',
                installConfigs: [
                    { tool: 'other-tool', config: { servers: { example: { command: 'other-cmd' } } } }
                ]
            }]
        };

        expect(allResolver.resolve(raw)?.config).to.deep.equal({ command: 'other-cmd' });
    });

    it('warns and picks the first key deterministically when the install config exposes multiple servers', () => {
        const raw: RegistryMCPServer = {
            serverId: 'io.github.example/multi-server',
            name: 'Multi Server',
            description: 'Approval whose install config exposes multiple servers',
            mcpRegistryVerified: true,
            approvals: [{
                organizationId: 'theia',
                date: '2026-04-01',
                version: '^1.0.0',
                installConfigs: [{
                    tool: 'theia-ide',
                    config: {
                        servers: {
                            primary: { command: 'first-cmd' },
                            secondary: { command: 'second-cmd' }
                        }
                    }
                }]
            }]
        };

        const warnings: string[] = [];
        const originalWarn = console.warn;
        console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };
        try {
            const resolved = resolver.resolve(raw);
            expect(resolved?.localName).to.equal('primary');
            expect(resolved?.config).to.deep.equal({ command: 'first-cmd' });
            expect(warnings.some(w => w.includes('multiple servers'))).to.equal(true);
        } finally {
            console.warn = originalWarn;
        }
    });
});
