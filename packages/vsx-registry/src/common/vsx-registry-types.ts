/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/**
 * Should be aligned with https://github.com/eclipse/openvsx/blob/793d0691258a6029e5ebb8cc8783b366b67d16ca/server/src/main/java/org/eclipse/openvsx/RegistryAPI.java#L192-L196
 */
export interface VSXSearchParam {
    query?: string;
    category?: string;
    size?: number;
    offset?: number;
}

/**
 * Should be aligned with https://github.com/eclipse/openvsx/blob/e8f64fe145fc05d2de1469735d50a7a90e400bc4/server/src/main/java/org/eclipse/openvsx/json/SearchResultJson.java
 */
export interface VSXSearchResult {
    readonly error?: string;
    readonly offset: number;
    readonly extensions: VSXSearchEntry[];
}

/**
 * Should be aligned with https://github.com/eclipse/openvsx/blob/master/server/src/main/java/org/eclipse/openvsx/json/SearchEntryJson.java
 */
export interface VSXSearchEntry {
    readonly url: string;
    readonly files: {
        download: string
        readme?: string
        license?: string
        icon?: string
    }
    readonly name: string;
    readonly namespace: string;
    readonly version: string;
    readonly timestamp: string;
    readonly averageRating?: number;
    readonly downloadCount: number;
    readonly displayName?: string;
    readonly description?: string;
}

export type VSXExtensionNamespaceAccess = 'public' | 'restricted';

/**
 * Should be aligned with https://github.com/eclipse/openvsx/blob/master/server/src/main/java/org/eclipse/openvsx/json/UserJson.java
 */
export interface VSXUser {
    loginName: string
    homepage?: string
}

/**
 * Should be aligned with https://github.com/eclipse/openvsx/blob/master/server/src/main/java/org/eclipse/openvsx/json/ExtensionJson.java
 */
export interface VSXExtensionRaw {
    readonly error?: string;
    readonly namespaceUrl: string;
    readonly reviewsUrl: string;
    readonly name: string;
    readonly namespace: string;
    readonly publishedBy: VSXUser
    readonly namespaceAccess: VSXExtensionNamespaceAccess;
    readonly files: {
        download: string
        readme?: string
        license?: string
        icon?: string
    }
    readonly allVersions: {
        [version: string]: string
    }
    readonly averageRating?: number;
    readonly downloadCount: number;
    readonly reviewCount: number;
    readonly version: string;
    readonly timestamp: string;
    readonly preview?: boolean;
    readonly displayName?: string;
    readonly description?: string;
    readonly categories?: string[];
    readonly tags?: string[];
    readonly license?: string;
    readonly homepage?: string;
    readonly repository?: string;
    readonly bugs?: string;
    readonly markdown?: string;
    readonly galleryColor?: string;
    readonly galleryTheme?: string;
    readonly qna?: string;
}
