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
import { ScmHistoryItem, ScmHistoryItemRef, ScmHistoryItemRefsChangeEvent, ScmHistoryItemChange, ScmHistoryOptions, ScmHistoryProvider } from './scm-provider';
import { ScmRepository } from './scm-repository';

class StubHistoryProvider implements ScmHistoryProvider {
    currentHistoryItemRef: ScmHistoryItemRef | undefined;
    currentHistoryItemRemoteRef: ScmHistoryItemRef | undefined;
    currentHistoryItemBaseRef: ScmHistoryItemRef | undefined;

    readonly onDidChangeCurrentHistoryItemRefs = new Emitter<void>().event;
    protected readonly onDidChangeHistoryItemRefsEmitter = new Emitter<ScmHistoryItemRefsChangeEvent>();
    readonly onDidChangeHistoryItemRefs = this.onDidChangeHistoryItemRefsEmitter.event;

    fireHistoryItemRefsChanged(event: ScmHistoryItemRefsChangeEvent): void {
        this.onDidChangeHistoryItemRefsEmitter.fire(event);
    }

    /** Pages this provider will return on consecutive calls (FIFO). */
    pages: ScmHistoryItem[][] = [];
    /** Captured options for each call (so tests can assert what was sent). */
    receivedOptions: ScmHistoryOptions[] = [];

    async provideHistoryItemRefs(): Promise<ScmHistoryItemRef[] | undefined> {
        return [];
    }

