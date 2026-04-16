// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { Emitter } from '@theia/core/lib/common/event';
import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { ScmService } from './scm-service';
import { ScmHistoryItem, ScmHistoryProvider, ScmHistoryOptions } from './scm-provider';
import { computeGraphRows, GraphRow } from './scm-history-graph-lanes';

export const PAGE_SIZE = 50;

export interface HistoryGraphEntry {
    readonly item: ScmHistoryItem;
    readonly graphRow: GraphRow;
}

@injectable()
export class ScmHistoryGraphModel {

    @inject(ScmService) protected readonly scmService: ScmService;

    protected readonly toDispose = new DisposableCollection();
    protected readonly toDisposeOnProviderChange = new DisposableCollection();

    protected _entries: HistoryGraphEntry[] = [];
    protected _hasMore = false;
    protected _loading = false;
    protected _hasAttemptedLoad = false;
    protected _cursor: string | undefined;
    protected _provider: ScmHistoryProvider | undefined;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    protected cancelSource = new CancellationTokenSource();

    @postConstruct()
    protected init(): void {
        this.toDispose.pushAll([
            Disposable.create(() => this.toDisposeOnProviderChange.dispose()),
            this.onDidChangeEmitter,
            this.scmService.onDidChangeSelectedRepository(() => this.refresh()),
        ]);
        this.refresh();
    }

    dispose(): void {
        this.cancelSource.cancel();
        this.toDispose.dispose();
    }

    get provider(): ScmHistoryProvider | undefined {
        return this._provider;
    }

    get entries(): readonly HistoryGraphEntry[] {
        return this._entries;
    }

    get hasMore(): boolean {
        return this._hasMore;
    }

    get loading(): boolean {
        return this._loading;
    }

    /**
     * Returns true once the model has completed at least one load attempt
     * (regardless of whether history items were found). This is used by
     * the widget to distinguish "still initializing" from "no history".
     */
    get hasAttemptedLoad(): boolean {
        return this._hasAttemptedLoad;
    }

    refresh(): void {
        this.cancelSource.cancel();
        this.cancelSource = new CancellationTokenSource();

        this.toDisposeOnProviderChange.dispose();

        const repo = this.scmService.selectedRepository;
        const hp = repo?.provider.historyProvider;
        this._provider = hp;

        if (this._provider) {
            this.toDisposeOnProviderChange.push(
                this._provider.onDidChangeCurrentHistoryItemRefs(() => this.refresh())
            );
            this.toDisposeOnProviderChange.push(
                this._provider.onDidChangeHistoryItemRefs(() => this.refresh())
            );
        } else if (repo) {
            // historyProvider is not yet available; listen for provider changes
            // so that refresh() is retried when historyProvider becomes available.
            this.toDisposeOnProviderChange.push(
                repo.provider.onDidChange(() => this.refresh())
            );
        }

        this._entries = [];
        this._cursor = undefined;
        this._hasMore = false;

        this.loadPage();
    }

    async loadMore(): Promise<void> {
        if (this._loading || !this._hasMore) {
            return;
        }
        await this.loadPage();
    }

    protected async loadPage(): Promise<void> {
        if (!this._provider) {
            this._entries = [];
            this._hasMore = false;
            this._loading = false;
            this._hasAttemptedLoad = true;
            this.onDidChangeEmitter.fire();
            return;
        }

        this._loading = true;
        this.onDidChangeEmitter.fire();

        const token = this.cancelSource.token;
        try {
            const historyItemRefs = this.getCurrentHistoryItemRefs();
            const options: ScmHistoryOptions = {
                cursor: this._cursor,
                limit: PAGE_SIZE,
                historyItemRefs: historyItemRefs.length > 0 ? historyItemRefs : undefined,
            };
            const items = await this._provider.provideHistoryItems(options, token);

            if (token.isCancellationRequested) {
                return;
            }

            const fetchedItems: ScmHistoryItem[] = items ?? [];
            this._hasMore = fetchedItems.length >= PAGE_SIZE;
            if (fetchedItems.length > 0) {
                this._cursor = fetchedItems[fetchedItems.length - 1].id;
            }

            // Deduplicate: the cursor-based pagination may re-return the
            // last item of the previous page. Filter out any items that
            // were already loaded to prevent graph duplication on scroll.
            const existingIds = new Set(this._entries.map(e => e.item.id));
            const newItems = fetchedItems.filter(i => !existingIds.has(i.id));

            const allItems = [...this._entries.map(e => e.item), ...newItems];
            const graphRows = computeGraphRows(allItems.map(i => ({
                id: i.id,
                parentIds: i.parentIds,
            })));

            this._entries = allItems.map((item, idx) => ({
                item,
                graphRow: graphRows[idx],
            }));
        } catch (err) {
            if (!token.isCancellationRequested) {
                console.error('ScmHistoryGraphModel: failed to load history', err);
            }
        } finally {
            if (!token.isCancellationRequested) {
                this._loading = false;
                this._hasAttemptedLoad = true;
                this.onDidChangeEmitter.fire();
            }
        }
    }

    /**
     * Returns the set of ref IDs to pass to `provideHistoryItems`.
     * Mirrors what VS Code's SCM Graph view does: only pass the current
     * branch ref, its remote tracking ref, and the merge-base ref.
     */
    protected getCurrentHistoryItemRefs(): string[] {
        if (!this._provider) {
            return [];
        }
        const refs: string[] = [];
        if (this._provider.currentHistoryItemRef) {
            refs.push(this._provider.currentHistoryItemRef.id);
        }
        if (this._provider.currentHistoryItemRemoteRef) {
            refs.push(this._provider.currentHistoryItemRemoteRef.id);
        }
        if (this._provider.currentHistoryItemBaseRef) {
            refs.push(this._provider.currentHistoryItemBaseRef.id);
        }
        return refs;
    }
}
