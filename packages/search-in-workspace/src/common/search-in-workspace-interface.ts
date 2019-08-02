/********************************************************************************
 * Copyright (C) 2017-2018 Ericsson and others.
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

import { JsonRpcServer } from '@theia/core';

export interface SearchInWorkspaceOptions {
    /**
     * Maximum number of results to return.  Defaults to unlimited.
     */
    maxResults?: number;
    /**
     * Search case sensitively if true.
     */
    matchCase?: boolean;
    /**
     * Search whole words only if true.
     */
    matchWholeWord?: boolean;
    /**
     * Use regular expressions for search if true.
     */
    useRegExp?: boolean;
    /**
     * Include all .gitignored and hidden files.
     */
    includeIgnored?: boolean;
    /**
     * Glob pattern for matching files and directories to include the search.
     */
    include?: string[];
    /**
     * Glob pattern for matching files and directories to exclude the search.
     */
    exclude?: string[]
}

export interface SearchInWorkspaceResult {
    /**
     * The string uri to the root folder that the search was performed.
     */
    root: string;

    /**
     * The string uri to the file containing the result.
     */
    fileUri: string;

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
    export function compare(a: SearchInWorkspaceResult, b: SearchInWorkspaceResult): number {
        if (a.fileUri !== b.fileUri) {
            return a.fileUri < b.fileUri ? -1 : 1;
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

export const SearchInWorkspaceClient = Symbol('SearchInWorkspaceClient');
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

export const SearchInWorkspaceServer = Symbol('SearchInWorkspaceServer');
export interface SearchInWorkspaceServer extends JsonRpcServer<SearchInWorkspaceClient> {
    /**
     * Start a search for WHAT in directories ROOTURIS.  Return a unique search id.
     */
    search(what: string, rootUris: string[], opts?: SearchInWorkspaceOptions): Promise<number>;

    /**
     * Cancel an ongoing search.
     */
    cancel(searchId: number): Promise<void>;

    dispose(): void;
}
