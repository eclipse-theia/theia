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
import { RequestContext, RequestService } from '@theia/core/shared/@theia/request';
import { AIRegistryConfiguration } from './ai-registry-configuration';
import { MCPRegistryEntryResolver } from './mcp/mcp-registry-entry-resolver';
import { RegistryMCPServer, ResolvedRegistryEntry } from './mcp/mcp-registry-types';

interface RegistryResponse {
    mcp?: RegistryMCPServer[];
}

export const RegistryFetchService = Symbol('RegistryFetchService');
export interface RegistryFetchService {
    /** Fires whenever the cached set of resolved entries changes (initial load, manual refresh). */
    readonly onDidChange: Event<void>;
    /** Returns the resolved registry entries, fetching (and caching) them on first use or when `forceRefresh` is set. */
    getEntries(forceRefresh?: boolean): Promise<ResolvedRegistryEntry[]>;
}

@injectable()
export class RegistryFetchServiceImpl implements RegistryFetchService {

    @inject(RequestService)
    protected readonly requestService: RequestService;

    @inject(AIRegistryConfiguration)
    protected readonly configuration: AIRegistryConfiguration;

    @inject(MCPRegistryEntryResolver)
    protected readonly resolver: MCPRegistryEntryResolver;

    protected cached: ResolvedRegistryEntry[] | undefined;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    /** Fires whenever the cached set of resolved entries changes (initial load, manual refresh). */
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    async getEntries(forceRefresh: boolean = false): Promise<ResolvedRegistryEntry[]> {
        if (this.cached && !forceRefresh) {
            return this.cached;
        }
        const url = this.buildEndpointUrl();
        const context = await this.requestService.request({ url });
        if (!RequestContext.isSuccess(context)) {
            throw new Error(`Failed to fetch AI registry from ${url}: HTTP ${context.res.statusCode ?? 'unknown'}`);
        }
        const data = RequestContext.asJson<RegistryResponse>(context);
        const entries = (data.mcp ?? [])
            .map(server => this.resolver.resolve(server))
            .filter((entry): entry is ResolvedRegistryEntry => entry !== undefined);
        this.cached = entries;
        this.onDidChangeEmitter.fire();
        return entries;
    }

    protected buildEndpointUrl(): string {
        const base = this.configuration.getBaseUrl();
        const tool = this.configuration.getToolName();
        const separator = base.endsWith('/') ? '' : '/';
        return `${base}${separator}${tool}.json`;
    }
}
