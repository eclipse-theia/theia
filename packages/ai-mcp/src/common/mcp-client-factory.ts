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

import { MCPServerDescription, ToolInformation } from './mcp-server-manager';
import { MCPCredentialRequest } from './mcp-credential-resolver';
import { MCPTransport } from './mcp-transport-provider';

/**
 * Public surface of the MCP client the server manager consumes. Narrower
 * than the `@modelcontextprotocol/sdk` `Client` so plugins can wrap / replace
 * it without depending on the SDK internals.
 */
export interface MCPClient {
    readonly name: string;
    readonly tools: ToolInformation[];
    start(): Promise<void>;
    stop(): Promise<void>;
}

/**
 * Context passed to an {@link MCPClientFactory}, giving factories access to
 * the full credential chain without leaking the registry.
 */
export interface MCPClientFactoryContext {
    resolveCredential(request: MCPCredentialRequest): Promise<string | undefined>;
}

export const MCPClientFactory = Symbol('MCPClientFactory');

/**
 * Contribution point for swapping the concrete MCP client implementation.
 * The highest-priority registered factory wins. The built-in factory wraps
 * `@modelcontextprotocol/sdk` exactly as today and is registered with
 * priority `0`; plugins that want to instrument every MCP call (metrics,
 * tracing, structured logging) can register at a higher priority.
 */
export interface MCPClientFactory {
    readonly id: string;
    readonly priority?: number;

    create(
        description: MCPServerDescription,
        transport: MCPTransport,
        context: MCPClientFactoryContext,
    ): Promise<MCPClient>;
}
