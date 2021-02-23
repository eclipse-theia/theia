/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { DebugStackFramesSource, LoadMoreStackFrames } from './debug-stack-frames-source';
import { DebugStackFrame } from '../model/debug-stack-frame';
import { DebugViewModel } from './debug-view-model';
import { DebugCallStackItemTypeKey } from '../debug-call-stack-item-type-key';

@injectable()
export class DebugStackFramesWidget extends SourceTreeWidget {

    static CONTEXT_MENU: MenuPath = ['debug-frames-context-menu'];
    static createContainer(parent: interfaces.Container): Container {
        const child = SourceTreeWidget.createContainer(parent, {
            contextMenuPath: DebugStackFramesWidget.CONTEXT_MENU,
            virtualized: false,
            scrollIfActive: true
        });
        child.bind(DebugStackFramesSource).toSelf();
        child.unbind(SourceTreeWidget);
        child.bind(DebugStackFramesWidget).toSelf();
        return child;
    }
    static createWidget(parent: interfaces.Container): DebugStackFramesWidget {
        return DebugStackFramesWidget.createContainer(parent).get(DebugStackFramesWidget);
    }

    @inject(DebugStackFramesSource)
    protected readonly frames: DebugStackFramesSource;

    @inject(DebugViewModel)
    protected readonly viewModel: DebugViewModel;

    @inject(DebugCallStackItemTypeKey)
    protected readonly debugCallStackItemTypeKey: DebugCallStackItemTypeKey;

    @postConstruct()
    protected init(): void {
        super.init();
        this.id = 'debug:frames:' + this.viewModel.id;
        this.title.label = 'Call Stack';
        this.toDispose.push(this.frames);
        this.source = this.frames;

        this.toDispose.push(this.viewModel.onDidChange(() => this.updateWidgetSelection()));
        this.toDispose.push(this.model.onNodeRefreshed(() => this.updateWidgetSelection()));
        this.toDispose.push(this.model.onSelectionChanged(() => this.updateModelSelection()));
    }

    protected updatingSelection = false;
    protected async updateWidgetSelection(): Promise<void> {
        if (this.updatingSelection) {
            return;
        }
        this.updatingSelection = true;
        try {
            const { currentFrame } = this.viewModel;
            if (currentFrame) {
                const node = this.model.getNode(currentFrame.id);
                if (SelectableTreeNode.is(node)) {
                    this.model.selectNode(node);
                }
            }
        } finally {
            this.updatingSelection = false;
        }
    }
    protected async updateModelSelection(): Promise<void> {
        if (this.updatingSelection) {
            return;
        }
        this.updatingSelection = true;
        try {
            const node = this.model.selectedNodes[0];
            if (TreeElementNode.is(node)) {
                if (node.element instanceof DebugStackFrame) {
                    node.element.thread.currentFrame = node.element;
                    this.debugCallStackItemTypeKey.set('stackFrame');
                }
            }
        } finally {
            this.updatingSelection = false;
        }
    }

    protected toContextMenuArgs(node: SelectableTreeNode): [string | number] | undefined {
        if (TreeElementNode.is(node)) {
            if (node.element instanceof DebugStackFrame) {
                const source = node.element.source;
                if (source) {
                    if (source.inMemory) {
                        const path = source.raw.path || source.raw.sourceReference;
                        if (path !== undefined) {
                            return [path];
                        }
                    } else {
                        return [source.uri.toString()];
                    }
                }
            }
        }
        return undefined;
    }

    protected handleClickEvent(node: TreeNode | undefined, event: React.MouseEvent<HTMLElement>): void {
        if (TreeElementNode.is(node) && node.element instanceof LoadMoreStackFrames) {
            node.element.open();
        }
        super.handleClickEvent(node, event);
    }

    protected getDefaultNodeStyle(node: TreeNode, props: NodeProps): React.CSSProperties | undefined {
        return undefined;
    }

}
