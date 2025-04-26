// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { MutableChatRequestModel } from '@theia/ai-chat';
import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { CancellationToken } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { SearchInWorkspaceService, SearchInWorkspaceCallbacks } from '@theia/search-in-workspace/lib/browser/search-in-workspace-service';
import { SearchInWorkspaceResult, SearchInWorkspaceOptions } from '@theia/search-in-workspace/lib/common/search-in-workspace-interface';
import { SEARCH_IN_WORKSPACE_FUNCTION_ID } from '../common/workspace-functions';

@injectable()
export class WorkspaceSearchProvider implements ToolProvider {

    @inject(SearchInWorkspaceService)
    protected readonly searchService: SearchInWorkspaceService;

    private readonly MAX_RESULTS = 50;

    getTool(): ToolRequest {
        return {
            id: SEARCH_IN_WORKSPACE_FUNCTION_ID,
            name: SEARCH_IN_WORKSPACE_FUNCTION_ID,
            description: 'Searches the content of files within the workspace for lines matching the given search term (`query`). \
            The search uses case-insensitive string matching or regular expressions (controlled by the `useRegExp` parameter). \
            It returns a list of matching files, including the file path (URI), the line number, and the full text content of each matching line. \
            Multi-word patterns must match exactly (including spaces, case-insensitively). \
            For complex searches, prefer multiple simpler queries over one complex query or regular expression.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search term or regular expression pattern.',
                    },
                    useRegExp: {
                        type: 'boolean',
                        description: 'Set to true if the query is a regular expression.',
                    }
                },
                required: ['query', 'useRegExp']
            },
            handler: (argString, ctx: MutableChatRequestModel) => this.handleSearch(argString, ctx?.response?.cancellationToken)
        };
    }

    private async handleSearch(argString: string, cancellationToken?: CancellationToken): Promise<string> {
        try {
            const args: { query: string, useRegExp: boolean } = JSON.parse(argString);
            const results: SearchInWorkspaceResult[] = [];
            let expectedSearchId: number | undefined;
            let searchCompleted = false;

            const searchPromise = new Promise<SearchInWorkspaceResult[]>((resolve, reject) => {
                const callbacks: SearchInWorkspaceCallbacks = {
                    onResult: (id, result) => {
                        if (expectedSearchId !== undefined && id !== expectedSearchId) {
                            return;
                        }

                        if (searchCompleted) {
                            return;
                        }

                        results.push(result);
                    },
                    onDone: (id, error) => {
                        if (expectedSearchId !== undefined && id !== expectedSearchId) {
                            return;
                        }

                        if (searchCompleted) {
                            return;
                        }

                        searchCompleted = true;
                        if (error) {
                            reject(new Error(`Search failed: ${error}`));
                        } else {
                            resolve(results);
                        }
                    }
                };

                const options: SearchInWorkspaceOptions = {
                    useRegExp: args.useRegExp,
                    matchCase: false,
                    matchWholeWord: false,
                    maxResults: this.MAX_RESULTS,
                };

                this.searchService.search(args.query, callbacks, options)
                    .then(id => {
                        expectedSearchId = id;
                        cancellationToken?.onCancellationRequested(() => {
                            this.searchService.cancel(id);
                        });
                    })
                    .catch(err => {
                        searchCompleted = true;
                        reject(err);
                    });

            });

            const timeoutPromise = new Promise<SearchInWorkspaceResult[]>((_, reject) => {
                setTimeout(() => {
                    if (expectedSearchId !== undefined && !searchCompleted) {
                        this.searchService.cancel(expectedSearchId);
                        searchCompleted = true;
                        reject(new Error('Search timed out after 30 seconds'));
                    }
                }, 30000);
            });

            const finalResults = await Promise.race([searchPromise, timeoutPromise]);

            const formattedResults = finalResults.map(r => ({
                file: r.fileUri,
                matches: r.matches.map(m => ({ line: m.line, text: m.lineText }))
            }));

            return JSON.stringify(formattedResults);

        } catch (error) {
            return JSON.stringify({ error: error.message || 'Failed to execute search' });
        }
    }
}
