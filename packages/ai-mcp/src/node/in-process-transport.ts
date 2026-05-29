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

import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { SdkTransportAdapter } from './mcp-transport-adapter';

/**
 * The two ends of a {@link createInProcessTransportPair} call.
 *
 * - `client` is wrapped in an {@link SdkTransportAdapter} so it satisfies
 *   the `MCPTransport` contract that `MCPServer` consumes.
 * - `server` is a raw SDK `Transport` ready to be passed to
 *   `Server.connect()` from `@modelcontextprotocol/sdk/server` — i.e.
 *   the plugin-side MCP server endpoint.
 */
export interface InProcessTransportPair {
    readonly client: SdkTransportAdapter;
    readonly server: Transport;
}

/**
 * In-memory linked-pair transport for plugin-supplied MCP servers that
 * run in the same Node.js process as Theia's backend. Mirrors the
 * "linked channel" pattern used by Node's
 * {@link https://nodejs.org/api/worker_threads.html#class-messagechannel MessageChannel},
 * gRPC's in-process channels, and similar IPC primitives: two
 * endpoints share a queue; whatever one writes the other reads.
 *
 * Closes a real coverage gap in the transport set — today every MCP
 * server has to be either a subprocess (stdio) or a remote HTTP server,
 * even when the server lives in the same process and stdio adds latency
 * + serialization for no benefit. Use cases:
 *
 *  - **Plugin-bundled MCP servers**: a Theia plugin exposes its own
 *    capabilities (git, build system, project metadata) as MCP tools
 *    without spinning up a subprocess.
 *  - **Test fixtures**: integration tests that exercise the full MCP
 *    pipeline (filter chain, credential resolution, invocation events)
 *    without the flakiness of process spawning.
 *  - **Backend-internal services**: existing Theia backend services
 *    surfaced as MCP tools via a thin server adapter.
 *
 * The plugin author writes their own `MCPTransportProvider` that
 * `matches()` their server's description and uses this helper inside
 * `create()`. There is intentionally no built-in "registry" provider
 * here: a fifth contribution point would expand the public surface
 * for marginal ergonomic gain, and the `MCPTransportProvider` layer
 * already covers this.
 *
 * Sketch:
 *
 * ```ts
 * @injectable()
 * export class GitMCPTransportProvider implements MCPTransportProvider {
 *     readonly id = 'git-in-process';
 *     readonly priority = 10;
 *
 *     matches(d: MCPServerDescription): boolean {
 *         return isInProcessMCPServerDescription(d) && d.name === 'git';
 *     }
 *
 *     async create(_d: MCPServerDescription): Promise<MCPTransport> {
 *         const { client, server } = createInProcessTransportPair();
 *         const sdkServer = new Server({ name: 'git', version: '1' }, {});
 *         registerGitTools(sdkServer);
 *         await sdkServer.connect(server);
 *         return client;
 *     }
 * }
 * ```
 *
 * Delivery is via `queueMicrotask` so callers see asynchronous semantics
 * matching real wire transports — `await transport.send(msg)` resolves
 * before the peer's `onmessage` fires, never reentrantly. Either side
 * calling `close()` triggers `onclose` on both endpoints exactly once.
 */
export function createInProcessTransportPair(): InProcessTransportPair {
    const a = new LinkedTransport();
    const b = new LinkedTransport();
    a.peer = b;
    b.peer = a;
    return {
        client: new SdkTransportAdapter(a, 'in-process'),
        server: b,
    };
}

/**
 * One end of an in-process linked pair. Implements the SDK `Transport`
 * surface (`start`, `send`, `close`, `onmessage` / `onclose` /
 * `onerror` callback properties).
 *
 * Internal — exported only for types in the spec.
 */
export class LinkedTransport implements Transport {

    /** Set by {@link createInProcessTransportPair} after construction. */
    peer?: LinkedTransport;

    onmessage?: (message: unknown) => void;
    onclose?: () => void;
    onerror?: (err: Error) => void;
    sessionId?: string;

    private closed = false;

    /**
     * No-op for linked-pair transports — both ends are connected the
     * moment {@link createInProcessTransportPair} returns. Present
     * because `Server.connect()` / `Client.connect()` await `start()`
     * during the handshake.
     */
    async start(): Promise<void> {
        return;
    }

    /**
     * Deliver `message` to the peer's `onmessage` callback on the next
     * microtask. Asynchronous delivery matches what the wire transports
     * (stdio / HTTP) do — callers can rely on `send` returning before
     * `onmessage` fires on the peer, even within the same synchronous
     * frame.
     */
    async send(message: unknown): Promise<void> {
        if (this.closed) {
            throw new Error('Cannot send on a closed in-process transport.');
        }
        const peer = this.peer;
        if (!peer || peer.closed) {
            // Drop silently — the peer already tore down. Real
            // transports surface this via onclose; the caller will see
            // that next.
            return;
        }
        queueMicrotask(() => {
            // Re-check liveness inside the microtask: either side may
            // have closed between the send call and delivery.
            if (peer.closed || !peer.onmessage) {
                return;
            }
            try {
                peer.onmessage(message);
            } catch (err) {
                peer.onerror?.(err instanceof Error ? err : new Error(String(err)));
            }
        });
    }

    /**
     * Mutual close: tears down both ends and fires `onclose` on each
     * (asynchronously, on the next microtask) exactly once. Idempotent
     * — repeat calls are no-ops.
     */
    async close(): Promise<void> {
        if (this.closed) {
            return;
        }
        const peer = this.peer;
        this.closed = true;
        queueMicrotask(() => this.onclose?.());
        if (peer && !peer.closed) {
            peer.closed = true;
            queueMicrotask(() => peer.onclose?.());
        }
    }
}
