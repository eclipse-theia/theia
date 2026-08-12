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
import { ScmHistoryItem, ScmHistoryItemRef, ScmHistoryProvider, ScmHistoryOptions } from './scm-provider';
import { computeGraphRows, GraphRow } from './scm-history-graph-lanes';
import { getRefColorIndex } from './scm-history-graph-helpers';
import { ScmPreferences } from '../common/scm-preferences';

export const PAGE_SIZE = 50;

export const ScmHistoryGraphModelProvider = Symbol('ScmHistoryGraphModelProvider');
/**
 * Resolves the {@link ScmHistoryGraphModel} singleton on first use. The model
 * starts loading history and subscribing to provider events as soon as it is
 * instantiated, so clients that may not need it (e.g. command contributions
 * instantiated at application start) must inject this provider instead of the
 * model itself.
 */
export type ScmHistoryGraphModelProvider = () => ScmHistoryGraphModel;

export interface HistoryGraphEntry {
    readonly item: ScmHistoryItem;
    readonly graphRow: GraphRow;
    /** True when this item is the commit the current history item ref points at (HEAD). */
    readonly isCurrent: boolean;
}

@injectable()
export class ScmHistoryGraphModel {

    @inject(ScmService) protected readonly scmService: ScmService;
    @inject(ScmPreferences) protected readonly scmPreferences: ScmPreferences;

    protected readonly toDispose = new DisposableCollection();
    protected readonly toDisposeOnProviderChange = new DisposableCollection();

    protected _entries: HistoryGraphEntry[] = [];
    protected _hasMore = false;
    protected _loading = false;
    protected _hasAttemptedLoad = false;
    protected _provider: ScmHistoryProvider | undefined;
    /** Explicitly picked ref ids to filter the graph by; `undefined` = auto (current/remote/base). */
    protected _historyItemRefFilter: string[] | undefined;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    protected cancelSource = new CancellationTokenSource();

