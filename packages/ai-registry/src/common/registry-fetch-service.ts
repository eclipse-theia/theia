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
import { SkillRegistryEntryResolver } from './skill/skill-registry-entry-resolver';
import { RegistrySkill, ResolvedSkillEntry } from './skill/skill-registry-types';

interface RegistryResponse {
    mcp?: RegistryMCPServer[];
    skills?: RegistrySkill[];
}

export const RegistryFetchService = Symbol('RegistryFetchService');
export interface RegistryFetchService {
    /** Fires whenever the cached set of resolved entries changes (initial load, manual refresh). */
    readonly onDidChange: Event<void>;
    /** Returns the resolved MCP registry entries, fetching (and caching) them on first use or when `forceRefresh` is set. */
    getEntries(forceRefresh?: boolean): Promise<ResolvedRegistryEntry[]>;
    /** Returns the resolved skill registry entries, fetching (and caching) them on first use or when `forceRefresh` is set. */
    getSkillEntries(forceRefresh?: boolean): Promise<ResolvedSkillEntry[]>;
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

    protected cachedResponse: RegistryResponse | undefined;
    protected cachedEntries: ResolvedRegistryEntry[] | undefined;
    protected cachedSkills: ResolvedSkillEntry[] | undefined;

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

    /**
     * Fetches and caches the raw registry response. One HTTP request backs both the MCP
     * and skill slices; the resolved slices are memoized separately and invalidated
     * whenever the raw response is (re-)fetched.
     */
    protected async fetchResponse(forceRefresh: boolean): Promise<RegistryResponse> {
        if (this.cachedResponse && !forceRefresh) {
            return this.cachedResponse;
        }
        const url = this.buildEndpointUrl();
        const context = await this.requestService.request({ url });
        if (!RequestContext.isSuccess(context)) {
            throw new Error(`Failed to fetch AI registry from ${url}: HTTP ${context.res.statusCode ?? 'unknown'}`);
        }
        const data = RequestContext.asJson<RegistryResponse>(context);
        this.cachedResponse = data;
        this.cachedEntries = undefined;
        this.cachedSkills = undefined;
        this.onDidChangeEmitter.fire();
        return data;
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
