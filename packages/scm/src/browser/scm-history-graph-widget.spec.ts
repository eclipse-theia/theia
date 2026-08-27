// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { Emitter } from '@theia/core/lib/common/event';
import { ContextKey, ContextKeyServiceDummyImpl, ContextKeyValue } from '@theia/core/lib/browser/context-key-service';
import { ScmContextKeyService } from './scm-context-key-service';
import { ScmHistoryGraphWidget } from './scm-history-graph-widget';
import { GraphRow } from './scm-history-graph-lanes';
import { ScmHistoryItemChange, ScmHistoryProvider } from './scm-provider';

disableJSDOM();

class MockContextKeyService extends ContextKeyServiceDummyImpl {
    override createKey<T extends ContextKeyValue>(key: string, defaultValue: T | undefined): ContextKey<T> {
        let value: T | undefined = defaultValue;
        return {
            set: (v: T | undefined) => { value = v; },
            reset: () => { value = defaultValue; },
            get: () => value
        };
    }
}

/**
 * Lets React finish the work it scheduled while the DOM is still in place.
 * Disposing a `ReactWidget` unmounts its root, and React flushes the resulting
 * passive effects on a `setImmediate` callback that accesses `window`. Without
 * this, that callback runs after JSDOM has been torn down and fails.
 */
function flushReactWork(): Promise<void> {
    return new Promise<void>(resolve => setImmediate(resolve));
}

function createScmContextKeyService(): ScmContextKeyService {
    const service = new ScmContextKeyService();
    (service as unknown as { contextKeyService: MockContextKeyService }).contextKeyService = new MockContextKeyService();
    (service as unknown as { init(): void }).init();
    return service;
}

describe('ScmHistoryGraphWidget context keys', () => {
    let restoreJSDOM: () => void;
    let widget: ScmHistoryGraphWidget;
    let scmContextKeys: ScmContextKeyService;
    let provider: Partial<ScmHistoryProvider> | undefined;
    let currentRefInFilter: boolean;

    beforeEach(() => {
        restoreJSDOM = enableJSDOM();
        scmContextKeys = createScmContextKeyService();
        currentRefInFilter = true;
        widget = new ScmHistoryGraphWidget();
        const raw = widget as unknown as Record<string, unknown>;
        raw.scmContextKeys = scmContextKeys;
        Object.defineProperty(raw, 'model', {
            get: () => ({ provider, isCurrentRefInFilter: () => currentRefInFilter })
        });
    });

    afterEach(() => {
        restoreJSDOM();
    });

    function updateContextKeys(): void {
        (widget as unknown as { updateContextKeys(): void }).updateContextKeys();
    }

    it('should set scmCurrentHistoryItemRefInFilter when the provider has a current ref', () => {
        provider = {
            currentHistoryItemRef: { id: 'refs/heads/main', name: 'main' }
        };
        updateContextKeys();
        expect(scmContextKeys.scmCurrentHistoryItemRefInFilter.get()).to.equal(true);
    });

    it('should clear scmCurrentHistoryItemRefInFilter when the provider has no current ref', () => {
        scmContextKeys.scmCurrentHistoryItemRefInFilter.set(true);
        provider = {};
        updateContextKeys();
        expect(scmContextKeys.scmCurrentHistoryItemRefInFilter.get()).to.equal(false);
    });

    it('should clear scmCurrentHistoryItemRefInFilter when there is no provider', () => {
        scmContextKeys.scmCurrentHistoryItemRefInFilter.set(true);
        provider = undefined;
        updateContextKeys();
        expect(scmContextKeys.scmCurrentHistoryItemRefInFilter.get()).to.equal(false);
    });

    it('should clear scmCurrentHistoryItemRefInFilter when the filter excludes the current ref', () => {
        provider = {
            currentHistoryItemRef: { id: 'refs/heads/main', name: 'main' }
        };
        currentRefInFilter = false;
        updateContextKeys();
        expect(scmContextKeys.scmCurrentHistoryItemRefInFilter.get()).to.equal(false);
    });

    it('should set scmCurrentHistoryItemRefHasRemote when the provider has a remote ref', () => {
        provider = {
            currentHistoryItemRef: { id: 'refs/heads/main', name: 'main' },
            currentHistoryItemRemoteRef: { id: 'refs/remotes/origin/main', name: 'origin/main' }
        };
        updateContextKeys();
        expect(scmContextKeys.scmCurrentHistoryItemRefHasRemote.get()).to.equal(true);
    });
});

