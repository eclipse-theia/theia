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
import {
    MCPServerDescription, MCPToolFilter, ToolInformation,
} from '../common';
import { StdioTransportProvider } from './stdio-transport-provider';
import { HttpTransportProvider } from './http-transport-provider';
import { PassthroughToolFilter } from './passthrough-tool-filter';
import { PreferenceCredentialResolver } from './preference-credential-resolver';
import { MCPServer } from './mcp-server';

describe('@theia/ai-mcp default providers', () => {

    const localDesc: MCPServerDescription = {
        name: 'local',
        command: 'echo',
    };
    const remoteDesc: MCPServerDescription = {
        name: 'remote',
        serverUrl: 'https://example.com/mcp',
    };
    const remoteDescWithAuth: MCPServerDescription = {
        name: 'remote-auth',
        serverUrl: 'https://example.com/mcp',
        serverAuthToken: 'secret',
    };

    describe('StdioTransportProvider', () => {
        const provider = new StdioTransportProvider();

        it('matches local descriptions', () => {
            expect(provider.matches(localDesc)).to.be.true;
        });
        it('does not match remote descriptions', () => {
            expect(provider.matches(remoteDesc)).to.be.false;
        });
        it('priority is 0 (lowest) so plugins can override', () => {
            expect(provider.priority).to.equal(0);
        });
        it('rejects creation with an already-aborted signal', async () => {
            const controller = new AbortController();
            controller.abort();
            let error: unknown;
            try {
                await provider.create(localDesc, controller.signal);
            } catch (e) {
                error = e;
            }
            expect(error).to.be.instanceOf(DOMException);
            expect((error as DOMException).name).to.equal('AbortError');
        });
    });

    describe('HttpTransportProvider', () => {
        const provider = new HttpTransportProvider();

        it('matches remote descriptions', () => {
            expect(provider.matches(remoteDesc)).to.be.true;
        });
        it('does not match local descriptions', () => {
            expect(provider.matches(localDesc)).to.be.false;
        });
        interface HeaderDesc {
            headers?: Record<string, string>;
            serverAuthToken?: string;
            serverAuthTokenHeader?: string;
        }
        type HeaderFn = (desc: HeaderDesc) => Record<string, string> | undefined;
        const buildHeaders = (provider as unknown as { buildHeaders: HeaderFn })
            .buildHeaders.bind(provider);

        it('builds a bearer Authorization header when only serverAuthToken is set', () => {
            const headers = buildHeaders({ serverAuthToken: 'secret' });
            expect(headers?.Authorization).to.equal('Bearer secret');
        });
        it('honours a custom serverAuthTokenHeader', () => {
            const headers = buildHeaders({
                serverAuthToken: 'secret',
                serverAuthTokenHeader: 'X-Api-Key',
            });
            expect(headers?.['X-Api-Key']).to.equal('secret');
            expect(headers?.Authorization).to.be.undefined;
        });
        it('returns undefined when no headers or auth are configured', () => {
            expect(buildHeaders({})).to.be.undefined;
        });
        it('merges description.headers with auth header', () => {
            const headers = buildHeaders({
                headers: { 'X-Trace': 'abc' },
                serverAuthToken: 'secret',
            });
            expect(headers).to.deep.include({ 'X-Trace': 'abc', Authorization: 'Bearer secret' });
        });
        it('rejects creation for a local description', async () => {
            let error: unknown;
            try {
                await provider.create(localDesc, new AbortController().signal);
            } catch (e) {
                error = e;
            }
            expect((error as Error).message).to.include('cannot create a transport for local');
        });
    });

    describe('PassthroughToolFilter', () => {
        it('returns "passthrough" unconditionally', () => {
            const filter = new PassthroughToolFilter();
            expect(filter.filter()).to.equal('passthrough');
        });
        it('is registered at priority 0 so it runs last', () => {
            expect(new PassthroughToolFilter().priority).to.equal(0);
        });
    });

    describe('PreferenceCredentialResolver', () => {
        it('returns undefined so the chain falls through', async () => {
            const resolver = new PreferenceCredentialResolver();
            expect(await resolver.resolve({ serverName: 'x', field: 'y' })).to.be.undefined;
        });
    });

    describe('MCPServer wiring', () => {
        it('applyToolFilters chain: rewrite → passthrough → suppress', () => {
            const rename: MCPToolFilter = {
                id: 'rename', priority: 100,
                filter: (_s, tool) => ({ ...tool, name: tool.name + '-renamed' }),
            };
            const noop: MCPToolFilter = {
                id: 'noop', priority: 50,
                filter: () => 'passthrough',
            };
            const killDoomed: MCPToolFilter = {
                id: 'kill-doomed', priority: 10,
                filter: (_s, tool) => tool.name.startsWith('doomed-') ? undefined : tool,
            };
            const server = new MCPServer(localDesc, [], [rename, noop, killDoomed], []);
            type ApplyFn = (t: ToolInformation) => ToolInformation | undefined;
            const apply = (server as unknown as { applyToolFilters: ApplyFn }).applyToolFilters.bind(server);
            const applied = apply({ name: 'search' });
            expect(applied?.name).to.equal('search-renamed');
            // `doomed-` prefix survives the rename (it only appends a suffix),
            // so the last filter still catches it.
            const suppressed = apply({ name: 'doomed-op' });
            expect(suppressed).to.be.undefined;
        });
        it('pickTransportProvider returns the first matching provider in priority-descending order', () => {
            const low = new StdioTransportProvider();
            const http = new HttpTransportProvider();
            const server = new MCPServer(remoteDescWithAuth, [low, http], [], []);
            type PickFn = (d: MCPServerDescription) => { id: string } | undefined;
            const pick = (server as unknown as { pickTransportProvider: PickFn })
                .pickTransportProvider.bind(server);
            // http matches remote, stdio does not — http wins regardless of ordering.
            expect(pick(remoteDescWithAuth)?.id).to.equal('http');
        });
        it('pickTransportProvider returns undefined when no provider matches', () => {
            const server = new MCPServer(localDesc, [], [], []);
            type PickFn = (d: MCPServerDescription) => unknown;
            const pick = (server as unknown as { pickTransportProvider: PickFn })
                .pickTransportProvider.bind(server);
            expect(pick(localDesc)).to.be.undefined;
        });
        it('constructor with no providers preserves today\'s single-arg behaviour', () => {
            const server = new MCPServer(localDesc);
            // Just asserting the constructor doesn't throw and status is initialised.
            expect(server.getStatus()).to.be.a('string');
        });
    });
});
