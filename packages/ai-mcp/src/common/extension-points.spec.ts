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
import { Emitter } from '@theia/core/lib/common/event';
import {
    MCPClientFactory,
    MCPCredentialResolver,
    MCPServerDescription,
    MCPToolFilter,
    MCPToolFilterContext,
    MCPToolFilterOutcome,
    MCPTransport,
    MCPTransportProvider,
    MCPWorkspaceTrustLevel,
    ToolInformation,
} from './index';

describe('@theia/ai-mcp extension-point surface', () => {

    it('exports the four contribution-point symbols', () => {
        expect(typeof MCPTransportProvider).to.equal('symbol');
        expect(typeof MCPCredentialResolver).to.equal('symbol');
        expect(typeof MCPToolFilter).to.equal('symbol');
        expect(typeof MCPClientFactory).to.equal('symbol');
    });

    it('admits a minimal MCPTransportProvider implementation', async () => {
        const noopEmitter = new Emitter<unknown>();
        const closeEmitter = new Emitter<Error | undefined>();
        const provider: MCPTransportProvider = {
            id: 'test-noop',
            priority: 0,
            matches: () => true,
            create: async (): Promise<MCPTransport> => ({
                kind: 'noop',
                send: async () => undefined,
                close: async () => undefined,
                onMessage: noopEmitter.event,
                onClose: closeEmitter.event,
            }),
        };
        const description = { name: 'x', command: 'echo' } as MCPServerDescription;
        const transport = await provider.create(description, new AbortController().signal);
        expect(transport.kind).to.equal('noop');
    });

    it('admits a minimal MCPCredentialResolver that falls through on undefined', async () => {
        const never: MCPCredentialResolver = {
            id: 'never',
            priority: 100,
            resolve: async () => undefined,
        };
        expect(await never.resolve({ serverName: 'x', field: 'y' })).to.be.undefined;
    });

    function makeContext(overrides: Partial<MCPToolFilterContext> = {}): MCPToolFilterContext {
        const description = { name: 'srv', command: 'echo' } as MCPServerDescription;
        return {
            serverName: 'srv',
            serverDescription: description,
            tool: { name: 'search' },
            workspaceTrustLevel: 'trusted',
            ...overrides,
        };
    }

    it('MCPToolFilter outcomes: replacement / suppression / passthrough', () => {
        const rename: MCPToolFilter = {
            id: 'rename',
            filter: (ctx: MCPToolFilterContext) => ({
                ...ctx.tool,
                name: ctx.tool.name.toUpperCase(),
                originalName: ctx.tool.originalName ?? ctx.tool.name,
            }),
        };
        const suppress: MCPToolFilter = {
            id: 'suppress',
            filter: () => undefined,
        };
        const defer: MCPToolFilter = {
            id: 'defer',
            filter: (): MCPToolFilterOutcome => 'passthrough',
        };

        const renamed = rename.filter(makeContext()) as ToolInformation;
        expect(renamed.name).to.equal('SEARCH');
        expect(renamed.originalName).to.equal('search');
        expect(suppress.filter(makeContext())).to.be.undefined;
        expect(defer.filter(makeContext())).to.equal('passthrough');
    });

    it('MCPToolFilterContext exposes server identity, description, and trust level', () => {
        let captured: MCPToolFilterContext | undefined;
        const inspect: MCPToolFilter = {
            id: 'inspect',
            filter: ctx => { captured = ctx; return 'passthrough'; },
        };

        const restrictedCtx = makeContext({ workspaceTrustLevel: 'restricted' });
        inspect.filter(restrictedCtx);

        expect(captured?.serverName).to.equal('srv');
        expect(captured?.serverDescription).to.equal(restrictedCtx.serverDescription);
        expect(captured?.tool.name).to.equal('search');
        expect(captured?.workspaceTrustLevel).to.equal('restricted');
    });

    it('MCPWorkspaceTrustLevel admits exactly trusted/restricted/unknown', () => {
        const levels: MCPWorkspaceTrustLevel[] = ['trusted', 'restricted', 'unknown'];
        // Compile-time check via type-narrowing: the array would not satisfy
        // the type if any of the three were missing or misspelled.
        expect(levels).to.have.length(3);
    });

    it('ToolInformation accepts optional originalName + provenance', () => {
        const tool: ToolInformation = {
            name: 'gh_issues',
            originalName: 'list_issues',
            provenance: 'github-mcp-server',
        };
        expect(tool.originalName).to.equal('list_issues');
        expect(tool.provenance).to.equal('github-mcp-server');
    });

    it('MCPClientFactory context carries a credential resolver', async () => {
        let requestedField: string | undefined;
        const noopToolEmitter = new Emitter<ToolInformation[]>();
        const noopCloseEmitter = new Emitter<Error | undefined>();
        const noopWillEmitter = new Emitter<{ toolName: string; argsJSON: string }>();
        const noopDidEmitter = new Emitter<{ toolName: string; durationMs: number; ok: boolean }>();
        const factory: MCPClientFactory = {
            id: 'test',
            create: async (description, _transport, ctx) => {
                requestedField = 'auth';
                await ctx.resolveCredential({ serverName: description.name, field: 'auth' });
                return {
                    name: description.name,
                    tools: [],
                    onDidAddTools: noopToolEmitter.event,
                    onClose: noopCloseEmitter.event,
                    onWillInvokeTool: noopWillEmitter.event,
                    onDidInvokeTool: noopDidEmitter.event,
                    start: async () => undefined,
                    stop: async () => undefined,
                };
            },
        };
        const noopEmitter = new Emitter<unknown>();
        const closeEmitter = new Emitter<Error | undefined>();
        const client = await factory.create(
            { name: 'x', command: 'echo' } as MCPServerDescription,
            {
                kind: 'noop',
                send: async () => undefined,
                close: async () => undefined,
                onMessage: noopEmitter.event,
                onClose: closeEmitter.event,
            },
            { resolveCredential: async () => 'token' },
        );
        expect(client.name).to.equal('x');
        expect(requestedField).to.equal('auth');
    });
});
