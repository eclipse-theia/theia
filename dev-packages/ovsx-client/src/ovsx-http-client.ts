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

export class OVSXHttpClient implements OVSXClient {

    /**
     * @param requestService
     * @returns factory that will cache clients based on the requested input URL.
     */
    static createClientFactory(requestService: RequestService): (url: string) => OVSXClient {
        // eslint-disable-next-line no-null/no-null
        const cachedClients: Record<string, OVSXClient> = Object.create(null);
        return url => cachedClients[url] ??= new this(url, requestService);
    }

    constructor(
        protected vsxRegistryUrl: string,
        protected requestService: RequestService
    ) { }

    async search(searchOptions?: VSXSearchOptions): Promise<VSXSearchResult> {
        try {
            return await this.requestJson(this.buildUrl('api/-/search', searchOptions));
        } catch (err) {
            return {
                error: err?.message || String(err),
                offset: -1,
                extensions: []
            };
        }
    }

    async query(queryOptions?: VSXQueryOptions): Promise<VSXQueryResult> {
        try {
            return await this.requestJson(this.buildUrl('api/-/query', queryOptions));
        } catch (error) {
            console.warn(error);
            return {
                extensions: []
            };
        }
    }

    protected async requestJson<R>(url: string): Promise<R> {
        return RequestContext.asJson<R>(await this.requestService.request({
            url,
            headers: { 'Accept': 'application/json' }
        }));
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
