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
import { Emitter } from '@theia/core/lib/common/event';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { MCPServerDescription, ToolInformation } from '../common/mcp-server-manager';
import {
    MCPClient,
    MCPClientFactory,
    MCPClientFactoryContext,
    MCPToolInvocationEnd,
    MCPToolInvocationStart,
} from '../common/mcp-client-factory';
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

        // Event surface — both inventory events (RFC Q3, commit 6deb0fe)
        // and invocation events (this commit). Wired here so plugin
        // factories that wrap us inherit the contract; today's
        // {@link MCPServer} drives the SDK transport directly, so the
        // inventory emitters fire when {@link MCPServer.update} pushes
        // new tools through plus once on stop(), and the invocation
        // emitters fire when {@link MCPServer} or downstream tool runners
        // call the helpers below around `client.callTool`.
        const onDidAddToolsEmitter = new Emitter<ToolInformation[]>();
        const onCloseEmitter = new Emitter<Error | undefined>();
        const onWillInvokeToolEmitter = new Emitter<MCPToolInvocationStart>();
        const onDidInvokeToolEmitter = new Emitter<MCPToolInvocationEnd>();

        const client: MCPClient & { readonly sdk: Client } = {
            sdk,
            name: description.name,
            tools,
            onDidAddTools: onDidAddToolsEmitter.event,
            onClose: onCloseEmitter.event,
            onWillInvokeTool: onWillInvokeToolEmitter.event,
            onDidInvokeTool: onDidInvokeToolEmitter.event,
            async start(): Promise<void> {
                // Connection is driven by MCPServer today so that SSE fallback
                // and error plumbing stay in one place. We expose `start()` for
                // plugins that want to swap us out for a fully-custom client.
            },
            async stop(): Promise<void> {
                try {
                    await sdk.close();
                } finally {
                    onCloseEmitter.fire(undefined);
                    onCloseEmitter.dispose();
                    onDidAddToolsEmitter.dispose();
                    onWillInvokeToolEmitter.dispose();
                    onDidInvokeToolEmitter.dispose();
                }
            },
        };
        // Expose the emitters on the client for {@link MCPServer} to fire
        // through (cast away from the public interface; callers see only
        // the `Event` getters). Plugin factories that DON'T extend us
        // can wire their own emitters however they want — the contract
        // is just the four event getters on {@link MCPClient}.
        Object.defineProperty(client, '__fireDidAddTools', {
            value: (added: ToolInformation[]) => onDidAddToolsEmitter.fire(added),
            enumerable: false,
        });
        Object.defineProperty(client, '__fireClose', {
            value: (err: Error | undefined) => onCloseEmitter.fire(err),
            enumerable: false,
        });
        Object.defineProperty(client, '__fireWillInvokeTool', {
            value: (start: MCPToolInvocationStart) => onWillInvokeToolEmitter.fire(start),
            enumerable: false,
        });
        Object.defineProperty(client, '__fireDidInvokeTool', {
            value: (end: MCPToolInvocationEnd) => onDidInvokeToolEmitter.fire(end),
            enumerable: false,
        });
        return client;
    }
}

/**
 * Internal hook so {@link MCPServer} can drive the default client's
 * events without exposing the emitters on the public {@link MCPClient}
 * interface. Returns `false` when the client wasn't built by
 * {@link DefaultMCPClientFactory} (plugin factories own their own
 * emitter wiring).
 */
export function fireDefaultClientToolsAdded(client: MCPClient, added: ToolInformation[]): boolean {
    const fn = (client as unknown as { __fireDidAddTools?: (a: ToolInformation[]) => void }).__fireDidAddTools;
    if (typeof fn === 'function') {
        fn(added);
        return true;
    }
    return false;
}

/**
 * Internal hook — see {@link fireDefaultClientToolsAdded}.
 */
export function fireDefaultClientClose(client: MCPClient, err: Error | undefined): boolean {
    const fn = (client as unknown as { __fireClose?: (e: Error | undefined) => void }).__fireClose;
    if (typeof fn === 'function') {
        fn(err);
        return true;
    }
    return false;
}

/**
 * Internal hook so {@link MCPServer} (or any in-tree caller wrapping a
 * tool invocation) can drive the default client's
 * {@link MCPClient.onWillInvokeTool} event without exposing the emitter
 * on the public interface. Returns `false` for plugin-built clients —
 * those own their own emitter wiring around their `callTool` proxy.
 */
export function fireDefaultClientWillInvokeTool(client: MCPClient, start: MCPToolInvocationStart): boolean {
    const fn = (client as unknown as { __fireWillInvokeTool?: (s: MCPToolInvocationStart) => void }).__fireWillInvokeTool;
    if (typeof fn === 'function') {
        fn(start);
        return true;
    }
    return false;
}

/**
 * Internal hook — sibling to {@link fireDefaultClientWillInvokeTool}.
 * Fires {@link MCPClient.onDidInvokeTool}.
 */
export function fireDefaultClientDidInvokeTool(client: MCPClient, end: MCPToolInvocationEnd): boolean {
    const fn = (client as unknown as { __fireDidInvokeTool?: (e: MCPToolInvocationEnd) => void }).__fireDidInvokeTool;
    if (typeof fn === 'function') {
        fn(end);
        return true;
    }
    return false;
}

