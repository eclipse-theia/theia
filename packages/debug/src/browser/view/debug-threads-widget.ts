/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject, postConstruct, interfaces, Container } from '@theia/core/shared/inversify';
import { MenuPath } from '@theia/core';
import { TreeNode, NodeProps, SelectableTreeNode } from '@theia/core/lib/browser';
import { SourceTreeWidget, TreeElementNode } from '@theia/core/lib/browser/source-tree';
import { DebugThreadsSource } from './debug-threads-source';
import { DebugSession } from '../debug-session';
import { DebugThread } from '../model/debug-thread';
import { DebugViewModel } from '../view/debug-view-model';
import { DebugCallStackItemTypeKey } from '../debug-call-stack-item-type-key';

@injectable()
export class DebugThreadsWidget extends SourceTreeWidget {

    static CONTEXT_MENU: MenuPath = ['debug-threads-context-menu'];
    static CONTROL_MENU = [...DebugThreadsWidget.CONTEXT_MENU, 'a_control'];
    static TERMINATE_MENU = [...DebugThreadsWidget.CONTEXT_MENU, 'b_terminate'];
    static OPEN_MENU = [...DebugThreadsWidget.CONTEXT_MENU, 'c_open'];
    static createContainer(parent: interfaces.Container): Container {
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
    protected init(): void {
        super.init();
        this.id = 'debug:threads:' + this.viewModel.id;
        this.title.label = 'Threads';
        this.toDispose.push(this.threads);
        this.source = this.threads;

        this.toDispose.push(this.viewModel.onDidChange(() => this.updateWidgetSelection()));
        this.toDispose.push(this.model.onSelectionChanged(() => this.updateModelSelection()));
    }

    protected updatingSelection = false;
    protected updateWidgetSelection(): void {
        if (this.updatingSelection) {
            return;
        }
        this.updatingSelection = true;
        try {
            const { currentThread } = this.viewModel;
            if (currentThread) {
                const node = this.model.getNode(currentThread.id);
                if (SelectableTreeNode.is(node)) {
                    this.model.selectNode(node);
                }
            }
        } finally {
            this.updatingSelection = false;
        }
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
                    node.element.session.currentThread = node.element;
                    this.debugCallStackItemTypeKey.set('thread');
                }
            }
        } finally {
            this.updatingSelection = false;
        }
    }

    protected toContextMenuArgs(node: SelectableTreeNode): [number] | undefined {
        if (TreeElementNode.is(node) && node.element instanceof DebugThread) {
            return [node.element.raw.id];
        }
        return undefined;
    }

    protected getDefaultNodeStyle(node: TreeNode, props: NodeProps): React.CSSProperties | undefined {
        if (this.threads.multiSession) {
            return super.getDefaultNodeStyle(node, props);
        }
        return undefined;
    }

}
