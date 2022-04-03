// *****************************************************************************
// Copyright (C) 2017-2018 Ericsson and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { SearchInWorkspaceServer, SearchInWorkspaceResult, SearchInWorkspaceOptions } from '../common/search-in-workspace-interface';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { cancelled, Deferred, ILogger } from '@theia/core';

export interface PendingSearch {
    accumulated: SearchInWorkspaceResult[]
    done: Deferred<boolean>
}

export interface AsyncSearch {
    readonly searchId: number
    readonly results: AsyncIterable<SearchInWorkspaceResult>
    cancel(): void
}

/**
 * Service to search text in the workspace files.
 */
@injectable()
export class SearchInWorkspaceService {

    // All the searches that we have started, that are not done yet (onDone
    // with that searchId has not been called).
    private pendingSearches = new Map<number, PendingSearch>();

    @inject(SearchInWorkspaceServer) protected searchServer: SearchInWorkspaceServer;
    @inject(WorkspaceService) protected workspaceService: WorkspaceService;
    @inject(ILogger) protected logger: ILogger;

    @postConstruct()
    protected init(): void {
        this.searchServer.onResult(({ searchId, result }) => this.handleResult(searchId, result));
        this.searchServer.onDone(({ searchId, error }) => this.handleDone(searchId, error));
    }

    isEnabled(): boolean {
        return this.workspaceService.opened;
    }

    protected handleResult(searchId: number, result: SearchInWorkspaceResult): void {
        const pending = this.pendingSearches.get(searchId);
        if (pending) {
            pending.accumulated.push(result);
            pending.done.resolve(false);
        }
    }

    protected handleDone(searchId: number, error?: string): void {
        const pending = this.pendingSearches.get(searchId);
        if (pending) {
            this.pendingSearches.delete(searchId);
            if (error) {
                pending.done.reject(error);
            } else {
                // `undefined` means the search is done
                pending.done.resolve(true);
            }
        } else {
            this.logger.debug(`Ignored a done event with id=${searchId}`);
        }
    }

    /**
     * @param what The string to search in the currently opened workspace.
     */
    async search(what: string, opts?: SearchInWorkspaceOptions): Promise<AsyncSearch> {
        if (!this.workspaceService.opened) {
            throw new Error('Search failed: no workspace root.');
        }
        const roots = await this.workspaceService.roots;
        return this.searchInRoots(what, roots.map(r => r.resource.toString()), opts);
    }

    /**
     * @param what The string to search for in the roots passed to {@link rootUris}
     * @param rootUris The root URIs as strings
     */
    async searchInRoots(what: string, rootUris: string[], opts?: SearchInWorkspaceOptions): Promise<AsyncSearch> {
        const searchId = await this.searchServer.search(what, rootUris, opts);
        this.logger.debug(`Service launched search ${searchId}`);
        return {
            searchId,
            results: this.createSearchAsyncIterator(searchId),
            cancel: () => this.cancel(searchId)
        };
    }

    /**
     * Cancel an ongoing search.
     */
    cancel(searchId: number): void {
        this.pendingSearches.get(searchId)?.done.reject(cancelled());
        this.pendingSearches.delete(searchId);
        this.searchServer.cancel(searchId);
    }

    protected async *createSearchAsyncIterator(searchId: number): AsyncIterable<SearchInWorkspaceResult> {
        const pending: PendingSearch = { done: new Deferred(), accumulated: [] };
        this.pendingSearches.set(searchId, pending);
        let done = false;
        while (!done) {
            // The deferred should be resolved by `this.handleResult(...)`
            done = await pending.done.promise;
            const results = pending.accumulated;
            // Reset the pending instance and let it accumulate more results
            pending.accumulated = [];
            pending.done = new Deferred();
            yield* results;
        }
    }
}
