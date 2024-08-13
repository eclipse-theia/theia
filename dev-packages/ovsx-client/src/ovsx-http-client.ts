// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { OVSXClient, VSXQueryOptions, VSXQueryResult, VSXSearchOptions, VSXSearchResult } from './ovsx-types';
import { RequestContext, RequestService } from '@theia/request';
import { RateLimiter } from 'limiter';

export const OVSX_RATE_LIMIT = 15;

export class OVSXHttpClient implements OVSXClient {

    /**
     * @param requestService
     * @returns factory that will cache clients based on the requested input URL.
     */
    static createClientFactory(requestService: RequestService, rateLimiter?: RateLimiter): (url: string) => OVSXClient {
        // eslint-disable-next-line no-null/no-null
        const cachedClients: Record<string, OVSXClient> = Object.create(null);
        return url => cachedClients[url] ??= new this(url, requestService, rateLimiter);
    }

    constructor(
        protected vsxRegistryUrl: string,
        protected requestService: RequestService,
        protected rateLimiter = new RateLimiter({ tokensPerInterval: OVSX_RATE_LIMIT, interval: 'second' })
    ) { }

    search(searchOptions?: VSXSearchOptions): Promise<VSXSearchResult> {
        return this.requestJson(this.buildUrl('api/-/search', searchOptions));
    }

    query(queryOptions?: VSXQueryOptions): Promise<VSXQueryResult> {
        return this.requestJson(this.buildUrl('api/v2/-/query', queryOptions));
    }

    protected async requestJson<R>(url: string): Promise<R> {
        const attempts = 5;
        for (let i = 0; i < attempts; i++) {
            // Use 1, 2, 4, 8, 16 tokens for each attempt
            const tokenCount = Math.pow(2, i);
            await this.rateLimiter.removeTokens(tokenCount);
            const context = await this.requestService.request({
                url,
                headers: { 'Accept': 'application/json' }
            });
            if (context.res.statusCode === 429) {
                console.warn('OVSX rate limit exceeded. Consider reducing the rate limit.');
                // If there are still more attempts left, retry the request with a higher token count
                if (i < attempts - 1) {
                    continue;
                }
            }
            return RequestContext.asJson<R>(context);
        }
        throw new Error('Failed to fetch data from OVSX.');
    }

    protected buildUrl(url: string, query?: object): string {
        return new URL(`${url}${this.buildQueryString(query)}`, this.vsxRegistryUrl).toString();
    }

    protected buildQueryString(searchQuery?: object): string {
        if (!searchQuery) {
            return '';
        }
        let queryString = '';
        for (const [key, value] of Object.entries(searchQuery)) {
            if (typeof value === 'string') {
                queryString += `&${key}=${encodeURIComponent(value)}`;
            } else if (typeof value === 'boolean' || typeof value === 'number') {
                queryString += `&${key}=${value}`;
            }
        }
        return queryString && '?' + queryString.slice(1);
    }
}
