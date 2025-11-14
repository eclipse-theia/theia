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

        this.toDispose.push(this.viewModel.onDidChange(() => this.updateWidgetSelection()));
    }

    protected updatingSelection = false;
    protected async updateWidgetSelection(): Promise<void> {
        if (this.updatingSelection) {
            return;
        }
        this.updatingSelection = true;
        try {
            const { currentThread } = this.viewModel;
            if (currentThread) {
                // Refresh and wait for node to appear with retries
                const node = await this.waitForNode(currentThread);

                if (node) {
                    if (SelectableTreeNode.is(node)) {
                        // Expand parent nodes if needed to make the selected node visible
                        await this.expandAncestors(node);

                        // Select the node (this will trigger scrolling via the tree widget's mechanism)
                        this.model.selectNode(node);

                        // Set context key based on what's selected
                        if (TreeElementNode.is(node)) {
                            if (node.element instanceof DebugThread) {
                                this.debugCallStackItemTypeKey.set('thread');
                            } else if (node.element instanceof DebugSession) {
                                this.debugCallStackItemTypeKey.set('session');
                            }
                        }
                    }
                }
            }
        } finally {
            this.updatingSelection = false;
        }
    }

    /**
     * Wait for a node to appear in the tree, expanding all nodes recursively
     */
    protected async waitForNode(thread: DebugThread): Promise<TreeNode | undefined> {
        const maxAttempts = 10;
        const delayMs = 50;
        const threadId = thread.id;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await this.model.refresh();

            // First, try to find the thread node directly
            let node = this.model.getNode(threadId);
            if (node) {
                return node;
            }

            // If not found, recursively expand all nodes in the tree
            const root = this.model.root;
            if (CompositeTreeNode.is(root)) {
                await this.expandAllNodes(root);

                // After expanding, try again
                node = this.model.getNode(threadId);
                if (node) {
                    return node;
                }
            }

            // If not found, wait and retry
            if (attempt < maxAttempts - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        return undefined;
    }

    /**
     * Recursively expand all expandable nodes in the tree
     */
    protected async expandAllNodes(parent: CompositeTreeNode): Promise<void> {
        for (const child of parent.children) {
            if (ExpandableTreeNode.is(child) && !child.expanded) {
                await this.model.expandNode(child);
            }
            if (CompositeTreeNode.is(child) && child.children.length > 0) {
                await this.expandAllNodes(child);
            }
        }
    }

    /**
     * Expand all collapsed ancestors of the given node to make it visible.
     */
    protected async expandAncestors(node: TreeNode): Promise<void> {
        const ancestors: ExpandableTreeNode[] = [];
        let current = node.parent;
        // Collect all collapsed ancestors from bottom to top
        while (current) {
            if (ExpandableTreeNode.is(current)) {
                if (!current.expanded) {
                    ancestors.push(current);
                }
            }
            current = current.parent;
        }
        // Expand from top to bottom to ensure proper tree structure
        for (let i = ancestors.length - 1; i >= 0; i--) {
            await this.model.expandNode(ancestors[i]);
        }
    }

    protected override toContextMenuArgs(node: SelectableTreeNode): [number] | undefined {
        if (TreeElementNode.is(node) && node.element instanceof DebugThread) {
            return [node.element.raw.id];
        }
        return undefined;
    }

    protected override tapNode(node?: TreeNode): void {
        // Disable user selection - do not call super or modify selection
        // Only programmatic selection via updateWidgetSelection is allowed
    }

    protected override getDefaultNodeStyle(node: TreeNode, props: NodeProps): React.CSSProperties | undefined {
        if (this.threads.multiSession) {
            return super.getDefaultNodeStyle(node, props);
        }
        return undefined;
    }

}