describe('ScmHistoryGraphWidget reveal', () => {
    let restoreJSDOM: () => void;
    let widget: ScmHistoryGraphWidget;
    let requestReveal: Emitter<number>;
    let scrolledTo: { index: number; align?: string }[];

    beforeEach(() => {
        restoreJSDOM = enableJSDOM();
        requestReveal = new Emitter<number>();
        scrolledTo = [];

        widget = new ScmHistoryGraphWidget();
        const raw = widget as unknown as Record<string, unknown>;
        raw.scmContextKeys = createScmContextKeyService();
        raw.scmPreferences = { onPreferenceChanged: new Emitter<{ preferenceName: string }>().event };
        raw.model = {
            provider: undefined,
            entries: [],
            hasMore: false,
            loading: false,
            hasAttemptedLoad: true,
            isCurrentRefInFilter: () => true,
            onDidChange: new Emitter<void>().event,
            onDidRequestReveal: requestReveal.event
        };
        raw.listRef = { current: { scrollToIndex: (location: { index: number; align?: string }) => scrolledTo.push(location) } };
        // Rendering is out of scope here and would otherwise run asynchronously,
        // after JSDOM has been torn down again.
        raw.update = () => { };
        (widget as unknown as { init(): void }).init();
    });

    afterEach(async () => {
        widget.dispose();
        await flushReactWork();
        restoreJSDOM();
    });

    function selectedIndex(): number {
        return (widget as unknown as { selectedIndex: number }).selectedIndex;
    }

    it('should scroll to the entry the model asks to reveal', () => {
        requestReveal.fire(4);
        expect(scrolledTo).to.deep.equal([{ index: 4, align: 'center' }]);
    });

    it('should select the entry the model asks to reveal', () => {
        requestReveal.fire(4);
        expect(selectedIndex()).to.equal(4);
    });

    it('should stop revealing once disposed', () => {
        widget.dispose();
        requestReveal.fire(4);
        expect(scrolledTo).to.be.empty;
    });
});

const ROOT_URI = 'file:///repo';

/** Builds the change rows of `commit-1` in the given view mode. */
function renderChanges(widget: ScmHistoryGraphWidget, viewMode: 'list' | 'tree', paths: string[]): React.ReactElement {
    const raw = widget as unknown as Record<string, unknown>;
    raw.model = { viewMode };
    raw.scmService = { selectedRepository: { provider: { rootUri: ROOT_URI } } };
    raw.labelProvider = { getIcon: () => 'file-icon' };
    const changes: ScmHistoryItemChange[] = paths.map(path => ({
        uri: `${ROOT_URI}/${path}`,
        modifiedUri: `${ROOT_URI}/${path}`,
        originalUri: `${ROOT_URI}/${path}`
    }));
    const graphRow: GraphRow = { lane: 0, color: 0, topColor: 0, edges: [], hasContinuation: false, hasTopLine: false };
    const render = widget as unknown as {
        renderChangesRows(itemId: string, svgWidth: number, graphRow: GraphRow, changes: ScmHistoryItemChange[]): React.ReactElement;
    };
    return render.renderChangesRows('commit-1', 22, graphRow, changes);
}

function allElements(node: React.ReactNode): React.ReactElement[] {
    const result: React.ReactElement[] = [];
    const visit = (candidate: React.ReactNode): void => {
        if (Array.isArray(candidate)) {
            candidate.forEach(visit);
        } else if (React.isValidElement(candidate)) {
            result.push(candidate);
            visit((candidate.props as { children?: React.ReactNode }).children);
        }
    };
    visit(node);
    return result;
}

function elementsWithClass(node: React.ReactNode, className: string): React.ReactElement[] {
    return allElements(node).filter(element => {
        const elementClass = (element.props as { className?: unknown }).className;
        return typeof elementClass === 'string' && elementClass.includes(className);
    });
}

