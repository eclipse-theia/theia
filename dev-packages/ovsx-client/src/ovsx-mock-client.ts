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

import { ExtensionLike, OVSXClient, VSXExtensionRaw, VSXQueryOptions, VSXQueryResult, VSXSearchOptions, VSXSearchResult } from './ovsx-types';

/**
 * Querying will only find exact matches.
 * Searching will try to find the query string in various fields.
 */
export class OVSXMockClient implements OVSXClient {

    constructor(
        public extensions: VSXExtensionRaw[] = []
    ) { }

    setExtensions(extensions: VSXExtensionRaw[]): this {
        this.extensions = extensions;
        return this;
    }

    /**
     * @param baseUrl required to construct the URLs required by {@link VSXExtensionRaw}.
     * @param ids list of ids to generate {@link VSXExtensionRaw} from.
     */
    setExtensionsFromIds(baseUrl: string, ids: string[]): this {
        const now = Date.now();
        const url = new OVSXMockClient.UrlBuilder(baseUrl);
        this.extensions = ids.map((extension, i) => {
            const [id, version = '0.0.1'] = extension.split('@', 2);
            const [namespace, name] = id.split('.', 2);
            return {
                allVersions: {
                    [version]: url.extensionUrl(namespace, name, `/${version}`)
                },
                displayName: name,
                downloadCount: 0,
                files: {
                    download: url.extensionFileUrl(namespace, name, version, `/${id}-${version}.vsix`)
                },
                name,
                namespace,
                namespaceAccess: 'public',
                namespaceUrl: url.namespaceUrl(namespace),
                publishedBy: {
                    loginName: 'mock'
                },
                reviewCount: 0,
                reviewsUrl: url.extensionReviewsUrl(namespace, name),
                timestamp: new Date(now - ids.length + i + 1).toISOString(),
                version,
                description: `Mock VS Code Extension for ${id}`,
                namespaceDisplayName: name,
                preRelease: false
            };
        });
        return this;
    }

    async query(queryOptions?: VSXQueryOptions): Promise<VSXQueryResult> {
        const extensions = this.extensions
            .filter(extension => typeof queryOptions === 'object' && (
                this.compare(queryOptions.extensionId, this.id(extension)) &&
                this.compare(queryOptions.extensionName, extension.name) &&
                this.compare(queryOptions.extensionVersion, extension.version) &&
                this.compare(queryOptions.namespaceName, extension.namespace)
            ));
        return {
            offset: 0,
            totalSize: extensions.length,
            extensions
        };
    }

    async search(searchOptions?: VSXSearchOptions): Promise<VSXSearchResult> {
        const query = searchOptions?.query;
        const offset = searchOptions?.offset ?? 0;
        const size = searchOptions?.size ?? 18;
        const end = offset + size;
        return {
            offset,
            extensions: this.extensions
                .filter(extension => typeof query !== 'string' || (
                    this.includes(query, this.id(extension)) ||
                    this.includes(query, extension.description) ||
                    this.includes(query, extension.displayName)
                ))
                .sort((a, b) => this.sort(a, b, searchOptions))
                .filter((extension, i) => i >= offset && i < end)
                .map(extension => ({
                    downloadCount: extension.downloadCount,
                    files: extension.files,
                    name: extension.name,
                    namespace: extension.namespace,
                    timestamp: extension.timestamp,
                    url: `${extension.namespaceUrl}/${extension.name}`,
                    version: extension.version,
                }))
        };
    }

    protected id(extension: ExtensionLike): string {
        return `${extension.namespace}.${extension.name}`;
    }

    /**
     * Case sensitive.
     */
    protected compare(expected?: string, value?: string): boolean {
        return expected === undefined || value === undefined || expected === value;
    }

    /**
     * Case insensitive.
     */
    protected includes(needle: string, value?: string): boolean {
        return value === undefined || value.toLowerCase().includes(needle.toLowerCase());
    }

    protected sort(a: VSXExtensionRaw, b: VSXExtensionRaw, searchOptions?: VSXSearchOptions): number {
        let order: number = 0;
        const sortBy = searchOptions?.sortBy ?? 'relevance';
        const sortOrder = searchOptions?.sortOrder ?? 'desc';
        if (sortBy === 'averageRating') {
            order = (a.averageRating ?? -1) - (b.averageRating ?? -1);
        } else if (sortBy === 'downloadCount') {
            order = a.downloadCount - b.downloadCount;
        } else if (sortBy === 'relevance') {
            order = 0;
        } else if (sortBy === 'timestamp') {
            order = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        }
        if (sortOrder === 'asc') {
            order *= -1;
        }
        return order;
    }
}
export namespace OVSXMockClient {

    /**
     * URLs should respect the official OpenVSX API:
     * https://open-vsx.org/swagger-ui/index.html
     */
    export class UrlBuilder {

        constructor(
            protected baseUrl: string
        ) { }

        url(path: string): string {
            return this.baseUrl + path;
        }

        apiUrl(path: string): string {
            return this.url(`/api${path}`);
        }

        namespaceUrl(namespace: string, path = ''): string {
            return this.apiUrl(`/${namespace}${path}`);
        }

        extensionUrl(namespace: string, name: string, path = ''): string {
            return this.apiUrl(`/${namespace}/${name}${path}`);
        }

        extensionReviewsUrl(namespace: string, name: string): string {
            return this.apiUrl(`/${namespace}/${name}/reviews`);
        }

        extensionFileUrl(namespace: string, name: string, version: string, path = ''): string {
            return this.apiUrl(`/${namespace}/${name}/${version}/file${path}`);
        }
    }
}
