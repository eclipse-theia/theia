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
import { BackendRequestService, RequestContext, RequestOptions, RequestService } from '@theia/core/shared/@theia/request';
import { AIRegistryConfiguration } from './ai-registry-configuration';
import { MCPRegistryEntryResolver, MCPRegistryEntryResolverImpl } from './mcp/mcp-registry-entry-resolver';
import { PluginRegistryEntryResolver, PluginRegistryEntryResolverImpl } from './plugin/plugin-registry-entry-resolver';
import { SkillRegistryEntryResolver, SkillRegistryEntryResolverImpl } from './skill/skill-registry-entry-resolver';
import { RegistryFetchService, RegistryFetchServiceImpl } from './registry-fetch-service';
import { ILogger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';

class FakeRequestService implements RequestService {
    public lastUrl: string | undefined;
    public lastTimeout: number | undefined;
    public callCount = 0;
    /** When set, every request rejects with this error instead of responding. */
    public failWith: Error | undefined;
    /** When `true`, every request stays pending forever, mimicking a network that drops packets. */
    public hang = false;
    constructor(private readonly responseBody: string, private readonly statusCode = 200) { }
    async configure(): Promise<void> { /* no-op */ }
    async resolveProxy(): Promise<string | undefined> { return undefined; }
    async request(options: RequestOptions): Promise<RequestContext> {
        this.lastUrl = options.url;
        this.lastTimeout = options.timeout;
        this.callCount += 1;
        if (this.hang) {
            return new Promise<RequestContext>(() => { /* never settles */ });
        }
        if (this.failWith) {
            throw this.failWith;
        }
        return {
            url: options.url,
            res: { headers: {}, statusCode: this.statusCode },
            buffer: new TextEncoder().encode(this.responseBody)
        };
    }
}

/** Exposes the timing knobs so the tests don't have to wait out the production values. */
class TestRegistryFetchService extends RegistryFetchServiceImpl {
    public timeout = 10;
    public delay = 1000;
    public currentTime = 0;
    protected override get fetchTimeout(): number { return this.timeout; }
    protected override get retryDelay(): number { return this.delay; }
    protected override now(): number { return this.currentTime; }
}

/** Succeeds once and then fails, so that the "a failed refetch keeps the previous state" rule can be asserted. */
class FailingOnSecondRequestService implements RequestService {
    public callCount = 0;
    constructor(private readonly responseBody: string) { }
    async configure(): Promise<void> { /* no-op */ }
    async resolveProxy(): Promise<string | undefined> { return undefined; }
    async request(options: RequestOptions): Promise<RequestContext> {
        this.callCount += 1;
        return this.callCount === 1
            ? { url: options.url, res: { headers: {}, statusCode: 200 }, buffer: new TextEncoder().encode(this.responseBody) }
            : { url: options.url, res: { headers: {}, statusCode: 503 }, buffer: new Uint8Array() };
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
        }],
        skills: [{
            skillId: 'io.github.example/example-skill',
            name: 'Example Skill',
            description: 'Example skill',
            source: { url: 'https://github.com/example/skills', path: 'skills/example' },
            contentHash: 'abc123abc123',
            approvals: [{
                organizationId: 'theia',
                date: '2026-04-01',
                installConfigs: [{ tool: 'theia-ide', installUrl: 'theia://install-skill?id=io.github.example/example-skill' }]
            }]
        }],
        plugins: [{
            pluginId: 'io.github.example/example-plugin',
            name: 'Example Plugin',
            description: 'Example Agent Plugin',
            version: '1.2.0',
            source: { url: 'https://github.com/example/example-plugin.git' },
            contentHash: 'def456def456',
            containedSkills: [{ name: 'query-builder', description: 'Build SQL.', path: 'skills/query-builder' }],
            containedMcpServers: [{ name: 'bigquery', transport: 'stdio' }],
            approvals: [{
                organizationId: 'theia',
                date: '2026-04-01',
                configHash: 'plugin-hash-v1',
                installConfigs: [{ tool: 'theia-ide', installUrl: 'theia://install-plugin?id=io.github.example/example-plugin' }]
            }]
        }]
    });
}

