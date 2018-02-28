/*
 * Copyright (C) 2017-2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { JsonRpcServer } from "@theia/core";

export interface SearchInWorkspaceOptions {
    /**
     * Maximum number of results to return.  Defaults to unlimited.
     */
    maxResults?: number;
}

export interface SearchInWorkspaceResult {
    /**
     * The path to the file containing the result.
     */
    file: string;

    /**
     * The (1-based) line number of the result.
     */
    line: number;

    /**
     * The (1-based) character number in the result line.  For UTF-8 files,
     * one multi-byte character counts as one character.
     */
    character: number;

    /**
     * The length of the match, in characters.  For UTF-8 files, one
     * multi-byte character counts as one character.
     */
    length: number;

    /**
     * The text of the line containing the result.
     */
    lineText: string;
}

export namespace SearchInWorkspaceResult {
    /**
     * Sort search in workspace results according to file, line, character position
     * and then length.
     */
    export function compare(a: SearchInWorkspaceResult, b: SearchInWorkspaceResult) {
        if (a.file !== b.file) {
            return a.file < b.file ? -1 : 1;
        }

        if (a.line !== b.line) {
            return a.line - b.line;
        }

        if (a.character !== b.character) {
            return a.character - b.character;
        }

        return a.length - b.length;
    }
}

export const SearchInWorkspaceClient = Symbol("SearchInWorkspaceClient");
export interface SearchInWorkspaceClient {
    /**
     * Called by the server for every search match.
     */
    onResult(searchId: number, result: SearchInWorkspaceResult): void;

    /**
     * Called when no more search matches will come.
     */
    onDone(searchId: number, error?: string): void;
}

export const SearchInWorkspaceServer = Symbol("SearchInWorkspaceServer");
export interface SearchInWorkspaceServer extends JsonRpcServer<SearchInWorkspaceClient> {
    /**
     * Start a search for WHAT in directory ROOT.  Return a unique search id.
     */
    search(what: string, root: string, opts?: SearchInWorkspaceOptions): Promise<number>;

    /**
     * Cancel an ongoing search.
     */
    cancel(searchId: number): Promise<void>;

    dispose(): void;
}
