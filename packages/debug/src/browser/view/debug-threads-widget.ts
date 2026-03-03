// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject, postConstruct, interfaces, Container } from '@theia/core/shared/inversify';
import { MenuPath } from '@theia/core';
import { TreeNode, NodeProps, SelectableTreeNode, CompositeTreeNode } from '@theia/core/lib/browser';
import { SourceTreeWidget, TreeElementNode } from '@theia/core/lib/browser/source-tree';
import { ExpandableTreeNode } from '@theia/core/lib/browser/tree/tree-expansion';
import { DebugThreadsSource } from './debug-threads-source';
import { DebugSession } from '../debug-session';
import { DebugThread } from '../model/debug-thread';
import { DebugViewModel } from '../view/debug-view-model';
import { DebugCallStackItemTypeKey } from '../debug-call-stack-item-type-key';
import { nls } from '@theia/core/lib/common/nls';

@injectable()
export class DebugThreadsWidget extends SourceTreeWidget {

    static CONTEXT_MENU: MenuPath = ['debug-threads-context-menu'];
    static CONTROL_MENU = [...DebugThreadsWidget.CONTEXT_MENU, 'a_control'];
    static TERMINATE_MENU = [...DebugThreadsWidget.CONTEXT_MENU, 'b_terminate'];
    static OPEN_MENU = [...DebugThreadsWidget.CONTEXT_MENU, 'c_open'];
    static FACTORY_ID = 'debug:threads';
    static override createContainer(parent: interfaces.Container): Container {
        const child = SourceTreeWidget.createContainer(parent, {
            contextMenuPath: DebugThreadsWidget.CONTEXT_MENU,
            virtualized: false,
            scrollIfActive: true
        });
        child.bind(DebugThreadsSource).toSelf();
        child.unbind(SourceTreeWidget);
        child.bind(DebugThreadsWidget).toSelf();
        return child;
    }
    static createWidget(parent: interfaces.Container): DebugThreadsWidget {
        return DebugThreadsWidget.createContainer(parent).get(DebugThreadsWidget);
    }

    @inject(DebugThreadsSource)
    protected readonly threads: DebugThreadsSource;

    @inject(DebugViewModel)
    protected readonly viewModel: DebugViewModel;

    @inject(DebugCallStackItemTypeKey)
    protected readonly debugCallStackItemTypeKey: DebugCallStackItemTypeKey;

    @postConstruct()
    protected override init(): void {
        super.init();
        this.id = DebugThreadsWidget.FACTORY_ID + ':' + this.viewModel.id;
        this.title.label = nls.localize('theia/debug/threads', 'Threads');
        this.toDispose.push(this.threads);
        this.source = this.threads;

        this.toDispose.push(this.viewModel.onDidChange(() => {
            this.updateWidgetSelection();
        }));
        this.toDispose.push(this.model.onSelectionChanged(() => this.updateModelSelection()));
    }

    protected updatingSelection = false;
    protected async updateWidgetSelection(): Promise<void> {
        if (this.updatingSelection) {
            return;
        }
        this.updatingSelection = true;
        try {
            await this.model.refresh();

            const { currentThread } = this.viewModel;

            // Check if current selection still exists in the tree
            const selectedNode = this.model.selectedNodes[0];
            const selectionStillValid = selectedNode && this.model.getNode(selectedNode.id);

            // Only update selection if:
            // 1. Current selection is invalid (node no longer in tree), OR
            // 2. There's a stopped thread to show
            if (selectionStillValid && (!currentThread || !currentThread.stopped)) {
                return;
            }

            // Try to select the current stopped thread, or clear if none
            if (currentThread && currentThread.stopped) {
                const node = await this.waitForNode(currentThread);

                // Re-check stopped state after async wait
                if (!currentThread.stopped) {
                    return;
                }

                if (node && SelectableTreeNode.is(node)) {
                    this.model.selectNode(node);

                    // Set context key
                    if (TreeElementNode.is(node)) {
                        if (node.element instanceof DebugThread) {
                            this.debugCallStackItemTypeKey.set('thread');
                        } else if (node.element instanceof DebugSession) {
                            this.debugCallStackItemTypeKey.set('session');
                        }
                    }
                }
            } else if (!selectionStillValid) {
                // Selection is stale and no stopped thread to select
                this.model.clearSelection();
            }
        } finally {
            this.updatingSelection = false;
        }
    }

    /**
     * Wait for a node to appear in the tree, expanding root children to populate the tree
     */
    protected async waitForNode(thread: DebugThread): Promise<TreeNode | undefined> {
        const maxAttempts = 10;
        const delayMs = 50;
        const threadId = thread.id;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // If thread continued during wait, abort
            if (!thread.stopped) {
                return undefined;
            }

            await this.model.refresh();

            const root = this.model.root;

            // Expand all root's direct children to populate the tree
            if (root && CompositeTreeNode.is(root)) {
                for (const child of root.children) {
                    if (ExpandableTreeNode.is(child) && !child.expanded) {
                        await this.model.expandNode(child);
                    }
                }
            }

            // Now look directly for the thread node
            const threadNode = this.model.getNode(threadId);
            if (threadNode) {
                return threadNode;
            }

            if (attempt < maxAttempts - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        return undefined;
    }

    protected updateModelSelection(): void {
        if (this.updatingSelection) {
            return;
        }
        this.updatingSelection = true;
        try {
            const node = this.model.selectedNodes[0];
            if (TreeElementNode.is(node)) {
                if (node.element instanceof DebugSession) {
                    this.viewModel.currentSession = node.element;
                    this.debugCallStackItemTypeKey.set('session');
                } else if (node.element instanceof DebugThread) {
                    this.viewModel.currentSession = node.element.session;
                    node.element.session.currentThread = node.element;
                    this.debugCallStackItemTypeKey.set('thread');
                }
            }
        } finally {
            this.updatingSelection = false;
        }
    }

    protected override toContextMenuArgs(node: SelectableTreeNode): [number] | undefined {
        if (TreeElementNode.is(node) && node.element instanceof DebugThread) {
            return [node.element.raw.id];
        }
        return undefined;
    }

    protected override getDefaultNodeStyle(node: TreeNode, props: NodeProps): React.CSSProperties | undefined {
        if (this.threads.multiSession) {
            return super.getDefaultNodeStyle(node, props);
        }
        return undefined;
    }

}
