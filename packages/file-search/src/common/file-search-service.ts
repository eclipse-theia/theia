/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { CancellationToken } from '@theia/core';

export const fileSearchServicePath = '/services/search';

/**
 * The JSON-RPC file search service interface.
 */
export interface FileSearchService {

    /**
     * finds files by a given search pattern.
     * @return the matching paths, relative to the given `options.rootUri`.
     */
    find(searchPattern: string, options: FileSearchService.Options, cancellationToken?: CancellationToken): Promise<string[]>;

}

export const FileSearchService = Symbol('FileSearchService');
export namespace FileSearchService {
    export interface Options {
        rootUris: string[]
        fuzzyMatch?: boolean
        limit?: number
        useGitIgnore?: boolean
        /** when `undefined`, no excludes will apply, when empty array, default excludes will apply */
        defaultIgnorePatterns?: string[]
        includePatterns?: string[]
    }
}
