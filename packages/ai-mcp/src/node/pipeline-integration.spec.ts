// *****************************************************************************
// Copyright (C) 2026 Satish Shivaji Rao.
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

/**
 * End-to-end integration spec for the @theia/ai-mcp pipeline.
 *
 * Wires a real `@modelcontextprotocol/sdk` `Server` in-process via the
 * `createInProcessTransportPair` helper, points `MCPServer` at it through
 * a custom `MCPTransportProvider`, and drives scenarios that exercise
 * the full pipeline (credential resolution, filter chain, factory
 * invocation, event firing, name remapping). Catches the regressions
 * that pure unit specs against individual functions miss.
 */

import { expect } from 'chai';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
    InProcessMCPServerDescription,
    MCPClient,
    MCPClientFactory,
    MCPToolFilter,
    MCPToolInvocationEnd,
    MCPToolInvocationStart,
    MCPTransport,
    MCPTransportProvider,
    RemoteMCPServerDescription,
    ToolInformation,
} from '../common';
import { createInProcessTransportPair } from './in-process-transport';
import { MCPServer } from './mcp-server';
import { DefaultMCPClientFactory } from './default-mcp-client-factory';
import { EnvCredentialResolver } from './env-credential-resolver';
import { SdkTransportAdapter } from './mcp-transport-adapter';

interface FakeServerToolDef {
    name: string;
    description?: string;
    inputSchema?: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
    handler?: (args: Record<string, unknown>) => Promise<unknown>;
}

interface FakeServer {
    transport: SdkTransportAdapter;
    callsReceived: Array<{ name: string; arguments: unknown }>;
    close: () => Promise<void>;
}

/**
 * Build a fake MCP server (real SDK `Server`) backed by an in-process
 * linked-pair transport. Returns the client-side `SdkTransportAdapter`
 * for `MCPServer` to consume through a custom `MCPTransportProvider`.
 */
async function buildFakeServer(tools: FakeServerToolDef[]): Promise<FakeServer> {
    const { client, server: serverTransport } = createInProcessTransportPair();
    const sdkServer = new Server(
        { name: 'fake', version: '1.0.0' },
        { capabilities: { tools: {} } },
    );

    const callsReceived: Array<{ name: string; arguments: unknown }> = [];

    sdkServer.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
        })),
    }));

    sdkServer.setRequestHandler(CallToolRequestSchema, async req => {
        callsReceived.push({ name: req.params.name, arguments: req.params.arguments });
        const tool = tools.find(t => t.name === req.params.name);
        if (tool?.handler) {
            const result = await tool.handler((req.params.arguments ?? {}) as Record<string, unknown>);
            if (result && typeof result === 'object' && 'isError' in result) {
                return result;
            }
            return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
        }
        return { content: [{ type: 'text' as const, text: `called ${req.params.name}` }] };
    });

    await sdkServer.connect(serverTransport);

    return {
        transport: client,
        callsReceived,
        close: () => sdkServer.close(),
    };
}

/** Build a TransportProvider that always returns the given (already-built) transport. */
function providerFor(transport: SdkTransportAdapter): MCPTransportProvider {
    return {
        id: 'test-fixed',
        priority: 100,
        matches: () => true,
        create: async () => transport,
    };
}

