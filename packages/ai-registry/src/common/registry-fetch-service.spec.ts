// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { Container } from '@theia/core/shared/inversify';
import { RequestContext, RequestOptions, RequestService } from '@theia/core/shared/@theia/request';
import { AIRegistryConfiguration } from './ai-registry-configuration';
import { MCPRegistryEntryResolver, MCPRegistryEntryResolverImpl } from './mcp/mcp-registry-entry-resolver';
import { RegistryFetchService, RegistryFetchServiceImpl } from './registry-fetch-service';

class FakeRequestService implements RequestService {
    public lastUrl: string | undefined;
    public callCount = 0;
    constructor(private readonly responseBody: string, private readonly statusCode = 200) { }
    async configure(): Promise<void> { /* no-op */ }
    async resolveProxy(): Promise<string | undefined> { return undefined; }
    async request(options: RequestOptions): Promise<RequestContext> {
        this.lastUrl = options.url;
        this.callCount += 1;
        return {
            url: options.url,
            res: { headers: {}, statusCode: this.statusCode },
            buffer: new TextEncoder().encode(this.responseBody)
        };
    }
}

class FakeConfiguration extends AIRegistryConfiguration {
    constructor(private readonly toolName: string, private readonly baseUrl: string) { super(); }
    override getToolName(): string { return this.toolName; }
    override getBaseUrl(): string { return this.baseUrl; }
}

function payload(): string {
    return JSON.stringify({
        organizations: [],
        tools: [],
        mcp: [{
            serverId: 'io.github.example/example-mcp',
            name: 'Example',
            description: 'Example MCP server',
            mcpRegistryVerified: true,
            approvals: [{
                organizationId: 'theia',
                date: '2026-04-01',
                version: '^1.0.0',
                configHash: 'hash-v1',
                installConfigs: [{
                    tool: 'theia-ide',
                    config: { servers: { example: { command: 'npx', args: ['-y', 'example-mcp'] } } }
                }]
            }]
        }]
    });
}

describe('RegistryFetchService', () => {

    function buildContainer(requestService: RequestService, config: AIRegistryConfiguration): Container {
        const container = new Container();
        container.bind(RequestService).toConstantValue(requestService);
        container.bind(AIRegistryConfiguration).toConstantValue(config);
        container.bind(MCPRegistryEntryResolverImpl).toSelf().inSingletonScope();
        container.bind(MCPRegistryEntryResolver).toService(MCPRegistryEntryResolverImpl);
        container.bind(RegistryFetchServiceImpl).toSelf().inSingletonScope();
        container.bind(RegistryFetchService).toService(RegistryFetchServiceImpl);
        return container;
    }

    it('fetches the per-tool JSON from <baseUrl>/<toolName>.json and returns resolved entries', async () => {
        const request = new FakeRequestService(payload());
        const config = new FakeConfiguration('theia-ide', 'https://example.test/api/v1/');
        const service = buildContainer(request, config).get<RegistryFetchService>(RegistryFetchService);

        const entries = await service.getEntries();

        expect(request.lastUrl).to.equal('https://example.test/api/v1/theia-ide.json');
        expect(entries).to.have.length(1);
        expect(entries[0]).to.deep.equal({
            serverId: 'io.github.example/example-mcp',
            name: 'Example',
            description: 'Example MCP server',
            localName: 'example',
            config: { command: 'npx', args: ['-y', 'example-mcp'] },
            version: '^1.0.0',
            configHash: 'hash-v1',
            mcpRegistryVerified: true
        });
    });

    it('serves cached entries on a second call without issuing a new request', async () => {
        const request = new FakeRequestService(payload());
        const service = buildContainer(request, new FakeConfiguration('theia-ide', 'https://example.test/api/v1/')).get<RegistryFetchService>(RegistryFetchService);

        await service.getEntries();
        await service.getEntries();

        expect(request.callCount).to.equal(1);
    });

    it('refetches when forceRefresh is true', async () => {
        const request = new FakeRequestService(payload());
        const service = buildContainer(request, new FakeConfiguration('theia-ide', 'https://example.test/api/v1/')).get<RegistryFetchService>(RegistryFetchService);

        await service.getEntries();
        await service.getEntries(true);

        expect(request.callCount).to.equal(2);
    });

    it('throws a descriptive error when the server returns a non-success status', async () => {
        const request = new FakeRequestService('', 404);
        const service = buildContainer(request, new FakeConfiguration('theia-ide', 'https://example.test/api/v1/')).get<RegistryFetchService>(RegistryFetchService);

        let caught: Error | undefined;
        try {
            await service.getEntries();
        } catch (error) {
            caught = error as Error;
        }
        expect(caught?.message).to.match(/HTTP 404/);
    });
});
