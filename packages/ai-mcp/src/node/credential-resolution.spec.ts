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
    MCPCredentialRequest, MCPCredentialResolver, MCPServerDescription,
} from '../common';
import { EnvCredentialResolver } from './env-credential-resolver';
import { MCPServer } from './mcp-server';

describe('@theia/ai-mcp credential resolution (RFC phase C)', () => {

    const remoteDesc: MCPServerDescription = {
        name: 'remote',
        serverUrl: 'https://example.com/mcp',
    };

    describe('EnvCredentialResolver', () => {
        const resolver = new EnvCredentialResolver();

        afterEach(() => {
            delete process.env.__MCP_TEST_VAR;
        });

        it('resolves `${env:NAME}` to process.env[NAME]', async () => {
            process.env.__MCP_TEST_VAR = 'resolved-value';
            const value = await resolver.resolve({
                serverName: 'x', field: 'serverAuthToken',
                literal: '${env:__MCP_TEST_VAR}',
            });
            expect(value).to.equal('resolved-value');
        });

        it('returns undefined when the env var is unset', async () => {
            const value = await resolver.resolve({
                serverName: 'x', field: 'serverAuthToken',
                literal: '${env:__MCP_NEVER_SET}',
            });
            expect(value).to.be.undefined;
        });

        it('does not match plain values', async () => {
            const value = await resolver.resolve({
                serverName: 'x', field: 'serverAuthToken',
                literal: 'already-a-token',
            });
            expect(value).to.be.undefined;
        });

        it('does not match non-env sentinels', async () => {
            const value = await resolver.resolve({
                serverName: 'x', field: 'serverAuthToken',
                literal: '${mcp:credential}',
            });
            expect(value).to.be.undefined;
        });

        it('returns undefined when no literal is supplied', async () => {
            const value = await resolver.resolve({ serverName: 'x', field: 'y' });
            expect(value).to.be.undefined;
        });
    });

    describe('MCPServer sentinel detection', () => {
        const server = new MCPServer(remoteDesc, [], [], [], []);
        type SentinelFn = (value: string | undefined) => boolean;
        const isSentinel = (server as unknown as { isCredentialSentinel: SentinelFn })
            .isCredentialSentinel.bind(server);

        it('detects `${env:X}` as a sentinel', () => {
            expect(isSentinel('${env:X}')).to.be.true;
        });
        it('detects `${mcp:credential}` as a sentinel', () => {
            expect(isSentinel('${mcp:credential}')).to.be.true;
        });
        it('rejects plain strings', () => {
            expect(isSentinel('abc123')).to.be.false;
        });
        it('rejects partially-formed sentinels', () => {
            expect(isSentinel('${env')).to.be.false;
            expect(isSentinel('env:X}')).to.be.false;
        });
        it('handles undefined / empty', () => {
            expect(isSentinel(undefined)).to.be.false;
            expect(isSentinel('')).to.be.false;
        });
    });

    describe('MCPServer resolver chain', () => {
        type ResolveFn = (
            description: MCPServerDescription,
            field: string,
            literal: string | undefined,
        ) => Promise<string | undefined>;

        it('returns undefined with no resolvers', async () => {
            const server = new MCPServer(remoteDesc);
            const resolve = (server as unknown as { resolveCredential: ResolveFn })
                .resolveCredential.bind(server);
            expect(await resolve(remoteDesc, 'serverAuthToken', '${mcp:credential}')).to.be.undefined;
        });

        it('runs resolvers priority-descending and short-circuits on first non-undefined', async () => {
            const order: string[] = [];
            const low: MCPCredentialResolver = {
                id: 'low', priority: 1,
                async resolve(): Promise<string | undefined> { order.push('low'); return 'from-low'; },
            };
            const high: MCPCredentialResolver = {
                id: 'high', priority: 100,
                async resolve(): Promise<string | undefined> { order.push('high'); return 'from-high'; },
            };
            const server = new MCPServer(remoteDesc, [], [], [], [low, high]);
            const resolve = (server as unknown as { resolveCredential: ResolveFn })
                .resolveCredential.bind(server);
            const result = await resolve(remoteDesc, 'serverAuthToken', '${x}');
            expect(result).to.equal('from-high');
            expect(order).to.deep.equal(['high']);
        });

        it('falls through to a lower-priority resolver on undefined', async () => {
            const abstain: MCPCredentialResolver = {
                id: 'abstain', priority: 100,
                async resolve(): Promise<string | undefined> { return undefined; },
            };
            const answer: MCPCredentialResolver = {
                id: 'answer', priority: 10,
                async resolve(): Promise<string | undefined> { return 'found'; },
            };
            const server = new MCPServer(remoteDesc, [], [], [], [abstain, answer]);
            const resolve = (server as unknown as { resolveCredential: ResolveFn })
                .resolveCredential.bind(server);
            expect(await resolve(remoteDesc, 'x', '${y}')).to.equal('found');
        });

        it('swallows resolver errors and continues', async () => {
            const boom: MCPCredentialResolver = {
                id: 'boom', priority: 100,
                async resolve(): Promise<string | undefined> { throw new Error('resolver down'); },
            };
            const ok: MCPCredentialResolver = {
                id: 'ok', priority: 10,
                async resolve(): Promise<string | undefined> { return 'ok'; },
            };
            const server = new MCPServer(remoteDesc, [], [], [], [boom, ok]);
            const resolve = (server as unknown as { resolveCredential: ResolveFn })
                .resolveCredential.bind(server);
            expect(await resolve(remoteDesc, 'x', '${y}')).to.equal('ok');
        });
    });

    describe('MCPServer materialiseCredentials', () => {
        type MatFn = (description: MCPServerDescription) => Promise<MCPServerDescription>;

        it('returns the original description when there are no sentinels', async () => {
            const plain: MCPServerDescription = {
                ...remoteDesc,
                serverAuthToken: 'literal-token',
            };
            const server = new MCPServer(plain);
            const materialise = (server as unknown as { materialiseCredentials: MatFn })
                .materialiseCredentials.bind(server);
            const out = await materialise(plain);
            expect(out).to.equal(plain);
        });

        it('replaces a sentinel serverAuthToken with the resolved value', async () => {
            const desc: MCPServerDescription = {
                ...remoteDesc,
                serverAuthToken: '${mcp:credential}',
            };
            const resolver: MCPCredentialResolver = {
                id: 't', priority: 100,
                async resolve(request: MCPCredentialRequest): Promise<string | undefined> {
                    return request.field === 'serverAuthToken' ? 'real' : undefined;
                },
            };
            const server = new MCPServer(desc, [], [], [], [resolver]);
            const materialise = (server as unknown as { materialiseCredentials: MatFn })
                .materialiseCredentials.bind(server);
            const out = await materialise(desc);
            expect(out).to.not.equal(desc); // new object
            expect((out as { serverAuthToken?: string }).serverAuthToken).to.equal('real');
        });

        it('drops a sentinel serverAuthToken when no resolver matches', async () => {
            const desc: MCPServerDescription = {
                ...remoteDesc,
                serverAuthToken: '${env:__never_set_var__}',
            };
            const server = new MCPServer(desc, [], [], [], [new EnvCredentialResolver()]);
            const materialise = (server as unknown as { materialiseCredentials: MatFn })
                .materialiseCredentials.bind(server);
            const out = await materialise(desc);
            expect((out as { serverAuthToken?: string }).serverAuthToken).to.be.undefined;
        });

        it('resolves sentinels inside headers map', async () => {
            const desc: MCPServerDescription = {
                ...remoteDesc,
                headers: { 'X-API-Key': '${env:__MCP_HEADER_VAR}' },
            };
            process.env.__MCP_HEADER_VAR = 'header-value';
            try {
                const server = new MCPServer(desc, [], [], [], [new EnvCredentialResolver()]);
                const materialise = (server as unknown as { materialiseCredentials: MatFn })
                    .materialiseCredentials.bind(server);
                const out = await materialise(desc);
                const headers = (out as { headers?: Record<string, string> }).headers;
                expect(headers?.['X-API-Key']).to.equal('header-value');
            } finally {
                delete process.env.__MCP_HEADER_VAR;
            }
        });

        it('drops unresolved sentinel headers', async () => {
            const desc: MCPServerDescription = {
                ...remoteDesc,
                headers: {
                    'X-Keep': 'plain',
                    'X-Drop': '${env:__never__}',
                },
            };
            const server = new MCPServer(desc, [], [], [], [new EnvCredentialResolver()]);
            const materialise = (server as unknown as { materialiseCredentials: MatFn })
                .materialiseCredentials.bind(server);
            const out = await materialise(desc);
            const headers = (out as { headers?: Record<string, string> }).headers;
            expect(headers?.['X-Keep']).to.equal('plain');
            expect(headers?.['X-Drop']).to.be.undefined;
        });

        it('leaves local descriptions untouched', async () => {
            const local: MCPServerDescription = {
                name: 'local',
                command: 'echo',
                env: { TOKEN: '${env:__MCP_NOT_RESOLVED__}' },
            };
            const server = new MCPServer(local, [], [], [], [new EnvCredentialResolver()]);
            const materialise = (server as unknown as { materialiseCredentials: MatFn })
                .materialiseCredentials.bind(server);
            const out = await materialise(local);
            // Local descriptions keep their env map verbatim — the sentinel
            // rewrite is remote-only in Phase C. Env-var interpolation inside
            // process env for local servers is a follow-up.
            expect(out).to.equal(local);
        });
    });
});