/** The rendered name of a row — the `name scm-history-change-name` span it holds. */
function nameOf(row: React.ReactElement): string {
    const name = allElements(row).find(element => (element.props as { className?: unknown }).className === 'name scm-history-change-name');
    return String((name?.props as { children?: unknown })?.children ?? '');
}

function folderLabels(rows: React.ReactElement): string[] {
    return elementsWithClass(rows, 'scm-history-change-folder-row').map(nameOf);
}

function fileNames(rows: React.ReactElement): string[] {
    return elementsWithClass(rows, 'scm-history-change-row')
        .filter(row => !((row.props as { className: string }).className.includes('scm-history-change-folder-row')))
        .map(nameOf);
}

describe('ScmHistoryGraphWidget change tree folders', () => {
    let restoreJSDOM: () => void;
    let widget: ScmHistoryGraphWidget;

    beforeEach(() => {
        restoreJSDOM = enableJSDOM();
        widget = new ScmHistoryGraphWidget();
        const raw = widget as unknown as Record<string, unknown>;
        raw.update = () => { };
    });

    afterEach(async () => {
        widget.dispose();
        await flushReactWork();
        restoreJSDOM();
    });

    function internals(): {
        isFolderCollapsed(itemId: string, path: string): boolean;
        toggleFolder(itemId: string, path: string): void;
        collapsedFolders: Map<string, Set<string>>;
    } {
        return widget as unknown as ReturnType<typeof internals>;
    }

    it('should show folders expanded by default', () => {
        expect(internals().isFolderCollapsed('commit-1', 'src')).to.be.false;
    });

    it('should collapse a folder on toggle', () => {
        internals().toggleFolder('commit-1', 'src');
        expect(internals().isFolderCollapsed('commit-1', 'src')).to.be.true;
    });

    it('should expand a collapsed folder on toggle', () => {
        internals().toggleFolder('commit-1', 'src');
        internals().toggleFolder('commit-1', 'src');
        expect(internals().isFolderCollapsed('commit-1', 'src')).to.be.false;
    });

    it('should keep folder state separate per history item', () => {
        internals().toggleFolder('commit-1', 'src');
        expect(internals().isFolderCollapsed('commit-2', 'src')).to.be.false;
    });

    it('should render a folder row per folder of the change tree', () => {
        const rows = renderChanges(widget, 'tree', ['src/browser/a.ts', 'src/node/b.ts']);
        expect(folderLabels(rows)).to.deep.equal(['src', 'browser', 'node']);
        expect(fileNames(rows)).to.deep.equal(['a.ts', 'b.ts']);
    });

    it('should render expanded folders with a down twistie', () => {
        const rows = renderChanges(widget, 'tree', ['src/a.ts']);
        expect(elementsWithClass(rows, 'codicon-chevron-down')).to.have.length(1);
    });

    it('should render a flat list of files without folder rows in list mode', () => {
        const rows = renderChanges(widget, 'list', ['src/browser/a.ts', 'src/node/b.ts']);
        expect(folderLabels(rows)).to.be.empty;
        expect(fileNames(rows)).to.deep.equal(['a.ts', 'b.ts']);
    });

    it('should drop the files of a collapsed folder and turn its twistie', () => {
        internals().toggleFolder('commit-1', 'src');
        const rows = renderChanges(widget, 'tree', ['src/browser/a.ts', 'src/node/b.ts']);
        expect(folderLabels(rows)).to.deep.equal(['src']);
        expect(fileNames(rows)).to.be.empty;
        expect(elementsWithClass(rows, 'codicon-chevron-right')).to.have.length(1);
    });

    it('should forget folder state when the history item is collapsed again', () => {
        const raw = widget as unknown as { expandedIds: Set<string>; handleRowClick(idx: number, entry: unknown): void };
        raw.expandedIds.add('commit-1');
        internals().toggleFolder('commit-1', 'src');

        raw.handleRowClick(0, { item: { id: 'commit-1' } });

        expect(internals().collapsedFolders.has('commit-1')).to.be.false;
    });
});