describe('RegistryFetchService', () => {

    function buildContainer(requestService: RequestService, config: AIRegistryConfiguration): Container {
        const container = new Container();
        container.bind(BackendRequestService).toConstantValue(requestService);
        container.bind(AIRegistryConfiguration).toConstantValue(config);
        container.bind(ILogger).to(MockLogger).inSingletonScope();
        container.bind(MCPRegistryEntryResolverImpl).toSelf().inSingletonScope();
        container.bind(MCPRegistryEntryResolver).toService(MCPRegistryEntryResolverImpl);
        container.bind(SkillRegistryEntryResolverImpl).toSelf().inSingletonScope();
        container.bind(SkillRegistryEntryResolver).toService(SkillRegistryEntryResolverImpl);
        container.bind(PluginRegistryEntryResolverImpl).toSelf().inSingletonScope();
        container.bind(PluginRegistryEntryResolver).toService(PluginRegistryEntryResolverImpl);
        container.bind(RegistryFetchServiceImpl).toSelf().inSingletonScope();
        container.bind(RegistryFetchService).toService(RegistryFetchServiceImpl);
        return container;
    }

    it('fetches the per-tool JSON from <baseUrl>/tools/<toolName>.json and returns resolved entries', async () => {
        const request = new FakeRequestService(payload());
        const config = new FakeConfiguration('theia-ide', 'https://example.test/api/v1/');
        const service = buildContainer(request, config).get<RegistryFetchService>(RegistryFetchService);

        const entries = await service.getEntries();

        expect(request.lastUrl).to.equal('https://example.test/api/v1/tools/theia-ide.json');
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

    it('fetches the aggregate registry from <baseUrl>/all.json for the default "all" tool', async () => {
        const request = new FakeRequestService(payload());
        const config = new FakeConfiguration('all', 'https://example.test/api/v1/');
        const service = buildContainer(request, config).get<RegistryFetchService>(RegistryFetchService);

        await service.getEntries();

        expect(request.lastUrl).to.equal('https://example.test/api/v1/all.json');
    });

    it('fetches and resolves skill entries from the same per-tool JSON', async () => {
        const request = new FakeRequestService(payload());
        const config = new FakeConfiguration('theia-ide', 'https://example.test/api/v1/');
        const service = buildContainer(request, config).get<RegistryFetchService>(RegistryFetchService);

        const skills = await service.getSkillEntries();

        expect(skills).to.have.length(1);
        expect(skills[0]).to.deep.equal({
            skillId: 'io.github.example/example-skill',
            name: 'Example Skill',
            description: 'Example skill',
            sourceUrl: 'https://github.com/example/skills',
            sourcePath: 'skills/example',
            contentHash: 'abc123abc123'
        });
    });

    it('fetches and resolves Agent Plugin entries from the same per-tool JSON', async () => {
        const request = new FakeRequestService(payload());
        const config = new FakeConfiguration('theia-ide', 'https://example.test/api/v1/');
        const service = buildContainer(request, config).get<RegistryFetchService>(RegistryFetchService);

        const plugins = await service.getPluginEntries();

        expect(plugins).to.have.length(1);
        expect(plugins[0]).to.deep.equal({
            pluginId: 'io.github.example/example-plugin',
            name: 'Example Plugin',
            description: 'Example Agent Plugin',
            version: '1.2.0',
            sourceUrl: 'https://github.com/example/example-plugin.git',
            contentHash: 'def456def456',
            endorsements: [{ organizationId: 'theia', date: '2026-04-01' }],
            containedSkills: [{ name: 'query-builder', description: 'Build SQL.', path: 'skills/query-builder' }],
            containedMcpServers: [{ name: 'bigquery', transport: 'stdio' }]
        });
    });

    it('returns an empty plugin slice when the registry response has none', async () => {
        const request = new FakeRequestService(JSON.stringify({ mcp: [], skills: [] }));
        const service = buildContainer(request, new FakeConfiguration('theia-ide', 'https://example.test/api/v1/')).get<RegistryFetchService>(RegistryFetchService);

        expect(await service.getPluginEntries()).to.deep.equal([]);
    });

    it('shares a single HTTP request between the MCP, skill and plugin slices', async () => {
        const request = new FakeRequestService(payload());
        const config = new FakeConfiguration('theia-ide', 'https://example.test/api/v1/');
        const service = buildContainer(request, config).get<RegistryFetchService>(RegistryFetchService);

        await service.getEntries();
        await service.getSkillEntries();
        await service.getPluginEntries();

        expect(request.callCount).to.equal(1);
    });

    it('re-resolves the plugin slice after a forced refetch', async () => {
        const request = new FakeRequestService(payload());
        const service = buildContainer(request, new FakeConfiguration('theia-ide', 'https://example.test/api/v1/')).get<RegistryFetchService>(RegistryFetchService);

        const first = await service.getPluginEntries();
        const refreshed = await service.getPluginEntries(true);

        expect(request.callCount).to.equal(2);
        expect(refreshed).to.not.equal(first);
        expect(refreshed).to.deep.equal(first);
    });

    it('leaves the previously cached plugin entries intact when a refetch fails', async () => {
        const request = new FailingOnSecondRequestService(payload());
        const service = buildContainer(request, new FakeConfiguration('theia-ide', 'https://example.test/api/v1/')).get<RegistryFetchService>(RegistryFetchService);
        const plugins = await service.getPluginEntries();

        let caught: Error | undefined;
        try {
            await service.getPluginEntries(true);
        } catch (error) {
            caught = error as Error;
        }

        expect(caught?.message).to.match(/HTTP 503/);
        expect(await service.getPluginEntries()).to.deep.equal(plugins);
    });

    it('serves cached entries on a second call without issuing a new request', async () => {
        const request = new FakeRequestService(payload());
        const config = new FakeConfiguration('theia-ide', 'https://example.test/api/v1/');
        const service = buildContainer(request, config).get<RegistryFetchService>(RegistryFetchService);

        await service.getEntries();
        await service.getEntries();

        expect(request.callCount).to.equal(1);
    });

    it('refetches when forceRefresh is true', async () => {
        const request = new FakeRequestService(payload());
        const config = new FakeConfiguration('theia-ide', 'https://example.test/api/v1/');
        const service = buildContainer(request, config).get<RegistryFetchService>(RegistryFetchService);

        await service.getEntries();
        await service.getEntries(true);

        expect(request.callCount).to.equal(2);
    });

    function buildTestService(requestService: RequestService): TestRegistryFetchService {
        const container = buildContainer(requestService, new FakeConfiguration('theia-ide', 'https://example.test/api/v1/'));
        container.rebind(RegistryFetchServiceImpl).to(TestRegistryFetchService).inSingletonScope();
        return container.get(RegistryFetchServiceImpl) as TestRegistryFetchService;
    }

    async function expectRejection(promise: Promise<unknown>): Promise<Error> {
        try {
            await promise;
        } catch (error) {
            return error as Error;
        }
        throw new Error('Expected the fetch to be rejected.');
    }

    it('issues a single request for callers that ask concurrently', async () => {
        const request = new FakeRequestService(payload());
        const service = buildTestService(request);

        // The Extensions view resolves its sections in parallel, and the auto-update check adds
        // another caller, so the requests overlap in practice.
        await Promise.all([service.getEntries(), service.getSkillEntries(), service.getEntries()]);

        expect(request.callCount).to.equal(1);
    });

    it('gives up on a request that never settles', async () => {
        const request = new FakeRequestService(payload());
        request.hang = true;
        const service = buildTestService(request);

        const error = await expectRejection(service.getEntries());

        expect(error.message).to.match(/Timed out fetching the AI registry/);
        expect(request.lastTimeout).to.equal(service.timeout);
    });

    it('backs off instead of re-attempting a failed fetch on every call', async () => {
        const request = new FakeRequestService(payload());
        request.failWith = new Error('getaddrinfo ENOTFOUND example.test');
        const service = buildTestService(request);

        await expectRejection(service.getEntries());
        const second = await expectRejection(service.getSkillEntries());

        expect(request.callCount).to.equal(1);
        expect(second.message).to.match(/ENOTFOUND/);
    });

    it('attempts the network again once the backoff window has passed', async () => {
        const request = new FakeRequestService(payload());
        request.failWith = new Error('offline');
        const service = buildTestService(request);

        await expectRejection(service.getEntries());
        service.currentTime += service.delay;
        request.failWith = undefined;
        const entries = await service.getEntries();

        expect(request.callCount).to.equal(2);
        expect(entries).to.have.length(1);
    });

    it('ignores the backoff window on an explicit refresh', async () => {
        const request = new FakeRequestService(payload());
        request.failWith = new Error('offline');
        const service = buildTestService(request);

        await expectRejection(service.getEntries());
        request.failWith = undefined;
        const entries = await service.getEntries(true);

        expect(request.callCount).to.equal(2);
        expect(entries).to.have.length(1);
    });

    it('throws a descriptive error when the server returns a non-success status', async () => {
        const request = new FakeRequestService('', 404);
        const config = new FakeConfiguration('theia-ide', 'https://example.test/api/v1/');
        const service = buildContainer(request, config).get<RegistryFetchService>(RegistryFetchService);

        let caught: Error | undefined;
        try {
            await service.getEntries();
        } catch (error) {
            caught = error as Error;
        }
        expect(caught?.message).to.match(/HTTP 404/);
    });
});
