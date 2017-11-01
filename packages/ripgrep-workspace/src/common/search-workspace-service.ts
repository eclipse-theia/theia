/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from "@theia/core/lib/common/uri";
import { IParsedEntry } from "../../../output-parser/lib/node/output-parser";

export const searchPath = '/services/search';

/**
 * The JSON-RPC file search service interface.
 */
export interface ISearchWorkSpaceService {

    /**
     * finds files by a given search pattern
     */
    //     find(uri: string, searchPattern: string, options?: FileSearchService.Options): Promise<string[]>;
    query(regExp: string, searchPath: URI): Promise<IParsedEntry[]>;

}

export interface ISearchWorkSpaceClient {
}

export const ISearchWorkSpaceService = Symbol('ISearchWorkSpaceService');
export namespace FileSearchService {
    export interface Options {
        fuzzyMatch?: boolean
        limit?: number
        useGitignore?: boolean
        defaultIgnorePatterns?: string[]
    }
}