    async provideHistoryItems(options: ScmHistoryOptions): Promise<ScmHistoryItem[] | undefined> {
        this.receivedOptions.push(options);
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
 * Instantiates the model with a stub provider, bypassing inversify and the
 * SCM service so tests can drive pagination directly via loadPage().
 * When `wireRepository` is set, the provider is instead wired through a stub
 * selected repository and refresh(), so provider event subscriptions are live.
 */
function createModel(
    provider: ScmHistoryProvider,
    preferences: Record<string, unknown> = {},
    wireRepository = false
): { model: ScmHistoryGraphModel; loadPage(): Promise<void>; firePreferenceChanged(preferenceName: string): void } {
    const model = new ScmHistoryGraphModel();
    const internals = model as unknown as {
        scmService: {
            onDidChangeSelectedRepository: Emitter<ScmRepository | undefined>['event'];
            selectedRepository: ScmRepository | undefined;
        };
        scmPreferences: Record<string, unknown>;
        _provider: ScmHistoryProvider | undefined;
        init(): void;
        loadPage(): Promise<void>;
    };
    const preferenceEmitter = new Emitter<{ preferenceName: string }>();
    internals.scmService = {
        onDidChangeSelectedRepository: new Emitter<ScmRepository | undefined>().event,
        selectedRepository: wireRepository ? { provider: { historyProvider: provider } } as unknown as ScmRepository : undefined,
    };
    internals.scmPreferences = Object.assign(preferences, { onPreferenceChanged: preferenceEmitter.event });
    internals.init();
    if (!wireRepository) {
        internals._provider = provider;
    }
    return {
        model,
        loadPage: () => internals.loadPage(),
        firePreferenceChanged: preferenceName => preferenceEmitter.fire({ preferenceName }),
    };
}

async function nextTick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

describe('ScmHistoryGraphModel - pagination', () => {

    it('hasMore is true when a full page returns', async () => {
        const provider = new StubHistoryProvider();
        provider.pages = [makeItems(1, PAGE_SIZE)];
        const { model, loadPage } = createModel(provider);

        await loadPage();

        expect(model.entries).to.have.length(PAGE_SIZE);
        expect(model.hasMore).to.be.true;
    });

    it('hasMore is false when fewer than a full page is returned', async () => {
        const provider = new StubHistoryProvider();
        provider.pages = [makeItems(1, 10)];
        const { model, loadPage } = createModel(provider);

        await loadPage();

        expect(model.entries).to.have.length(10);
        expect(model.hasMore).to.be.false;
    });

    it('paginates using skip = current entry count', async () => {
        const provider = new StubHistoryProvider();
        provider.pages = [
            makeItems(1, PAGE_SIZE),
            makeItems(51, PAGE_SIZE),
            makeItems(101, 10),
        ];
        const { model, loadPage } = createModel(provider);

        await loadPage();
        expect(model.entries).to.have.length(PAGE_SIZE);
        expect(provider.receivedOptions[0].skip).to.equal(0);

        await loadPage();
        expect(model.entries).to.have.length(2 * PAGE_SIZE);
        expect(provider.receivedOptions[1].skip).to.equal(PAGE_SIZE);

        await loadPage();
        expect(model.entries).to.have.length(2 * PAGE_SIZE + 10);
        expect(provider.receivedOptions[2].skip).to.equal(2 * PAGE_SIZE);
    });

    it('passes skip and not cursor (cursor is not part of the VS Code SCM history options API)', async () => {
        const provider = new StubHistoryProvider();
        provider.pages = [makeItems(1, PAGE_SIZE)];
        const { loadPage } = createModel(provider);

        await loadPage();

        expect((provider.receivedOptions[0] as { cursor?: string }).cursor).to.be.undefined;
        expect(provider.receivedOptions[0]).to.have.property('skip');
    });

    it('does not grow entries when a provider re-returns duplicates', async () => {
        const provider = new StubHistoryProvider();
        const firstPage = makeItems(1, PAGE_SIZE);
        provider.pages = [firstPage, firstPage.slice()];
        const { model, loadPage } = createModel(provider);

        await loadPage();
        expect(model.entries).to.have.length(PAGE_SIZE);

        await loadPage();
        expect(model.entries).to.have.length(PAGE_SIZE, 'should not grow when all items are duplicates');
    });
});

describe('ScmHistoryGraphModel - page size preference', () => {

    it('requests the configured page size and paginates by it', async () => {
        const provider = new StubHistoryProvider();
        provider.pages = [makeItems(1, 10)];
        const { model, loadPage } = createModel(provider, { 'scm.graph.pageSize': 10 });

        await loadPage();

        expect(provider.receivedOptions[0].limit).to.equal(10);
        expect(model.entries).to.have.length(10);
        expect(model.hasMore).to.be.true;
    });

    it('falls back to the default page size without a preference value', async () => {
        const provider = new StubHistoryProvider();
        provider.pages = [makeItems(1, 10)];
        const { loadPage } = createModel(provider);

        await loadPage();

        expect(provider.receivedOptions[0].limit).to.equal(PAGE_SIZE);
    });

    it('reloads from the start when scm.graph.pageSize changes', async () => {
        const provider = new StubHistoryProvider();
        provider.pages = [makeItems(1, 10), makeItems(1, 5)];
        const preferences: Record<string, unknown> = { 'scm.graph.pageSize': 10 };
        const { loadPage, firePreferenceChanged } = createModel(provider, preferences);

        await loadPage();
        expect(provider.receivedOptions[0].limit).to.equal(10);

        preferences['scm.graph.pageSize'] = 5;
        firePreferenceChanged('scm.graph.pageSize');
        await nextTick();

        expect(provider.receivedOptions[1].limit).to.equal(5);
        expect(provider.receivedOptions[1].skip).to.equal(0);
    });
});

describe('ScmHistoryGraphModel - history item ref filter', () => {

    const mainRef: ScmHistoryItemRef = { id: 'refs/heads/main', name: 'main', revision: 'c1' };

    function createFilterProvider(): StubHistoryProvider {
        const provider = new StubHistoryProvider();
        provider.currentHistoryItemRef = mainRef;
        provider.pages = [makeItems(1, 3), makeItems(1, 3), makeItems(1, 3)];
        return provider;
    }

    it('is in auto mode by default: current ref revisions are requested and the current ref is in the filter', async () => {
        const provider = createFilterProvider();
        const { model, loadPage } = createModel(provider);
        await loadPage();
        expect(provider.receivedOptions[0].historyItemRefs).to.deep.equal(['c1']);
        expect(model.historyItemRefFilter).to.be.undefined;
        expect(model.isCurrentRefInFilter()).to.be.true;
    });

    it('passes the picked ref ids to the provider and reloads', async () => {
        const provider = createFilterProvider();
        const { model } = createModel(provider);
        model.setHistoryItemRefFilter(['refs/heads/feature']);
        await nextTick();
        expect(provider.receivedOptions[0].historyItemRefs).to.deep.equal(['refs/heads/feature']);
        expect(model.historyItemRefFilter).to.deep.equal(['refs/heads/feature']);
    });

    it('reports whether the current ref is part of the filter', async () => {
        const provider = createFilterProvider();
        const { model } = createModel(provider);
        model.setHistoryItemRefFilter(['refs/heads/feature']);
        await nextTick();
        expect(model.isCurrentRefInFilter()).to.be.false;
        model.setHistoryItemRefFilter(['refs/heads/feature', 'refs/heads/main']);
        await nextTick();
        expect(model.isCurrentRefInFilter()).to.be.true;
    });

    it('returns to auto mode when the filter is cleared', async () => {
        const provider = createFilterProvider();
        const { model } = createModel(provider);
        model.setHistoryItemRefFilter(['refs/heads/feature']);
        await nextTick();
        model.setHistoryItemRefFilter(undefined);
        await nextTick();
        expect(model.historyItemRefFilter).to.be.undefined;
        expect(provider.receivedOptions[1].historyItemRefs).to.deep.equal(['c1']);
    });

    it('does not apply ref role colors to refs excluded by the filter', async () => {
        const provider = createFilterProvider();
        provider.pages = [[
            { id: 'c1', subject: 'head', parentIds: ['c2'], references: [mainRef] },
            { id: 'c2', subject: 'base', parentIds: [] },
        ]];
        const { model } = createModel(provider);
        model.setHistoryItemRefFilter(['refs/heads/feature']);
        await nextTick();
        expect(model.entries[0].graphRow.color).to.not.equal(0);
    });
});

describe('ScmHistoryGraphModel - ref filter pruning', () => {

    const mainRef: ScmHistoryItemRef = { id: 'refs/heads/main', name: 'main', revision: 'c1' };
    const featureRef: ScmHistoryItemRef = { id: 'refs/heads/feature', name: 'feature', revision: 'c5' };

    function createWiredProvider(): StubHistoryProvider {
        const provider = new StubHistoryProvider();
        provider.currentHistoryItemRef = mainRef;
        return provider;
    }

    it('drops a removed ref from the filter and keeps the remaining ones', async () => {
        const provider = createWiredProvider();
        const { model } = createModel(provider, {}, true);
        model.setHistoryItemRefFilter([featureRef.id, mainRef.id]);
        await nextTick();

        provider.fireHistoryItemRefsChanged({ added: [], removed: [featureRef], modified: [] });
        await nextTick();

        expect(model.historyItemRefFilter).to.deep.equal([mainRef.id]);
        const last = provider.receivedOptions[provider.receivedOptions.length - 1];
        expect(last.historyItemRefs).to.deep.equal([mainRef.id]);
    });

    it('falls back to auto mode when all filtered refs are removed', async () => {
        const provider = createWiredProvider();
        const { model } = createModel(provider, {}, true);
        model.setHistoryItemRefFilter([featureRef.id]);
        await nextTick();

        provider.fireHistoryItemRefsChanged({ added: [], removed: [featureRef], modified: [] });
        await nextTick();

        expect(model.historyItemRefFilter).to.be.undefined;
        const last = provider.receivedOptions[provider.receivedOptions.length - 1];
        expect(last.historyItemRefs).to.deep.equal(['c1']);
    });

    it('keeps the filter when unrelated refs are removed', async () => {
        const provider = createWiredProvider();
        const { model } = createModel(provider, {}, true);
        model.setHistoryItemRefFilter([mainRef.id]);
        await nextTick();

        provider.fireHistoryItemRefsChanged({ added: [], removed: [featureRef], modified: [] });
        await nextTick();

        expect(model.historyItemRefFilter).to.deep.equal([mainRef.id]);
    });
});

describe('ScmHistoryGraphModel - ref colors and current item', () => {

    const mainRef: ScmHistoryItemRef = { id: 'refs/heads/main', name: 'main', revision: 'c2' };
    const originMainRef: ScmHistoryItemRef = { id: 'refs/remotes/origin/main', name: 'origin/main', revision: 'c1' };

    /** Remote is one commit ahead: c1 (origin/main) → c2 (main = HEAD) → c3. */
    function createBehindProvider(): StubHistoryProvider {
        const provider = new StubHistoryProvider();
        provider.currentHistoryItemRef = mainRef;
        provider.currentHistoryItemRemoteRef = originMainRef;
        provider.pages = [[
            { id: 'c1', subject: 'remote only', parentIds: ['c2'], references: [originMainRef] },
            { id: 'c2', subject: 'local head', parentIds: ['c3'], references: [mainRef] },
            { id: 'c3', subject: 'base', parentIds: [] },
        ]];
        return provider;
    }

    it('colors the remote ref tip with the remote ref color', async () => {
        const { model, loadPage } = createModel(createBehindProvider());
        await loadPage();
        expect(model.entries[0].graphRow.color).to.equal(1);
    });

    it('colors the current ref chain with the current ref color', async () => {
        const { model, loadPage } = createModel(createBehindProvider());
        await loadPage();
        expect(model.entries[1].graphRow.color).to.equal(0);
        expect(model.entries[2].graphRow.color).to.equal(0);
    });

    it('prefers the current ref color when a commit carries both local and remote refs', async () => {
        const provider = new StubHistoryProvider();
        const syncedMain: ScmHistoryItemRef = { ...mainRef, revision: 'c1' };
        const syncedRemote: ScmHistoryItemRef = { ...originMainRef, revision: 'c1' };
        provider.currentHistoryItemRef = syncedMain;
        provider.currentHistoryItemRemoteRef = syncedRemote;
        provider.pages = [[
            { id: 'c1', subject: 'in sync', parentIds: [], references: [syncedRemote, syncedMain] },
        ]];
        const { model, loadPage } = createModel(provider);
        await loadPage();
        expect(model.entries[0].graphRow.color).to.equal(0);
    });

    it('marks only the entry at the current ref revision as current', async () => {
        const { model, loadPage } = createModel(createBehindProvider());
        await loadPage();
        expect(model.entries.map(e => e.isCurrent)).to.deep.equal([false, true, false]);
    });

    it('marks no entry as current when the provider has no current ref', async () => {
        const provider = new StubHistoryProvider();
        provider.pages = [makeItems(1, 3)];
        const { model, loadPage } = createModel(provider);
        await loadPage();
        expect(model.entries.every(e => !e.isCurrent)).to.be.true;
    });
});
