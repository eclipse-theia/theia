// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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

import { MaybePromise } from './types';

export interface ExtensionLike {
    name: string;
    namespace: string;
    version?: string;
}
export namespace ExtensionLike {
    export function id<T extends ExtensionLike>(extension: T): `${string}.${string}` {
        return `${extension.namespace}.${extension.name}`;
    }
    export function idWithVersion<T extends ExtensionLike>(extension: T): `${string}.${string}@${string}` {
        if (!extension.version) {
            throw new Error(`no valid "version" value provided for "${id(extension)}"`);
        }
        return `${id(extension)}@${extension.version}`;
    }
    // eslint-disable-next-line @typescript-eslint/no-shadow
    export function fromId(id: string): ExtensionLike {
        const [left, version] = id.split('@', 2);
        const [namespace, name] = left.split('.', 2);
        return {
            name,
            namespace,
            version
        };
    }
}

export interface OVSXClient {
    /**
     * GET https://openvsx.org/api/-/search
     */
    search(searchOptions?: VSXSearchOptions): Promise<VSXSearchResult>;
    /**
     * GET https://openvsx.org/api/v2/-/query
     *
     * Fetch one or all versions of an extension.
     */
    query(queryOptions?: VSXQueryOptions): Promise<VSXQueryResult>;
}

/** @deprecated since 1.31.0 use {@link VSXSearchOptions} instead */
export type VSXSearchParam = VSXSearchOptions;
/**
 * The possible options when performing a search.
 *
 * For available options, and default values consult the `swagger`: https://open-vsx.org/swagger-ui/index.html.
 *
 * Should be aligned with https://github.com/eclipse/openvsx/blob/b5694a712e07d266801394916bac30609e16d77b/server/src/main/java/org/eclipse/openvsx/RegistryAPI.java#L246-L266
 */
export interface VSXSearchOptions {
    /**
     * The query text for searching.
     */
    query?: string;
    /**
     * The extension category.
     */
    category?: string;
    /**
     * The maximum number of entries to return.
     */
    size?: number;
    /**
     * The number of entries to skip (usually a multiple of the page size).
     */
    offset?: number;
    /**
     * The sort order.
     */
    sortOrder?: 'asc' | 'desc';
    /**
     * The sort key.
     */
    sortBy?: 'averageRating' | 'downloadCount' | 'relevance' | 'timestamp';
    /**
     * By default an OpenVSX registry will return the last known version of
     * extensions. Setting this field to `true` will have the registry specify
     * the {@link VSXExtensionRaw.allVersions} field which references all known
     * versions for each returned extension.
     *
     * @default false
     */
    includeAllVersions?: boolean;
}

/**
 * Should be aligned with https://github.com/eclipse/openvsx/blob/e8f64fe145fc05d2de1469735d50a7a90e400bc4/server/src/main/java/org/eclipse/openvsx/json/SearchResultJson.java
 */
export interface VSXSearchResult {
    offset: number;
    extensions: VSXSearchEntry[];
}

/**
 * The possible options when performing a search.
 *
 * For available options, and default values consult the `swagger`: https://open-vsx.org/swagger-ui/index.html.
 *
 * Should be aligned with https://github.com/eclipse/openvsx/blob/b5694a712e07d266801394916bac30609e16d77b/server/src/main/java/org/eclipse/openvsx/json/QueryParamJson.java#L18-L46
 */
export interface VSXQueryOptions {
    namespaceName?: string;
    extensionName?: string;
    extensionVersion?: string;
    extensionId?: string;
    extensionUuid?: string;
    namespaceUuid?: string;
    includeAllVersions?: boolean | 'links';
    targetPlatform?: VSXTargetPlatform;
    size?: number;
    offset?: number;
}

export type VSXTargetPlatform =
    'universal' | 'web' |
    'win32-x64' | 'win32-ia32' | 'win32-arm64' |
    'darwin-x64' | 'darwin-arm64' |
    'linux-x64' | 'linux-arm64' | 'linux-armhf' |
    'alpine-x64' | 'alpine-arm64' | (string & {});

export interface VSXQueryResult {
    success?: string;
    warning?: string;
    error?: string;
    offset: number;
    totalSize: number;
    extensions: VSXExtensionRaw[];
}