    @postConstruct()
    protected init(): void {
        this.toDispose.pushAll([
            Disposable.create(() => this.toDisposeOnProviderChange.dispose()),
            this.onDidChangeEmitter,
            this.scmService.onDidChangeSelectedRepository(() => this.refresh()),
            this.scmPreferences.onPreferenceChanged(e => {
                if (e.preferenceName === 'scm.graph.pageSize') {
                    this.reload();
                }
            }),
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

    /** The explicitly picked ref ids filtering the graph, or `undefined` in auto mode. */
    get historyItemRefFilter(): readonly string[] | undefined {
        return this._historyItemRefFilter;
    }

    /**
     * Sets the ref ids to filter the graph by (`undefined` returns to auto
     * mode) and reloads the graph.
     */
    setHistoryItemRefFilter(refIds: readonly string[] | undefined): void {
        this._historyItemRefFilter = refIds && refIds.length > 0 ? [...refIds] : undefined;
        this.reload();
    }

    /**
     * Whether the current history item ref is part of the graph's filter.
     * Always true in auto mode, which includes the current ref.
     */
    isCurrentRefInFilter(): boolean {
        if (!this._historyItemRefFilter) {
            return true;
        }
        const currentId = this._provider?.currentHistoryItemRef?.id;
        return currentId !== undefined && this._historyItemRefFilter.includes(currentId);
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
        this.toDisposeOnProviderChange.dispose();

        const repo = this.scmService.selectedRepository;
        const hp = repo?.provider.historyProvider;
        if (hp !== this._provider) {
            // The repository changed — a filter picked for the old provider does not apply.
            this._historyItemRefFilter = undefined;
        }
        this._provider = hp;

        if (this._provider) {
            this.toDisposeOnProviderChange.push(
                this._provider.onDidChangeCurrentHistoryItemRefs(() => this.refresh())
            );
            this.toDisposeOnProviderChange.push(
                this._provider.onDidChangeHistoryItemRefs(e => {
                    this.pruneHistoryItemRefFilter(e.removed);
                    this.refresh();
                })
            );
        } else if (repo) {
            // historyProvider is not yet available; listen for provider changes
            // so that refresh() is retried when historyProvider becomes available.
            this.toDisposeOnProviderChange.push(
                repo.provider.onDidChange(() => this.refresh())
            );
        }

        this.reload();
    }

    /**
     * Drops refs that no longer exist from the explicit filter, so that
     * deleting or renaming a filtered ref does not leave the graph stuck
     * requesting history for it. When the last filtered ref is removed,
     * the filter falls back to auto mode.
     */
    protected pruneHistoryItemRefFilter(removed: readonly ScmHistoryItemRef[]): void {
        if (!this._historyItemRefFilter || removed.length === 0) {
            return;
        }
        const removedIds = new Set(removed.map(ref => ref.id));
        const remaining = this._historyItemRefFilter.filter(id => !removedIds.has(id));
        if (remaining.length !== this._historyItemRefFilter.length) {
            this._historyItemRefFilter = remaining.length > 0 ? remaining : undefined;
        }
    }

    /** Clears the loaded entries and loads the first page again from the current provider. */
    protected reload(): void {
        this.cancelSource.cancel();
        this.cancelSource = new CancellationTokenSource();

        this._entries = [];
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
            const pageSize = this.pageSize;
            const historyItemRefs = this.getCurrentHistoryItemRefs();
            const options: ScmHistoryOptions = {
                skip: this._entries.length,
                limit: pageSize,
                historyItemRefs: historyItemRefs.length > 0 ? historyItemRefs : undefined,
            };
            const items = await this._provider.provideHistoryItems(options, token);

            if (token.isCancellationRequested) {
                return;
            }

            const fetchedItems: ScmHistoryItem[] = items ?? [];
            this._hasMore = fetchedItems.length >= pageSize;

            // Filter out any items already loaded so the graph does not show duplicates.
            const existingIds = new Set(this._entries.map(e => e.item.id));
            const newItems = fetchedItems.filter(i => !existingIds.has(i.id));

            const allItems = [...this._entries.map(e => e.item), ...newItems];
            const graphRows = computeGraphRows(allItems.map(i => ({
                id: i.id,
                parentIds: i.parentIds,
                colorIndex: this.resolveColorIndex(i),
            })));

            const currentRevision = this._provider.currentHistoryItemRef?.revision;
            this._entries = allItems.map((item, idx) => ({
                item,
                graphRow: graphRows[idx],
                isCurrent: currentRevision !== undefined && item.id === currentRevision,
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

    /** The configured page size (`scm.graph.pageSize`). */
    protected get pageSize(): number {
        return this.scmPreferences['scm.graph.pageSize'] ?? PAGE_SIZE;
    }

    /**
     * Resolves the ref-based color index of an item from its references,
     * preferring current (0) over remote (1) over base (2). Refs excluded by
     * an explicit filter get no role color, mirroring VS Code's color map.
     */
    protected resolveColorIndex(item: ScmHistoryItem): number | undefined {
        let result: number | undefined;
        for (const ref of item.references ?? []) {
            if (this._historyItemRefFilter && !this._historyItemRefFilter.includes(ref.id)) {
                continue;
            }
            const index = getRefColorIndex(ref, this._provider);
            if (index !== undefined && (result === undefined || index < result)) {
                result = index;
            }
        }
        return result;
    }

    /**
     * Returns the refs to pass to `provideHistoryItems`: the explicitly picked
     * ref ids when a filter is active, otherwise (auto mode) the revisions of
     * the current branch ref, its remote tracking ref, and the merge-base ref.
     * Providers walk history starting from these refs.
     */
    protected getCurrentHistoryItemRefs(): string[] {
        if (this._historyItemRefFilter) {
            return [...this._historyItemRefFilter];
        }
        if (!this._provider) {
            return [];
        }
        const refs: string[] = [];
        if (this._provider.currentHistoryItemRef) {
            refs.push(this._provider.currentHistoryItemRef.revision ?? this._provider.currentHistoryItemRef.id);
        }
        if (this._provider.currentHistoryItemRemoteRef) {
            refs.push(this._provider.currentHistoryItemRemoteRef.revision ?? this._provider.currentHistoryItemRemoteRef.id);
        }
        if (this._provider.currentHistoryItemBaseRef) {
            refs.push(this._provider.currentHistoryItemBaseRef.revision ?? this._provider.currentHistoryItemBaseRef.id);
        }
        return refs;
    }
}
