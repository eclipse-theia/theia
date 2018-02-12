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
import { ContextMenuRenderer, TreeProps, ITreeModel, ITreeNode, TreeDecoratorService } from '@theia/core/lib/browser';
import { FileTreeWidget, DirNode } from "@theia/filesystem/lib/browser";
import { FileNavigatorModel } from "./navigator-model";
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-frontend-contribution';
import { SelectionService } from '@theia/core/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { h } from "@phosphor/virtualdom/lib";

export const FILE_STAT_NODE_CLASS = 'theia-FileStatNode';
export const DIR_NODE_CLASS = 'theia-DirNode';
export const FILE_STAT_ICON_CLASS = 'theia-FileStatIcon';

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
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        @inject(TreeDecoratorService) protected readonly decoratorService: TreeDecoratorService
    ) {
        super(props, model, contextMenuRenderer, decoratorService);
        this.id = FILE_NAVIGATOR_ID;
        this.title.label = LABEL;
        this.addClass(CLASS);
        this.initialize();
    }

    protected initialize(): void {
        this.model.onSelectionChanged(selection =>
            this.selectionService.selection = selection
        );

        this.workspaceService.root.then(async resolvedRoot => {
            if (resolvedRoot) {
                const uri = new URI(resolvedRoot.uri);
                const label = this.labelProvider.getName(uri);
                const icon = await this.labelProvider.getIcon(resolvedRoot);
                this.model.root = DirNode.createRoot(resolvedRoot, label, icon);
            } else {
                this.update();
            }
        });
    }

    protected deflateForStorage(node: ITreeNode): object {
        const copy = Object.assign({}, node) as any;
        if (copy.uri) {
            copy.uri = copy.uri.toString();
        }
        return super.deflateForStorage(copy);
    }

    protected inflateFromStorage(node: any, parent?: ITreeNode): ITreeNode {
        if (node.uri) {
            node.uri = new URI(node.uri);
        }
        return super.inflateFromStorage(node, parent);
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
        return h.div({ className: 'theia-navigator-container' }, 'You have not yet opened a workspace.', buttonContainer);
    }

}
