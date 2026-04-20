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

import { Event } from '@theia/core/lib/common/event';
import { MCPServerDescription } from './mcp-server-manager';

/**
 * Transport abstraction promoted to public API so plugins can contribute
 * alternative implementations (e.g. WebSocket, in-process, gRPC) via
 * {@link MCPTransportProvider}.
 *
 * Minimal by design: the MCP SDK's own transport interface is richer, but
 * this public surface only exposes what the server manager needs to consume.
 */
export interface MCPTransport {
    readonly kind: string;
    send(message: unknown): Promise<void>;
    close(): Promise<void>;
    readonly onMessage: Event<unknown>;
    readonly onClose: Event<Error | undefined>;
}

export const MCPTransportProvider = Symbol('MCPTransportProvider');

/**
 * Contribution point for MCP transport selection. A provider is asked whether
 * it can create a transport for a given {@link MCPServerDescription} and, if
 * so, creates the concrete instance. Multiple providers can coexist; the
 * {@link MCPServerManager} consults them in descending-priority order and
 * picks the first whose {@link matches} returns `true`.
 *
 * Default `stdio` and `http`/`sse` transports are contributed by the built-in
 * `MCPServer` implementation so existing deployments see no behaviour change.
 */
export interface MCPTransportProvider {
    /** Stable provider id, used in diagnostics. */
    readonly id: string;

    /**
     * Provider priority (default `0`). Higher priority runs first.
     * Built-in stdio/http providers use priority `0`; plugins can override
     * them by registering with a higher value.
     */
    readonly priority?: number;

    /** Returns `true` if this provider can create a transport for `description`. */
    matches(description: MCPServerDescription): boolean;

    /**
     * Create the concrete transport. Providers must honour `signal` for
     * startup cancellation and reject with an `AbortError` when the signal
     * has already been aborted.
     */
    create(description: MCPServerDescription, signal: AbortSignal): Promise<MCPTransport>;
}
