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

import { expect } from 'chai';
import { MCPServerDescription, MCPClient, ToolInformation } from '../common';
import { MCPTransport } from '../common/mcp-transport-provider';
import { MCPToolInvocationEnd, MCPToolInvocationStart } from '../common/mcp-client-factory';
import { Emitter } from '@theia/core/lib/common/event';
import {
    DefaultMCPClientFactory,
    fireDefaultClientClose,
    fireDefaultClientDidInvokeTool,
    fireDefaultClientToolsAdded,
    fireDefaultClientWillInvokeTool,
} from './default-mcp-client-factory';

describe('DefaultMCPClientFactory — event surface (RFC Q3)', () => {
    const factory = new DefaultMCPClientFactory();
    const description: MCPServerDescription = { name: 'evt-test', command: 'echo' };

    function makeStubTransport(): MCPTransport {
        return {
            send: async () => undefined,
            close: async () => undefined,
            onMessage: new Emitter().event,
            onClose: new Emitter().event,
        };
    }
    const ctx = { resolveCredential: async () => undefined };

    it('declares onDidAddTools as a Theia Event', async () => {
        const client: MCPClient = await factory.create(description, makeStubTransport(), ctx);
        expect(client.onDidAddTools).to.be.a('function');
    });

    it('declares onClose as a Theia Event', async () => {
        const client: MCPClient = await factory.create(description, makeStubTransport(), ctx);
        expect(client.onClose).to.be.a('function');
    });

    it('fires onDidAddTools when MCPServer notifies the factory', async () => {
        const client: MCPClient = await factory.create(description, makeStubTransport(), ctx);
        const received: ToolInformation[][] = [];
        client.onDidAddTools(tools => received.push(tools));
        const newTools: ToolInformation[] = [
            { name: 'echo', description: 'echoes input', parameters: { type: 'object', properties: {} } } as unknown as ToolInformation,
        ];
        const fired = fireDefaultClientToolsAdded(client, newTools);
        expect(fired).to.be.true;
        expect(received).to.have.length(1);
        expect(received[0]).to.deep.equal(newTools);
    });

    it('fires onClose with undefined for a graceful stop', async () => {
        const client: MCPClient = await factory.create(description, makeStubTransport(), ctx);
        const received: Array<Error | undefined> = [];
        client.onClose(err => received.push(err));
        await client.stop();
        expect(received).to.have.length(1);
        expect(received[0]).to.equal(undefined);
    });

    it('fires onClose with the error for a transport-level close', async () => {
        const client: MCPClient = await factory.create(description, makeStubTransport(), ctx);
        const received: Array<Error | undefined> = [];
        client.onClose(err => received.push(err));
        const fired = fireDefaultClientClose(client, new Error('transport reset'));
        expect(fired).to.be.true;
        expect(received).to.have.length(1);
        expect(received[0]?.message).to.equal('transport reset');
    });

    it('fireDefaultClient* helpers return false for plugin clients without the wiring', () => {
        const pluginClient: MCPClient = {
            name: 'plugin',
            tools: [],
            onDidAddTools: new Emitter<ToolInformation[]>().event,
            onClose: new Emitter<Error | undefined>().event,
            onWillInvokeTool: new Emitter<MCPToolInvocationStart>().event,
            onDidInvokeTool: new Emitter<MCPToolInvocationEnd>().event,
            start: async () => undefined,
            stop: async () => undefined,
        };
        expect(fireDefaultClientToolsAdded(pluginClient, [])).to.be.false;
        expect(fireDefaultClientClose(pluginClient, undefined)).to.be.false;
        expect(fireDefaultClientWillInvokeTool(pluginClient, { toolName: 't', argsJSON: '{}' })).to.be.false;
        expect(fireDefaultClientDidInvokeTool(pluginClient, { toolName: 't', durationMs: 1, ok: true })).to.be.false;
    });

    // ── Invocation events (this commit) ──────────────────────────────

    it('declares onWillInvokeTool and onDidInvokeTool as Theia Events', async () => {
        const client: MCPClient = await factory.create(description, makeStubTransport(), ctx);
        expect(client.onWillInvokeTool).to.be.a('function');
        expect(client.onDidInvokeTool).to.be.a('function');
    });

    it('fires onWillInvokeTool with the tool name + JSON args', async () => {
        const client: MCPClient = await factory.create(description, makeStubTransport(), ctx);
        const received: MCPToolInvocationStart[] = [];
        client.onWillInvokeTool(s => received.push(s));
        const fired = fireDefaultClientWillInvokeTool(client, {
            toolName: 'echo',
            argsJSON: '{"message":"hi"}',
        });
        expect(fired).to.be.true;
        expect(received).to.have.length(1);
        expect(received[0].toolName).to.equal('echo');
        expect(received[0].argsJSON).to.equal('{"message":"hi"}');
    });

    it('fires onDidInvokeTool with duration + ok=true on success', async () => {
        const client: MCPClient = await factory.create(description, makeStubTransport(), ctx);
        const received: MCPToolInvocationEnd[] = [];
        client.onDidInvokeTool(e => received.push(e));
        const fired = fireDefaultClientDidInvokeTool(client, {
            toolName: 'echo',
            durationMs: 42,
            ok: true,
        });
        expect(fired).to.be.true;
        expect(received).to.have.length(1);
        expect(received[0]).to.deep.equal({ toolName: 'echo', durationMs: 42, ok: true });
    });

    it('fires onDidInvokeTool with ok=false + structured error on failure', async () => {
        const client: MCPClient = await factory.create(description, makeStubTransport(), ctx);
        const received: MCPToolInvocationEnd[] = [];
        client.onDidInvokeTool(e => received.push(e));
        const err = new Error('boom');
        fireDefaultClientDidInvokeTool(client, {
            toolName: 'echo',
            durationMs: 7,
            ok: false,
            error: { name: err.name, message: err.message },
        });
        expect(received).to.have.length(1);
        expect(received[0].ok).to.equal(false);
        expect(received[0].error?.name).to.equal('Error');
        expect(received[0].error?.message).to.equal('boom');
    });

    it('disposes invocation emitters on stop()', async () => {
        // We can't observe disposal directly, but a fire-after-stop should
        // be a no-op (the emitter is disposed and the receiver gets nothing).
        const client: MCPClient = await factory.create(description, makeStubTransport(), ctx);
        const received: MCPToolInvocationStart[] = [];
        client.onWillInvokeTool(s => received.push(s));
        await client.stop();
        // After stop(), the emitter is disposed; the helper still attempts
        // to fire (it doesn't know), but the receiver count stays 0.
        fireDefaultClientWillInvokeTool(client, { toolName: 'echo', argsJSON: '{}' });
        expect(received).to.have.length(0);
    });
});
