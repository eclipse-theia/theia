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

import { enableJSDOM } from '../test/jsdom';

// The widget module transitively imports `@lumino/widgets`, which touches `document` at load time.
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { CompositeTreeNode, TreeNode } from './tree';
import { ExpandableTreeNode } from './tree-expansion';
import { TreeFocusService } from './tree-focus-service';
import { TreeModel } from './tree-model';
import { defaultTreeProps, TreeWidget } from './tree-widget';
import { ContextMenuRenderer } from '../context-menu-renderer';

disableJSDOM();

class CountingView extends TreeWidget.View {
    scrollCount = 0;
    protected override readonly scrollIntoViewIfNeeded = (): void => {
        if (this.list && this.props.scrollToRow !== undefined) {
            this.scrollCount++;
        }
    };
}

class TestTreeWidget extends TreeWidget {
    focusedNode: TreeNode | undefined;
    scrollToSelectedCount = 0;
    override update(): void { }
    protected override scrollToSelected(): void {
        this.scrollToSelectedCount++;
    }
    get RowRenderer(): typeof this.ScrollingRowRenderer {
        return this.ScrollingRowRenderer;
    }
    get currentScrollToRow(): number | undefined {
        return this.scrollToRow;
    }
    get currentScrollToRowRequestId(): number {
        return this.scrollToRowRequestId;
    }
    requestScrollToFocus(): void {
        this.updateScrollToRow();
    }
    doUpdateRowsNow(): void {
        this.doUpdateRows();
    }
}

function createTreeRoot(...children: TreeNode[]): CompositeTreeNode {
    const root: CompositeTreeNode = { id: 'root', name: 'root', parent: undefined, visible: false, children: [] };
    return CompositeTreeNode.addChildren(root, children);
}

function leaf(id: string): TreeNode {
    return { id, name: id, parent: undefined, visible: true };
}

describe('TreeWidget', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('scroll requests', () => {

        let widget: TestTreeWidget;
        let model: { root: TreeNode | undefined };

        beforeEach(() => {
            model = { root: undefined };
            widget = new TestTreeWidget(defaultTreeProps, model as unknown as TreeModel, {} as ContextMenuRenderer);
            Object.assign(widget, {
                focusService: { get focusedNode(): TreeNode | undefined { return widget.focusedNode; } } as TreeFocusService,
                scheduleUpdateScrollToRow: () => widget.requestScrollToFocus()
            });
        });

        afterEach(() => widget.dispose());

        it('scrolls to the focused row when a scroll is requested', () => {
            const target = leaf('target');
            model.root = createTreeRoot(leaf('a'), leaf('b'), target);
            widget.doUpdateRowsNow();
            widget.focusedNode = target;
            const requestId = widget.currentScrollToRowRequestId;

            widget.requestScrollToFocus();

            expect(widget.currentScrollToRow).to.equal(2);
            expect(widget.currentScrollToRowRequestId).to.not.equal(requestId);
        });

        it('does not scroll again when the rows update after the request was served', () => {
            const target = leaf('target');
            model.root = createTreeRoot(leaf('a'), target);
            widget.doUpdateRowsNow();
            widget.focusedNode = target;
            widget.requestScrollToFocus();
            const requestId = widget.currentScrollToRowRequestId;

            // A file created above the focused node shifts its row.
            model.root = createTreeRoot(leaf('a'), leaf('new'), target);
            widget.doUpdateRowsNow();

            expect(widget.currentScrollToRow).to.equal(1);
            expect(widget.currentScrollToRowRequestId).to.equal(requestId);
        });

        it('keeps a request pending until the rows contain the focused node', () => {
            const target = leaf('target');
            const folder: ExpandableTreeNode = { id: 'folder', name: 'folder', parent: undefined, visible: true, expanded: false, children: [] };
            CompositeTreeNode.addChild(folder, target);
            model.root = createTreeRoot(leaf('a'), folder);
            widget.doUpdateRowsNow();
            widget.focusedNode = target;

            widget.requestScrollToFocus();
            expect(widget.currentScrollToRow).to.be.undefined;
            const requestId = widget.currentScrollToRowRequestId;

            // The reveal expands the collapsed parent.
            folder.expanded = true;
            widget.doUpdateRowsNow();

            expect(widget.currentScrollToRow).to.equal(2);
            expect(widget.currentScrollToRowRequestId).to.not.equal(requestId);

            // Once served, a later rows update does not scroll again.
            const servedRequestId = widget.currentScrollToRowRequestId;
            widget.doUpdateRowsNow();
            expect(widget.currentScrollToRowRequestId).to.equal(servedRequestId);
        });
    });

    describe('non-virtualized rows', () => {

        let container: HTMLElement;
        let root: Root;
        let widget: TestTreeWidget;

        const render = (scrollToRowRequestId: number): void => flushSync(() => root.render(
            <widget.RowRenderer rows={[]} scrollToRowRequestId={scrollToRowRequestId} />
        ));

        beforeEach(() => {
            widget = new TestTreeWidget({ ...defaultTreeProps, virtualized: false }, { root: undefined } as unknown as TreeModel, {} as ContextMenuRenderer);
            container = document.createElement('div');
            document.body.appendChild(container);
            root = createRoot(container);
        });

        afterEach(() => {
            flushSync(() => root.unmount());
            document.body.removeChild(container);
            widget.dispose();
        });

        it('scrolls to the selection once per scroll request, not on every render', () => {
            render(1);
            const scrollsAfterMount = widget.scrollToSelectedCount;

            render(1);
            render(1);
            expect(widget.scrollToSelectedCount).to.equal(scrollsAfterMount);

            render(2);
            expect(widget.scrollToSelectedCount).to.equal(scrollsAfterMount + 1);
        });
    });

    describe('View', () => {

        let container: HTMLElement;
        let root: Root;
        let view: CountingView | undefined;
        const rows: TreeWidget.NodeRow[] = [0, 1, 2].map(index => ({ index, depth: 0, node: leaf(`node-${index}`) }));

        const render = (props: Partial<TreeWidget.ViewProps>): void => flushSync(() => root.render(
            <CountingView
                ref={instance => { view = instance ?? undefined; }}
                width={100}
                height={100}
                rows={rows}
                renderNodeRow={row => <div>{row.node.id}</div>}
                {...props}
            />
        ));

        beforeEach(() => {
            container = document.createElement('div');
            document.body.appendChild(container);
            root = createRoot(container);
        });

        afterEach(() => {
            flushSync(() => root.unmount());
            document.body.removeChild(container);
        });

        it('does not scroll again when re-rendered without a new scroll request', () => {
            render({ scrollToRow: 2, scrollToRowRequestId: 1 });
            const scrollsAfterMount = view!.scrollCount;

            render({ scrollToRow: 2, scrollToRowRequestId: 1 });
            render({ scrollToRow: 2, scrollToRowRequestId: 1 });

            expect(view!.scrollCount).to.equal(scrollsAfterMount);
        });

        it('scrolls again when a new scroll request arrives for the same row', () => {
            render({ scrollToRow: 2, scrollToRowRequestId: 1 });
            const scrollsAfterMount = view!.scrollCount;

            render({ scrollToRow: 2, scrollToRowRequestId: 2 });

            expect(view!.scrollCount).to.equal(scrollsAfterMount + 1);
        });

        it('scrolls when the row to scroll to changes', () => {
            render({ scrollToRow: 1 });
            const scrollsAfterMount = view!.scrollCount;

            render({ scrollToRow: 2 });

            expect(view!.scrollCount).to.equal(scrollsAfterMount + 1);
        });
    });
});
