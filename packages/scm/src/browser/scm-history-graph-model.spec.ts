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
    internals.init();
    internals._provider = provider;
    return {
        model,
        loadPage: () => internals.loadPage(),
    };
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
