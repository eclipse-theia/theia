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
    MCPToolFilterOutcome,
    MCPTransport,
    MCPTransportProvider,
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

    it('MCPToolFilter outcomes: replacement / suppression / passthrough', () => {
        const rename: MCPToolFilter = {
            id: 'rename',
            filter: (_s, advertised: ToolInformation) => ({ ...advertised, name: advertised.name.toUpperCase() }),
        };
        const suppress: MCPToolFilter = {
            id: 'suppress',
            filter: () => undefined,
        };
        const defer: MCPToolFilter = {
            id: 'defer',
            filter: (): MCPToolFilterOutcome => 'passthrough',
        };

        const input: ToolInformation = { name: 'search' };
        expect((rename.filter('srv', input) as ToolInformation).name).to.equal('SEARCH');
        expect(suppress.filter('srv', input)).to.be.undefined;
        expect(defer.filter('srv', input)).to.equal('passthrough');
    });

    it('MCPClientFactory context carries a credential resolver', async () => {
        let requestedField: string | undefined;
        const factory: MCPClientFactory = {
            id: 'test',
            create: async (description, _transport, ctx) => {
                requestedField = 'auth';
                await ctx.resolveCredential({ serverName: description.name, field: 'auth' });
                return {
                    name: description.name,
                    tools: [],
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
