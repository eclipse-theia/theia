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

import { Emitter, Event } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { BackendRequestService, RequestContext, RequestService } from '@theia/core/shared/@theia/request';
import { AIRegistryConfiguration } from './ai-registry-configuration';
import { MCPRegistryEntryResolver } from './mcp/mcp-registry-entry-resolver';
import { RegistryMCPServer, ResolvedRegistryEntry } from './mcp/mcp-registry-types';
import { PluginRegistryEntryResolver } from './plugin/plugin-registry-entry-resolver';
import { RegistryPlugin, ResolvedPluginEntry } from './plugin/plugin-registry-types';
import { SkillRegistryEntryResolver } from './skill/skill-registry-entry-resolver';
import { RegistrySkill, ResolvedSkillEntry } from './skill/skill-registry-types';

interface RegistryResponse {
    mcp?: RegistryMCPServer[];
    skills?: RegistrySkill[];
    plugins?: RegistryPlugin[];
}

/**
 * Upper bound on a single registry request. An unreachable network does not necessarily fail
 * fast - packets can be dropped silently (VPN, captive portal), in which case the request only
 * settles after the OS-level TCP timeout, minutes later. The Extensions view resolves its
 * entries through this service, so an unbounded request keeps whole sections unresolved.
 */
export const REGISTRY_FETCH_TIMEOUT = 10_000;

/**
 * How long a failed fetch is remembered before the next call attempts the network again. Without
 * it, every caller - one per Extensions view section, plus the auto-update check - re-attempts the
 * same doomed request on every change event.
 */
export const REGISTRY_FETCH_RETRY_DELAY = 30_000;

export const RegistryFetchService = Symbol('RegistryFetchService');
export interface RegistryFetchService {
    /** Fires whenever the cached set of resolved entries changes (initial load, manual refresh). */
    readonly onDidChange: Event<void>;
    /** Returns the resolved MCP registry entries, fetching (and caching) them on first use or when `forceRefresh` is set. */
    getEntries(forceRefresh?: boolean): Promise<ResolvedRegistryEntry[]>;
    /** Returns the resolved skill registry entries, fetching (and caching) them on first use or when `forceRefresh` is set. */
    getSkillEntries(forceRefresh?: boolean): Promise<ResolvedSkillEntry[]>;
    /** Returns the resolved Agent Plugin registry entries, fetching (and caching) them on first use or when `forceRefresh` is set. */
    getPluginEntries(forceRefresh?: boolean): Promise<ResolvedPluginEntry[]>;
}

@injectable()
export class RegistryFetchServiceImpl implements RegistryFetchService {

    // Use the backend request service rather than the generic (XHR-first) browser RequestService:
    // the AI registry host does not send CORS headers, so a direct browser XHR is always blocked
    // and logs an unsuppressable console error before falling back to the backend. Routing
    // straight through the backend avoids that noise, matching how VSXRegistryService fetches.
    @inject(BackendRequestService)
    protected readonly requestService: RequestService;

    @inject(AIRegistryConfiguration)
    protected readonly configuration: AIRegistryConfiguration;

    @inject(MCPRegistryEntryResolver)
    protected readonly resolver: MCPRegistryEntryResolver;

    @inject(SkillRegistryEntryResolver)
    protected readonly skillResolver: SkillRegistryEntryResolver;

    @inject(PluginRegistryEntryResolver)
    protected readonly pluginResolver: PluginRegistryEntryResolver;

    protected cachedResponse: RegistryResponse | undefined;
    protected cachedEntries: ResolvedRegistryEntry[] | undefined;
    protected cachedSkills: ResolvedSkillEntry[] | undefined;
    protected cachedPlugins: ResolvedPluginEntry[] | undefined;
    /** Shared while a request is in flight so concurrent callers issue a single request. */
    protected pendingResponse: Promise<RegistryResponse> | undefined;
    /** The last failure and when it happened, used to back off from a registry that is unreachable. */
    protected lastFailure: { error: unknown, timestamp: number } | undefined;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    /** Fires whenever the cached set of resolved entries changes (initial load, manual refresh). */
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    async getEntries(forceRefresh: boolean = false): Promise<ResolvedRegistryEntry[]> {
        const data = await this.fetchResponse(forceRefresh);
        if (!this.cachedEntries) {
            this.cachedEntries = (data.mcp ?? [])
                .map(server => this.resolver.resolve(server))
                .filter((entry): entry is ResolvedRegistryEntry => entry !== undefined);
        }
        return this.cachedEntries;
    }

