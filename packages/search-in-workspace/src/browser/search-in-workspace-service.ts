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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import {
    SearchInWorkspaceServer,
    SearchInWorkspaceClient,
    SearchInWorkspaceResult,
    SearchInWorkspaceOptions
} from '../common/search-in-workspace-interface';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ILogger } from '@theia/core';

/**
 * Class that will receive the search results from the server.  This is separate
 * from the SearchInWorkspaceService class only to avoid a cycle in the
 * dependency injection.
 */

@injectable()
export class SearchInWorkspaceClientImpl implements SearchInWorkspaceClient {
    private service: SearchInWorkspaceClient;

    onResult(searchId: number, result: SearchInWorkspaceResult): void {
        this.service.onResult(searchId, result);
    }
    onDone(searchId: number, error?: string): void {
        this.service.onDone(searchId, error);
    }

    setService(service: SearchInWorkspaceClient): void {
        this.service = service;
    }
}

export type SearchInWorkspaceCallbacks = SearchInWorkspaceClient;

/**
 * Service to search text in the workspace files.
 */
@injectable()
export class SearchInWorkspaceService implements SearchInWorkspaceClient {

    // All the searches that we have started, that are not done yet (onDone
    // with that searchId has not been called).
    private pendingSearches = new Map<number, SearchInWorkspaceCallbacks>();

    // Due to the asynchronicity of the node backend, it's possible that we
    // start a search, receive an event for that search, and then receive
    // the search id for that search.We therefore need to keep those
    // events until we get the search id and return it to the caller.
    // Otherwise the caller would discard the event because it doesn't know
    // the search id yet.
    private pendingOnDones: Map<number, string | undefined> = new Map();

    private lastKnownSearchId: number = -1;

    @inject(SearchInWorkspaceServer) protected readonly searchServer: SearchInWorkspaceServer;
    @inject(SearchInWorkspaceClientImpl) protected readonly client: SearchInWorkspaceClientImpl;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(ILogger) protected readonly logger: ILogger;

    @postConstruct()
    protected init(): void {
        this.client.setService(this);
    }

    isEnabled(): boolean {
        return this.workspaceService.opened;
    }

    onResult(searchId: number, result: SearchInWorkspaceResult): void {
        const callbacks = this.pendingSearches.get(searchId);

        if (callbacks) {
            callbacks.onResult(searchId, result);
        }
    }

    onDone(searchId: number, error?: string): void {
        const callbacks = this.pendingSearches.get(searchId);

        if (callbacks) {
            this.pendingSearches.delete(searchId);
            callbacks.onDone(searchId, error);
        } else {
            if (searchId > this.lastKnownSearchId) {
                this.logger.debug(`Got an onDone for a searchId we don't know about (${searchId}), stashing it for later with error = `, error);
                this.pendingOnDones.set(searchId, error);
            } else {
                // It's possible to receive an onDone for a search we have cancelled.  Just ignore it.
                this.logger.debug(`Got an onDone for a searchId we don't know about (${searchId}), but it's probably an old one, error = `, error);
            }
        }
    }

    // Start a search of the string "what" in the workspace.
    async search(what: string, callbacks: SearchInWorkspaceCallbacks, opts?: SearchInWorkspaceOptions): Promise<number> {
        if (!this.workspaceService.opened) {
            throw new Error('Search failed: no workspace root.');
        }

        const roots = await this.workspaceService.roots;
        return this.doSearch(what, roots.map(r => r.resource.toString()), callbacks, opts);
    }

    protected async doSearch(what: string, rootsUris: string[], callbacks: SearchInWorkspaceCallbacks, opts?: SearchInWorkspaceOptions): Promise<number> {
        const searchId = await this.searchServer.search(what, rootsUris, opts);
        this.pendingSearches.set(searchId, callbacks);
        this.lastKnownSearchId = searchId;

        this.logger.debug('Service launched search ' + searchId);

        // Check if we received an onDone before search() returned.
        if (this.pendingOnDones.has(searchId)) {
            this.logger.debug('Ohh, we have a stashed onDone for that searchId');
            const error = this.pendingOnDones.get(searchId);
            this.pendingOnDones.delete(searchId);

            // Call the client's searchId, but first give it a
            // chance to record the returned searchId.
            setTimeout(() => {
                this.onDone(searchId, error);
            }, 0);
        }

        return searchId;
    }

    async searchWithCallback(what: string, rootsUris: string[], callbacks: SearchInWorkspaceClient, opts?: SearchInWorkspaceOptions | undefined): Promise<number> {
        return this.doSearch(what, rootsUris, callbacks, opts);
    }

    // Cancel an ongoing search.
    cancel(searchId: number): void {
        this.pendingSearches.delete(searchId);
        this.searchServer.cancel(searchId);
    }
}