/**
 * This type describes the data as found in {@link VSXSearchEntry.allVersions}.
 *
 * Note that this type only represents one version of a given plugin, despite the name.
 */
export interface VSXAllVersions {
    url: string;
    version: string;
    engines?: {
        [version: string]: string;
    };
}

/**
 * Should be aligned with https://github.com/eclipse/openvsx/blob/master/server/src/main/java/org/eclipse/openvsx/json/SearchEntryJson.java
 */
export interface VSXSearchEntry {
    url: string;
    files: {
        download: string;
        manifest?: string;
        readme?: string;
        license?: string;
        icon?: string;
    };
    name: string;
    namespace: string;
    version: string;
    timestamp: string;
    averageRating?: number;
    downloadCount: number;
    displayName?: string;
    description?: string;
    /**
     * May be undefined when {@link VSXSearchOptions.includeAllVersions} is
     * `false` or `undefined`.
     */
    allVersions?: VSXAllVersions[];
}

export type VSXExtensionNamespaceAccess = 'public' | 'restricted';

/**
 * Should be aligned with https://github.com/eclipse/openvsx/blob/master/server/src/main/java/org/eclipse/openvsx/json/UserJson.java
 */
export interface VSXUser {
    loginName: string;
    homepage?: string;
}

export interface VSXExtensionRawFiles {
    download: string;
    readme?: string;
    license?: string;
    icon?: string;
}

/**
 * Should be aligned with https://github.com/eclipse/openvsx/blob/master/server/src/main/java/org/eclipse/openvsx/json/ExtensionJson.java
 */
export interface VSXExtensionRaw {
    error?: string;
    namespaceUrl: string;
    reviewsUrl: string;
    name: string;
    namespace: string;
    targetPlatform?: VSXTargetPlatform;
    publishedBy: VSXUser;
    preRelease: boolean;
    namespaceAccess: VSXExtensionNamespaceAccess;
    files: VSXExtensionRawFiles;
    allVersions: {
        [version: string]: string;
    };
    allVersionsUrl?: string;
    averageRating?: number;
    downloadCount: number;
    reviewCount: number;
    version: string;
    timestamp: string;
    preview?: boolean;
    verified?: boolean;
    displayName?: string;
    namespaceDisplayName: string;
    description?: string;
    categories?: string[];
    extensionKind?: string[];
    tags?: string[];
    license?: string;
    homepage?: string;
    repository?: string;
    sponsorLink?: string;
    bugs?: string;
    markdown?: string;
    galleryColor?: string;
    galleryTheme?: string;
    localizedLanguages?: string[];
    qna?: string;
    badges?: VSXBadge[];
    dependencies?: VSXExtensionReference[];
    bundledExtensions?: VSXExtensionReference[];
    allTargetPlatformVersions?: VSXTargetPlatforms[];
    url?: string;
    engines?: {
        [engine: string]: string;
    };
}

export interface VSXBadge {
    url?: string;
    href?: string;
    description?: string;
}

export interface VSXExtensionReference {
    url: string;
    namespace: string;
    extension: string;
}

export interface VSXTargetPlatforms {
    version: string;
    targetPlatforms: VSXTargetPlatform[];
}

export interface VSXResponseError extends Error {
    statusCode: number;
}

export namespace VSXResponseError {
    export function is(error: unknown): error is VSXResponseError {
        return !!error && typeof error === 'object' && typeof (error as VSXResponseError).statusCode === 'number';
    }
}

/**
 * Builtin namespaces maintained by the framework.
 */
export namespace VSXBuiltinNamespaces {

    /**
     * Namespace for individual vscode builtin extensions.
     */
    export const VSCODE = 'vscode';

    /**
     * Namespace for vscode builtin extension packs.
     * - corresponds to: https://github.com/eclipse-theia/vscode-builtin-extensions/blob/af9cfeb2ea23e1668a8340c1c2fb5afd56be07d7/src/create-extension-pack.js#L45
     */
    export const THEIA = 'eclipse-theia';

    /**
     * Determines if the extension namespace is a builtin maintained by the framework.
     * @param namespace the extension namespace to verify.
     */
    export function is(namespace: string): boolean {
        return namespace === VSCODE
            || namespace === THEIA;
    }
}

export type OVSXClientProvider = (uri: string) => MaybePromise<OVSXClient>;