    async getSkillEntries(forceRefresh: boolean = false): Promise<ResolvedSkillEntry[]> {
        const data = await this.fetchResponse(forceRefresh);
        if (!this.cachedSkills) {
            this.cachedSkills = (data.skills ?? [])
                .map(skill => this.skillResolver.resolve(skill))
                .filter((entry): entry is ResolvedSkillEntry => entry !== undefined);
        }
        return this.cachedSkills;
    }

    async getPluginEntries(forceRefresh: boolean = false): Promise<ResolvedPluginEntry[]> {
        const data = await this.fetchResponse(forceRefresh);
        if (!this.cachedPlugins) {
            this.cachedPlugins = (data.plugins ?? [])
                .map(plugin => this.pluginResolver.resolve(plugin))
                .filter((entry): entry is ResolvedPluginEntry => entry !== undefined);
        }
        return this.cachedPlugins;
    }

    /**
     * Fetches and caches the raw registry response. One HTTP request backs the MCP, skill and
     * plugin slices; the resolved slices are memoized separately and invalidated whenever the
     * raw response is (re-)fetched.
     */
    protected async fetchResponse(forceRefresh: boolean): Promise<RegistryResponse> {
        if (this.cachedResponse && !forceRefresh) {
            return this.cachedResponse;
        }
        if (forceRefresh) {
            // An explicit refresh is a deliberate decision to hit the network, so it ignores the
            // backoff window left behind by an earlier failure.
            this.lastFailure = undefined;
        } else if (this.lastFailure && this.now() - this.lastFailure.timestamp < this.retryDelay) {
            throw this.lastFailure.error;
        }
        if (!this.pendingResponse) {
            // A request that is already in flight is as fresh as a new one, so `forceRefresh` joins
            // it instead of opening a second connection.
            const pending = this.doFetchResponse();
            // Release the shared slot once it settles, either way, so the next call can retry. The
            // identity check keeps a settling request from clearing a newer one.
            const clear = () => {
                if (this.pendingResponse === pending) {
                    this.pendingResponse = undefined;
                }
            };
            pending.then(clear, clear);
            this.pendingResponse = pending;
        }
        return this.pendingResponse;
    }

    protected async doFetchResponse(): Promise<RegistryResponse> {
        const url = this.buildEndpointUrl();
        try {
            const context = await this.requestWithTimeout(url);
            if (!RequestContext.isSuccess(context)) {
                throw new Error(`Failed to fetch AI registry from ${url}: HTTP ${context.res.statusCode ?? 'unknown'}`);
            }
            const data = RequestContext.asJson<RegistryResponse>(context);
            this.lastFailure = undefined;
            this.cachedResponse = data;
            this.cachedEntries = undefined;
            this.cachedSkills = undefined;
            this.cachedPlugins = undefined;
            this.onDidChangeEmitter.fire();
            return data;
        } catch (error) {
            this.lastFailure = { error, timestamp: this.now() };
            throw error;
        }
    }

    /**
     * Issues the request under a hard deadline. The `timeout` option is passed on to the transport,
     * but the request travels through a JSON-RPC hop to the backend request service, so the deadline
     * is enforced here as well. A request abandoned this way settles later and is then ignored.
     */
    protected async requestWithTimeout(url: string): Promise<RequestContext> {
        const timeout = this.fetchTimeout;
        const pending = this.requestService.request({ url, timeout });
        // If the deadline wins the race, `pending` may still reject afterwards; keep that from
        // surfacing as an unhandled rejection.
        pending.catch(() => undefined);
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                pending,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`Timed out fetching the AI registry from ${url} after ${timeout}ms.`)), timeout);
                })
            ]);
        } finally {
            if (timer !== undefined) {
                clearTimeout(timer);
            }
        }
    }

    protected get fetchTimeout(): number {
        return REGISTRY_FETCH_TIMEOUT;
    }

    protected get retryDelay(): number {
        return REGISTRY_FETCH_RETRY_DELAY;
    }

    protected now(): number {
        return Date.now();
    }

    protected buildEndpointUrl(): string {
        const base = this.configuration.getBaseUrl();
        const tool = this.configuration.getToolName();
        const separator = base.endsWith('/') ? '' : '/';
        // The aggregate registry stays at `<base>/all.json`; tool-specific views moved under
        // `<base>/tools/<toolName>.json` (see eclipsefdn-ai-registry/ai-registry-core#32).
        const path = tool === 'all' ? 'all.json' : `tools/${tool}.json`;
        return `${base}${separator}${path}`;
    }
}
