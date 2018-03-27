/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { CancellationToken } from "@theia/core";

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
        rootUri: string,
        fuzzyMatch?: boolean
        limit?: number
        useGitIgnore?: boolean
        defaultIgnorePatterns?: string[]
    }
}
