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

import { expect } from 'chai';
import { Emitter } from '@theia/core/lib/common/event';
import { ScmHistoryGraphModel, PAGE_SIZE } from './scm-history-graph-model';
import { ScmHistoryItem, ScmHistoryItemRef, ScmHistoryItemChange, ScmHistoryOptions, ScmHistoryProvider } from './scm-provider';
import { ScmRepository } from './scm-repository';

class StubHistoryProvider implements ScmHistoryProvider {
    readonly currentHistoryItemRef: ScmHistoryItemRef | undefined;
    readonly currentHistoryItemRemoteRef: ScmHistoryItemRef | undefined;
    readonly currentHistoryItemBaseRef: ScmHistoryItemRef | undefined;

    readonly onDidChangeCurrentHistoryItemRefs = new Emitter<void>().event;
    readonly onDidChangeHistoryItemRefs = new Emitter<{
        readonly added: readonly ScmHistoryItemRef[];
        readonly removed: readonly ScmHistoryItemRef[];
        readonly modified: readonly ScmHistoryItemRef[];
    }>().event;

    /** Pages this provider will return on consecutive calls (FIFO). */
    pages: ScmHistoryItem[][] = [];
    /** Captured cursors for each call. */
    receivedCursors: (string | undefined)[] = [];

    async provideHistoryItemRefs(): Promise<ScmHistoryItemRef[] | undefined> {
        return [];
    }

    async provideHistoryItems(options: ScmHistoryOptions): Promise<ScmHistoryItem[] | undefined> {
        this.receivedCursors.push(options.cursor);
        return this.pages.shift() ?? [];
    }

    async provideHistoryItemChanges(): Promise<ScmHistoryItemChange[] | undefined> {
        return [];
    }

    async resolveHistoryItem(): Promise<ScmHistoryItem | undefined> {
        return undefined;
    }

    async resolveHistoryItemRefsCommonAncestor(): Promise<string | undefined> {
        return undefined;
    }
}

function makeItems(start: number, count: number): ScmHistoryItem[] {
    const items: ScmHistoryItem[] = [];
    for (let i = 0; i < count; i++) {
        const id = `c${start + i}`;
        items.push({
            id,
            subject: `commit ${id}`,
            parentIds: [`c${start + i + 1}`],
        });
    }
    return items;
}

/**
 * Creates a model instance with a stub history provider, bypassing inversify
 * and the SCM service so we can directly drive pagination and observe state.
 *
 * The model's @postConstruct refresh() runs against an empty SCM service
 * (no selected repository), which leaves the model idle. We then wire the
 * provider in and exercise pagination via loadPage() directly.
 */
function createModel(provider: ScmHistoryProvider): { model: ScmHistoryGraphModel; loadPage(): Promise<void> } {
    const model = new ScmHistoryGraphModel();
    const internals = model as unknown as {
        scmService: {
            onDidChangeSelectedRepository: Emitter<ScmRepository | undefined>['event'];
            selectedRepository: ScmRepository | undefined;
        };
        _provider: ScmHistoryProvider | undefined;
        init(): void;
        loadPage(): Promise<void>;
    };
    internals.scmService = {
        onDidChangeSelectedRepository: new Emitter<ScmRepository | undefined>().event,
        selectedRepository: undefined,
    };
    // Drive postConstruct manually now that the dependency is in place.
    internals.init();
    // Inject the provider directly, bypassing the SCM service lookup.
    internals._provider = provider;
    return {
        model,
        loadPage: () => internals.loadPage(),
    };
}

describe('ScmHistoryGraphModel - pagination', () => {

    it('hasMore is true when a full page returns and contains new items', async () => {
        const provider = new StubHistoryProvider();
        provider.pages = [makeItems(1, PAGE_SIZE)];
        const { model, loadPage } = createModel(provider);

        await loadPage();

        expect(model.entries).to.have.length(PAGE_SIZE);
        expect(model.hasMore).to.be.true;
        expect(provider.receivedCursors).to.deep.equal([undefined]);
    });

    it('hasMore is false when fewer than a full page is returned', async () => {
        const provider = new StubHistoryProvider();
        provider.pages = [makeItems(1, 10)];
        const { model, loadPage } = createModel(provider);

        await loadPage();

        expect(model.entries).to.have.length(10);
        expect(model.hasMore).to.be.false;
    });

    it('deduplicates items returned across pages without growing entries beyond the unique set', async () => {
        const provider = new StubHistoryProvider();
        // Page 1: items c1..c50. Page 2 echoes the cursor commit (item c50)
        // plus 49 new items c51..c99 -> 50 fetched, 49 new.
        provider.pages = [
            makeItems(1, PAGE_SIZE),
            makeItems(50, PAGE_SIZE), // includes item id 'c50' as the first
        ];
        const { model, loadPage } = createModel(provider);

        await loadPage();
        expect(model.entries).to.have.length(PAGE_SIZE);
        await loadPage();

        const ids = model.entries.map(e => e.item.id);
        const uniqueIds = new Set(ids);
        expect(ids.length).to.equal(uniqueIds.size, 'no duplicates expected after dedup');
        // 50 from page 1 + 49 unique from page 2.
        expect(model.entries).to.have.length(PAGE_SIZE + (PAGE_SIZE - 1));
        expect(model.hasMore).to.be.true;
    });

    // Regression test for https://github.com/eclipse-theia/theia/pull/17263 -
    // when a full page comes back but every item is a duplicate (e.g. the
    // provider re-returns already-loaded items because the cursor cannot be
    // honored), `hasMore` must become false instead of leaving "Load more"
    // visible but unable to make progress.
    it('hasMore becomes false when a full page returns only duplicates', async () => {
        const provider = new StubHistoryProvider();
        const firstPage = makeItems(1, PAGE_SIZE);
        provider.pages = [
            firstPage,
            // Provider echoes the SAME 50 items - all duplicates.
            firstPage.slice(),
        ];
        const { model, loadPage } = createModel(provider);

        await loadPage();
        expect(model.entries).to.have.length(PAGE_SIZE);
        expect(model.hasMore).to.be.true;

        await loadPage();
        expect(model.entries).to.have.length(PAGE_SIZE, 'should not grow when all items are duplicates');
        expect(model.hasMore).to.be.false;
    });

    it('advances the cursor to the last fetched item across pages', async () => {
        const provider = new StubHistoryProvider();
        provider.pages = [
            makeItems(1, PAGE_SIZE),
            makeItems(51, PAGE_SIZE),
        ];
        const { loadPage } = createModel(provider);

        await loadPage();
        await loadPage();

        // First call has no cursor; second call uses the id of the last item
        // from page 1 (c50).
        expect(provider.receivedCursors).to.deep.equal([undefined, 'c50']);
    });
});
