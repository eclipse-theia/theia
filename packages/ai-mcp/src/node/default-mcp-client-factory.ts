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

import { injectable } from '@theia/core/shared/inversify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { MCPServerDescription, ToolInformation } from '../common/mcp-server-manager';
import { MCPClient, MCPClientFactory, MCPClientFactoryContext } from '../common/mcp-client-factory';
import { MCPTransport } from '../common/mcp-transport-provider';

/**
 * Default {@link MCPClientFactory} contribution. Wraps the
 * `@modelcontextprotocol/sdk` `Client` exactly as {@link MCPServer} used to
 * construct it inline — no instrumentation, no patching.
 *
 * The factory is a thin wrapper returning a Phase A–shaped {@link MCPClient}.
 * Theia's internal {@link MCPServer} continues to own the SDK `Client`
 * instance directly for the rich operations it needs (`callTool`,
 * `listTools`, resource reads, request handlers); this factory exists so
 * plugins can intercept and replace that creation without reimplementing
 * the whole server class.
 */
@injectable()
export class DefaultMCPClientFactory implements MCPClientFactory {

    readonly id = 'default-sdk';
    readonly priority = 0;

    async create(
        description: MCPServerDescription,
        _transport: MCPTransport,
        _context: MCPClientFactoryContext,
    ): Promise<MCPClient> {
        const sdk = new Client(
            { name: 'theia-client', version: '1.0.0' },
            { capabilities: {} },
        );

        // Until {@link MCPServer} wires the factory's client through
        // `listTools()` end-to-end, the factory returns an empty tools
        // array; server introspection still goes through the SDK client
        // directly on the `sdk` property.
        const tools: ToolInformation[] = [];
        const client: MCPClient & { readonly sdk: Client } = {
            sdk,
            name: description.name,
            tools,
            async start(): Promise<void> {
                // Connection is driven by MCPServer today so that SSE fallback
                // and error plumbing stay in one place. We expose `start()` for
                // plugins that want to swap us out for a fully-custom client.
            },
            async stop(): Promise<void> {
                await sdk.close();
            },
        };
        return client;
    }
}
