/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject, postConstruct } from 'inversify';
import { Message } from '@phosphor/messaging';
import URI from '@theia/core/lib/common/uri';
import { CommandService, SelectionService } from '@theia/core/lib/common';
import { CommonCommands } from '@theia/core/lib/browser';
import {
    ContextMenuRenderer, ExpandableTreeNode,
    TreeProps, TreeModel, TreeNode,
    SelectableTreeNode, CompositeTreeNode
} from '@theia/core/lib/browser';
import { FileTreeWidget, FileNode } from '@theia/filesystem/lib/browser';
import { WorkspaceService, WorkspaceCommands } from '@theia/workspace/lib/browser';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { WorkspaceNode } from './navigator-tree';
import { FileNavigatorModel } from './navigator-model';
import { FileSystem } from '@theia/filesystem/lib/common/filesystem';
import * as React from 'react';

export const FILE_NAVIGATOR_ID = 'files';
export const LABEL = 'Files';
export const CLASS = 'theia-Files';

@injectable()
export class FileNavigatorWidget extends FileTreeWidget {

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(FileNavigatorModel) readonly model: FileNavigatorModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer,
        @inject(CommandService) protected readonly commandService: CommandService,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(ApplicationShell) protected readonly shell: ApplicationShell,
        @inject(FileSystem) protected readonly fileSystem: FileSystem
    ) {
        super(props, model, contextMenuRenderer);
        this.id = FILE_NAVIGATOR_ID;
        this.title.label = LABEL;
        this.title.caption = LABEL;
        this.title.iconClass = 'fa navigator-tab-icon';
        this.addClass(CLASS);
        this.initialize();
    }

    @postConstruct()
    protected init(): void {
        super.init();
        this.toDispose.pushAll([
            this.model.onSelectionChanged(selection => {
                if (this.shell.activeWidget === this) {
                    this.selectionService.selection = selection;
                }
            }),
            this.model.onExpansionChanged(node => {
                if (node.expanded && node.children.length === 1) {
                    const child = node.children[0];
                    if (ExpandableTreeNode.is(child) && !child.expanded) {
                        this.model.expandNode(child);
                    }
                }
            })
        ]);
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.selectionService.selection = this.model.selectedNodes;
        const root = this.model.root;
        if (CompositeTreeNode.is(root) && root.children.length === 1) {
            const child = root.children[0];
            if (SelectableTreeNode.is(child) && !child.selected && ExpandableTreeNode.is(child)) {
                this.model.selectNode(child);
                this.model.expandNode(child);
            }
        }
    }

    protected async initialize(): Promise<void> {
        await this.model.updateRoot();
    }

    protected enableDndOnMainPanel(): void {
        const mainPanelNode = this.shell.mainPanel.node;
        this.addEventListener(mainPanelNode, 'drop', async e => {
            const treeNode = this.getTreeNodeFromData(e.dataTransfer);

            if (FileNode.is(treeNode)) {
                this.commandService.executeCommand(CommonCommands.OPEN.id, treeNode.uri);
            }
        });
        const handler = (e: DragEvent) => {
            e.dataTransfer.dropEffect = 'link';
            e.preventDefault();
        };
        this.addEventListener(mainPanelNode, 'dragover', handler);
        this.addEventListener(mainPanelNode, 'dragenter', handler);
    }

    protected getContainerTreeNode(): TreeNode | undefined {
        const root = this.model.root;
        if (this.workspaceService.isMultiRootWorkspaceOpened) {
            return root;
        }
        if (WorkspaceNode.is(root)) {
            return root.children[0];
        }
        return undefined;
    }

    protected deflateForStorage(node: TreeNode): object {
        // tslint:disable-next-line:no-any
        const copy = { ...node } as any;
        if (copy.uri) {
            copy.uri = copy.uri.toString();
        }
        return super.deflateForStorage(copy);
    }

    // tslint:disable-next-line:no-any
    protected inflateFromStorage(node: any, parent?: TreeNode): TreeNode {
        if (node.uri) {
            node.uri = new URI(node.uri);
        }
        return super.inflateFromStorage(node, parent);
    }

    protected renderTree(model: TreeModel): React.ReactNode {
        return super.renderTree(model) || this.renderOpenWorkspaceDiv();
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.addClipboardListener(this.node, 'copy', e => this.handleCopy(e));
        this.addClipboardListener(this.node, 'paste', e => this.handlePaste(e));
        this.enableDndOnMainPanel();
    }

    protected handleCopy(event: ClipboardEvent): void {
        const uris = this.model.selectedFileStatNodes.map(node => node.uri.toString());
        if (uris.length > 0) {
            event.clipboardData.setData('text/plain', uris.join('\n'));
            event.preventDefault();
        }
    }

    protected handlePaste(event: ClipboardEvent): void {
        const raw = event.clipboardData.getData('text/plain');
        if (!raw) {
            return;
        }
        const uri = new URI(raw);
        if (this.model.copy(uri)) {
            event.preventDefault();
        }
    }

    protected readonly openWorkspace = () => this.doOpenWorkspace();
    protected doOpenWorkspace() {
        this.commandService.executeCommand(WorkspaceCommands.OPEN_WORKSPACE.id);
    }

    /**
     * Instead of rendering the file resources from the workspace, we render a placeholder
     * button when the workspace root is not yet set.
     */
    protected renderOpenWorkspaceDiv(): React.ReactNode {
        return <div className='theia-navigator-container'>
            <div className='center'>You have not yet opened a workspace.</div>
            <div className='open-workspace-button-container'>
                <button className='open-workspace-button' title='Select a folder as your workspace root' onClick={this.openWorkspace}>
                    Open Workspace
                </button>
            </div>
        </div>;
    }

}