describe('Pipeline integration (review-feedback fixes)', () => {

    // ── Fix #1: credentials don't leak via getDescription ──────────────

    describe('credential isolation', () => {
        const ENV_KEY = '__MCP_PIPE_TEST_TOKEN';
        afterEach(() => { delete process.env[ENV_KEY]; });

        it('preserves the operator-supplied sentinel in getDescription after start', async () => {
            const SECRET = 'secret-token-12345-do-not-leak';
            process.env[ENV_KEY] = SECRET;

            const fake = await buildFakeServer([{ name: 'echo' }]);
            const description: RemoteMCPServerDescription = {
                name: 'gw',
                serverUrl: 'http://gateway.example.invalid/mcp',
                serverAuthToken: '${env:' + ENV_KEY + '}',
            };
            const server = new MCPServer(
                description,
                [providerFor(fake.transport)],
                [],
                [new DefaultMCPClientFactory()],
                [new EnvCredentialResolver()],
            );

            await server.start();
            const back = await server.getDescription() as RemoteMCPServerDescription;

            expect(back.serverAuthToken).to.equal('${env:' + ENV_KEY + '}');
            expect(JSON.stringify(back)).to.not.include(SECRET);

            await server.stop();
            await fake.close();
        });

        it('preserves sentinels inside the headers map after start', async () => {
            const SECRET = 'header-secret-987654';
            process.env[ENV_KEY] = SECRET;

            const fake = await buildFakeServer([{ name: 'echo' }]);
            const description: RemoteMCPServerDescription = {
                name: 'gw',
                serverUrl: 'http://gateway.example.invalid/mcp',
                headers: { 'X-Vault-Token': '${env:' + ENV_KEY + '}' },
            };
            const server = new MCPServer(
                description,
                [providerFor(fake.transport)],
                [],
                [new DefaultMCPClientFactory()],
                [new EnvCredentialResolver()],
            );

            await server.start();
            const back = await server.getDescription() as RemoteMCPServerDescription;

            expect(back.headers?.['X-Vault-Token']).to.equal('${env:' + ENV_KEY + '}');
            expect(JSON.stringify(back)).to.not.include(SECRET);

            await server.stop();
            await fake.close();
        });
    });

    // ── Fix #3: filter chain blocks invocation, not just display ───────

    describe('tool filter applied at registration boundary', () => {
        it('suppresses a tool from getTools when the filter returns undefined', async () => {
            const fake = await buildFakeServer([
                { name: 'safe' },
                { name: 'dangerous' },
            ]);
            const description: InProcessMCPServerDescription = { name: 'srv', kind: 'in-process' };
            const filter: MCPToolFilter = {
                id: 'block-dangerous',
                priority: 100,
                filter: ctx => ctx.tool.name === 'dangerous' ? undefined : 'passthrough',
            };
            const server = new MCPServer(
                description,
                [providerFor(fake.transport)],
                [filter],
                [new DefaultMCPClientFactory()],
            );

            await server.start();
            const tools = await server.getTools();
            const names = tools.tools.map(t => t.name);

            expect(names).to.include('safe');
            expect(names).to.not.include('dangerous');

            await server.stop();
            await fake.close();
        });

        it('description.tools matches getTools (no double-filter, no drift)', async () => {
            const fake = await buildFakeServer([
                { name: 'safe' },
                { name: 'dangerous' },
            ]);
            const description: InProcessMCPServerDescription = { name: 'srv', kind: 'in-process' };
            const filter: MCPToolFilter = {
                id: 'block-dangerous',
                priority: 100,
                filter: ctx => ctx.tool.name === 'dangerous' ? undefined : 'passthrough',
            };
            const server = new MCPServer(
                description,
                [providerFor(fake.transport)],
                [filter],
                [new DefaultMCPClientFactory()],
            );

            await server.start();
            const back = await server.getDescription();

            const descNames = (back.tools ?? []).map(t => t.name);
            expect(descNames).to.deep.equal(['safe']);

            await server.stop();
            await fake.close();
        });

        it('renames a tool; callTool resolves back to the upstream SDK name', async () => {
            const fake = await buildFakeServer([{ name: 'search' }]);
            const description: InProcessMCPServerDescription = { name: 'srv', kind: 'in-process' };
            const filter: MCPToolFilter = {
                id: 'rename',
                priority: 100,
                filter: ctx => ({
                    ...ctx.tool,
                    name: 'renamed_search',
                    originalName: ctx.tool.name,
                }),
            };
            const server = new MCPServer(
                description,
                [providerFor(fake.transport)],
                [filter],
                [new DefaultMCPClientFactory()],
            );

            await server.start();
            const tools = await server.getTools();
            expect(tools.tools.map(t => t.name)).to.deep.equal(['renamed_search']);

            await server.callTool('renamed_search', '{"q":"test"}');

            // SDK side received the upstream name, not the renamed one.
            expect(fake.callsReceived).to.have.length(1);
            expect(fake.callsReceived[0].name).to.equal('search');

            await server.stop();
            await fake.close();
        });
    });

    // ── Fix #4: MCPClientFactory consumed; invocation events fire ──────

    describe('MCPClientFactory + invocation events', () => {
        it('calls factory.create during start and fires invocation events around callTool', async () => {
            const fake = await buildFakeServer([{ name: 'echo' }]);

            let capturedClient: MCPClient | undefined;
            const wrappingFactory: MCPClientFactory = {
                id: 'capture',
                priority: 100,
                create: async (d, t, ctx) => {
                    const inner = await new DefaultMCPClientFactory().create(d, t, ctx);
                    capturedClient = inner;
                    return inner;
                },
            };

            const description: InProcessMCPServerDescription = { name: 'srv', kind: 'in-process' };
            const server = new MCPServer(
                description,
                [providerFor(fake.transport)],
                [],
                [wrappingFactory],
            );

            await server.start();
            expect(capturedClient, 'factory should have been called during start').to.exist;

            const willEvents: MCPToolInvocationStart[] = [];
            const didEvents: MCPToolInvocationEnd[] = [];
            capturedClient!.onWillInvokeTool(e => willEvents.push(e));
            capturedClient!.onDidInvokeTool(e => didEvents.push(e));

            await server.callTool('echo', '{"k":"v"}');

            expect(willEvents).to.have.length(1);
            expect(willEvents[0].toolName).to.equal('echo');
            expect(willEvents[0].argsJSON).to.equal('{"k":"v"}');
            expect(didEvents).to.have.length(1);
            expect(didEvents[0].toolName).to.equal('echo');
            expect(didEvents[0].ok).to.equal(true);
            expect(typeof didEvents[0].durationMs).to.equal('number');
            expect(didEvents[0].error).to.be.undefined;

            await server.stop();
            await fake.close();
        });

        it('fires onDidAddTools when getTools is called', async () => {
            const fake = await buildFakeServer([{ name: 'a' }, { name: 'b' }]);

            let capturedClient: MCPClient | undefined;
            const wrappingFactory: MCPClientFactory = {
                id: 'capture',
                priority: 100,
                create: async (d, t, ctx) => {
                    const inner = await new DefaultMCPClientFactory().create(d, t, ctx);
                    capturedClient = inner;
                    return inner;
                },
            };

            const description: InProcessMCPServerDescription = { name: 'srv', kind: 'in-process' };
            const server = new MCPServer(
                description,
                [providerFor(fake.transport)],
                [],
                [wrappingFactory],
            );

            await server.start();
            const seenInventories: ToolInformation[][] = [];
            capturedClient!.onDidAddTools(infos => seenInventories.push(infos));

            await server.getTools();

            expect(seenInventories).to.have.length(1);
            expect(seenInventories[0].map(t => t.name)).to.deep.equal(['a', 'b']);

            await server.stop();
            await fake.close();
        });

        it('survives gracefully when no MCPClientFactory is registered (events silently no-op)', async () => {
            const fake = await buildFakeServer([{ name: 'echo' }]);
            const description: InProcessMCPServerDescription = { name: 'srv', kind: 'in-process' };
            const server = new MCPServer(
                description,
                [providerFor(fake.transport)],
                [],
                [], // no factories
            );

            await server.start();
            const result = await server.callTool('echo', '{}');
            expect(result).to.exist;

            await server.stop();
            await fake.close();
        });
    });

    // ── Cross-cutting: full happy path ─────────────────────────────────

    describe('full happy path', () => {
        it('start → getTools → callTool → stop with all defaults wired', async () => {
            const fake = await buildFakeServer([
                { name: 'add', handler: async args => ({ sum: (args.a as number) + (args.b as number) }) },
            ]);
            const description: InProcessMCPServerDescription = { name: 'calc', kind: 'in-process' };
            const server = new MCPServer(
                description,
                [providerFor(fake.transport)],
                [],
                [new DefaultMCPClientFactory()],
            );

            await server.start();
            const tools = await server.getTools();
            expect(tools.tools.map(t => t.name)).to.deep.equal(['add']);

            const result = await server.callTool('add', '{"a":2,"b":3}');
            expect(result).to.exist;
            expect(fake.callsReceived[0].arguments).to.deep.equal({ a: 2, b: 3 });

            await server.stop();
            await fake.close();
        });
    });
});

// Type-level smoke test for fix #5 (transport adapter constraint).
// MCPTransport remains the broad public type; runtime requires
// SdkTransportAdapter. Unit-level coverage for the unwrap path lives in
// default-providers.spec.ts; this assignment just verifies the adapter
// satisfies the public `MCPTransport` shape so plugin authors who type
// their providers as `MCPTransportProvider` get TS to accept the return.
const _typeProbe: MCPTransport = new SdkTransportAdapter(
    {} as never,
    'in-process',
);
void _typeProbe;
