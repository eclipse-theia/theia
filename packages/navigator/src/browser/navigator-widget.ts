/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Message } from "@phosphor/messaging";
import URI from "@theia/core/lib/common/uri";
import { CommandService } from '@theia/core/lib/common/command';
import { ContextMenuRenderer, TreeProps, ITreeModel, StatefulWidget, ITreeNode } from '@theia/core/lib/browser';
import { FileTreeWidget } from "@theia/filesystem/lib/browser";
import { FileNavigatorModel } from "./navigator-model";
import { FileIconProvider } from '@theia/filesystem/lib/browser/icons/file-icons';
import { h } from "@phosphor/virtualdom/lib";
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-frontend-contribution';
import { FileNavigatorTree } from './navigator-tree';
import { ICompositeTreeNode } from '../../../core/lib/browser/tree/tree';

export const FILE_STAT_NODE_CLASS = 'theia-FileStatNode';
export const DIR_NODE_CLASS = 'theia-DirNode';
export const FILE_STAT_ICON_CLASS = 'theia-FileStatIcon';

export const FILE_NAVIGATOR_ID = 'files';
export const LABEL = 'Files';
export const CLASS = 'theia-Files';

@injectable()
export class FileNavigatorWidget extends FileTreeWidget implements StatefulWidget {

    private deflateForStorage(node: ITreeNode): object {
        const copy = Object.assign({}, node) as any;
        if (copy.uri) {
            copy.uri = copy.uri.toString();
        }
        if (copy.parent) {
            delete copy.parent;
        }
        if (ICompositeTreeNode.is(node)) {
            copy.children = []
            for (const child of node.children) {
                copy.children.push(this.deflateForStorage(child));
            }
        }
        return copy;
    }

    private inflateFromStorage(node: any, parent?: ITreeNode): ITreeNode {
        if (parent) {
            node.parent = parent;
        }
        if (node.uri) {
            node.uri = new URI(node.uri);
        }
        if (node.selected) {
            node.selected = false;
        }
        if (Array.isArray(node.children)) {
            for (const child of node.children as ITreeNode[]) {
                this.inflateFromStorage(child, node);
            }
        }
        return node;
    }

    storeState(): object {
        return this.deflateForStorage(this.tree.root!);
    }
    restoreState(oldState: object): void {
        this.tree.root = this.inflateFromStorage(oldState);
    }

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(FileNavigatorModel) readonly model: FileNavigatorModel,
        @inject(FileNavigatorTree) readonly tree: FileNavigatorTree,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer,
        @inject(FileIconProvider) iconProvider: FileIconProvider,
        @inject(CommandService) protected readonly commandService: CommandService
    ) {
        super(props, model, contextMenuRenderer, iconProvider);
        this.id = FILE_NAVIGATOR_ID;
        this.title.label = LABEL;
        this.addClass(CLASS);
    }

    protected renderTree(model: ITreeModel): h.Child {
        return super.renderTree(model) || this.renderOpenWorkspaceDiv();
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.addClipboardListener(this.node, 'copy', e => this.handleCopy(e));
        this.addClipboardListener(this.node, 'paste', e => this.handlePaste(e));
    }

    protected handleCopy(event: ClipboardEvent): void {
        const node = this.model.selectedFileStatNode;
        if (!node) {
            return;
        }
        const uri = node.uri.toString();
        event.clipboardData.setData('text/plain', uri);
        event.preventDefault();
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

    /**
     * Instead of rendering the file resources form the workspace, we render a placeholder
     * button when the workspace root is not yet set.
     */
    protected renderOpenWorkspaceDiv(): h.Child {
        const button = h.button({
            className: 'open-workspace-button',
            title: 'Select a directory as your workspace root',
            onclick: e => this.commandService.executeCommand(WorkspaceCommands.OPEN.id)
        }, 'Open Workspace');
        const buttonContainer = h.div({ className: 'open-workspace-button-container' }, button);
        return h.div({ className: 'theia-workspace-container' }, 'You have not yet opened a workspace.', buttonContainer);
    }

}
