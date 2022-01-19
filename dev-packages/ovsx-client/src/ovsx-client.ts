// *****************************************************************************
// Copyright (C) 2021 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as semver from 'semver';
import {
    VSXAllVersions,
    VSXBuiltinNamespaces,
    VSXExtensionRaw,
    VSXQueryParam,
    VSXQueryResult,
    VSXSearchEntry,
    VSXSearchParam,
    VSXSearchResult
} from './ovsx-types';
import { RequestContext, RequestService } from '@theia/request-service';

export interface OVSXClientOptions {
    apiVersion: string
    apiUrl: string
}

export class OVSXClient {

    constructor(readonly options: OVSXClientOptions, readonly request: RequestService) { }

    async search(param?: VSXSearchParam): Promise<VSXSearchResult> {
        const searchUri = await this.buildSearchUri(param);
        try {
            return await this.fetchJson<VSXSearchResult>(searchUri);
        } catch (err) {
            return {
                error: err?.message || String(err),
                offset: 0,
                extensions: []
            };
        }
    }

    protected async buildSearchUri(param?: VSXSearchParam): Promise<string> {
        return this.buildUri('api/-/search', param);
    }

    protected buildQueryUri(param?: VSXQueryParam): string {
        return this.buildUri('api/-/query', param);
    }

    protected buildUri(url: string, param?: Object): string {
        let searchUri = '';
        if (param) {
            const query: string[] = [];
            for (const [key, value] of Object.entries(param)) {
                if (typeof value === 'string') {
                    query.push(`${key}=${encodeURIComponent(value)}`);
                } else if (typeof value === 'boolean' || typeof value === 'number') {
                    query.push(`${key}=${String(value)}`);
                }
            }
            if (query.length > 0) {
                searchUri += '?' + query.join('&');
            }
        }
        return new URL(`${url}${searchUri}`, this.options!.apiUrl).toString();
    }

    async getExtension(id: string): Promise<VSXExtensionRaw> {
        const param: VSXQueryParam = {
            extensionId: id
        };
        const apiUri = this.buildQueryUri(param);
        const result = await this.fetchJson<VSXQueryResult>(apiUri);
        if (result.extensions && result.extensions.length > 0) {
            return result.extensions[0];
        }
        throw new Error(`Extension with id ${id} not found at ${apiUri}`);
    }

    /**
     * Get all versions of the given extension.
     * @param id the requested extension id.
     */
    async getAllVersions(id: string): Promise<VSXExtensionRaw[]> {
        const param: VSXQueryParam = {
            extensionId: id,
            includeAllVersions: true,
        };
        const apiUri = this.buildQueryUri(param);
        const result = await this.fetchJson<VSXQueryResult>(apiUri);
        if (result.extensions && result.extensions.length > 0) {
            return result.extensions;
        }
        throw new Error(`Extension with id ${id} not found at ${apiUri}`);
    }

    protected async fetchJson<R>(url: string): Promise<R> {
        const e = await this.request.request({
            url,
            headers: { 'Accept': 'application/json' }
        });
        return RequestContext.asJson<R>(e);
    }

    async fetchText(url: string): Promise<string> {
        const e = await this.request.request({
            url
        });
        return RequestContext.asText(e);
    }

    /**
     * Get the latest compatible extension version.
     * - a builtin extension is fetched based on the extension version which matches the API.
     * - an extension satisfies compatibility if its `engines.vscode` version is supported.
     * @param id the extension id.
     *
     * @returns the data for the latest compatible extension version if available, else `undefined`.
     */
    async getLatestCompatibleExtensionVersion(id: string): Promise<VSXExtensionRaw | undefined> {
        const extensions = await this.getAllVersions(id);
        if (extensions.length === 0) {
            return undefined;
        }

        const namespace = extensions[0].namespace.toLowerCase();
        if (this.isBuiltinNamespace(namespace)) {
            const apiVersion = this.options!.apiVersion;
            for (const extension of extensions) {
                if (this.isVersionLTE(extension.version, apiVersion)) {
                    return extension;
                }
            }
            console.log(`Skipping: built-in extension "${id}" at version "${apiVersion}" does not exist.`);
        } else {
            for (const extension of extensions) {
                if (this.isEngineSupported(extension.engines?.vscode)) {
                    return extension;
                }
            }
        }
    }

    /**
     * Get the latest compatible version of an extension.
     * @param entry the extension search entry.
     *
     * @returns the latest compatible version of an extension if it exists, else `undefined`.
     */
    getLatestCompatibleVersion(entry: VSXSearchEntry): VSXAllVersions | undefined {
        const extensions = entry.allVersions;
        if (this.isBuiltinNamespace(entry.namespace)) {
            const apiVersion = this.options!.apiVersion;
            for (const extension of extensions) {
                if (this.isVersionLTE(extension.version, apiVersion)) {
                    return extension;
                }
            }
        } else {
            for (const extension of extensions) {
                if (this.isEngineSupported(extension.engines?.vscode)) {
                    return extension;
                }
            }
        }
    }

    /**
     * Determine if the engine is supported by the application.
     * @param engine the engine.
     *
     * @returns `true` if the engine satisfies the API version.
     */
    protected isEngineSupported(engine?: string): boolean {
        if (!engine) {
            return false;
        }

        // Determine engine compatibility.
        if (engine === '*') {
            return true;
        } else {
            return semver.satisfies(this.options!.apiVersion, engine);
        }
    }

    /**
     * Determines if the extension namespace is a builtin maintained by the framework.
     * @param namespace the extension namespace to verify.
     */
    protected isBuiltinNamespace(namespace: string): boolean {
        return namespace === VSXBuiltinNamespaces.VSCODE
            || namespace === VSXBuiltinNamespaces.THEIA;
    }

    /**
     * Determines if the first version is less than or equal the second version.
     * - v1 <= v2.
     * @param a the first semver version.
     * @param b the second semver version.
     */
    protected isVersionLTE(a: string, b: string): boolean {
        const versionA = semver.clean(a);
        const versionB = semver.clean(b);
        if (!versionA || !versionB) {
            return false;
        }
        return semver.lte(versionA, versionB);
    }

}
