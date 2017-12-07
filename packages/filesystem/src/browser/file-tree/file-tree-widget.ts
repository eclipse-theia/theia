/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { h } from "@phosphor/virtualdom";
import { Message } from "@phosphor/messaging";
import {
    ContextMenuRenderer, VirtualRenderer,
    TreeWidget, NodeProps, TreeProps, ITreeNode, ISelectableTreeNode,
} from "@theia/core/lib/browser";
import { ElementAttrs } from "@phosphor/virtualdom";
import { DirNode, FileStatNode } from "./file-tree";
import { FileTreeModel } from "./file-tree-model";
import { ILogger } from '@theia/core/lib/common';

export const FILE_TREE_CLASS = 'theia-FileTree';
export const FILE_STAT_NODE_CLASS = 'theia-FileStatNode';
export const DIR_NODE_CLASS = 'theia-DirNode';
export const FILE_STAT_ICON_CLASS = 'theia-FileStatIcon';
const activeDropZone = 'theia-ActiveDropZone';

@injectable()
export class FileTreeWidget extends TreeWidget {

    constructor(
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(TreeProps) readonly props: TreeProps,
        @inject(FileTreeModel) readonly model: FileTreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);
        this.addClass(FILE_TREE_CLASS);
    }

    protected createNodeClassNames(node: ITreeNode, props: NodeProps): string[] {
        const classNames = super.createNodeClassNames(node, props);
        if (FileStatNode.is(node)) {
            classNames.push(FILE_STAT_NODE_CLASS);
        }
        if (DirNode.is(node)) {
            classNames.push(DIR_NODE_CLASS);
        }
        return classNames;
    }

    protected decorateCaption(node: ITreeNode, caption: h.Child, props: NodeProps): h.Child {
        if (FileStatNode.is(node)) {
            return this.decorateFileStatCaption(node, caption, props);
        }
        return super.decorateCaption(node, caption, props);
    }

    protected decorateFileStatCaption(node: FileStatNode, caption: h.Child, props: NodeProps): h.Child {
        const icon = h.span({
            className: (node.icon || '') + ' file-icon'
        });
        return super.decorateCaption(node, VirtualRenderer.merge(icon, caption), props);
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.addEventListener(this.node, 'dragenter', event => this.handleDragEnterEvent(this.model.root, event));
        this.addEventListener(this.node, 'dragover', event => this.handleDragOverEvent(event));
        this.addEventListener(this.node, 'dragleave', event => this.handleLeaveEvent(event));
        this.addEventListener(this.node, 'drop', event => this.handleDropEvent(this.model.root, event));
    }

    protected createNodeAttributes(node: ITreeNode, props: NodeProps): ElementAttrs {
        const elementAttrs = super.createNodeAttributes(node, props);
        return {
            ...elementAttrs,
            ondragenter: event => this.handleDragEnterEvent(node, event),
            ondrop: event => this.handleDropEvent(node, event),
        };
    }

    protected handleDragEnterEvent(node: ITreeNode | undefined, event: DragEvent): void {
        if (node !== undefined) {
            if (ISelectableTreeNode.is(node)) {
                this.model.selectNode(node);
                setTimeout(ev => {
                    if (DirNode.is(node) && node.selected) {
                        this.model.expandNode(node);
                    }
                }, 500);
            }
        }
        event.preventDefault();
        event.stopPropagation();
        const target = event.target as HTMLElement;
        if (target.parentElement) {
            target.parentElement.classList.add(activeDropZone);
        }
    }

    protected handleDragOverEvent(event: DragEvent): void {
        event.preventDefault();
    }

    protected handleLeaveEvent(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        const target = event.target as HTMLElement;
        if (target.parentElement) {
            target.parentElement.classList.remove(activeDropZone);
        }
    }

    protected handleDropEvent(node: ITreeNode | undefined, event: DragEvent): void {
        event.stopPropagation();
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
        const target = event.target as HTMLElement;
        if (target.parentElement) {
            target.parentElement.classList.remove(activeDropZone);
        }
        this.dropHandler(event, node);
    }

    protected dropHandler(ev: DragEvent, node: ITreeNode | undefined) {
        const data = ev.dataTransfer.items;

        for (let i = 0; i < data.length; i += 1) {
            if (data[i].kind === 'file') {
                const entry: WebKitEntry = data[i].webkitGetAsEntry();
                if (node !== undefined) {
                    const f: File | null = data[i].getAsFile();
                    // Test if the selected node is a file or folder
                    let nodeDestination = node.id;
                    if (!DirNode.is(node) && node.parent !== undefined) {
                        // Set destination to be the same parent as the selected node
                        nodeDestination = node.parent.id;
                    }
                    // Verify id the draggable item is a folder or a file
                    if (entry.isDirectory) {
                        this.uploadToDirectory(entry, nodeDestination);
                    } else {
                        if (f !== null) {
                            this.model.upload(nodeDestination, f, f.name);
                        }
                    }
                }
            }
        }
    }

    protected uploadToDirectory(dirEntry: any, destination: string) {
        const reader = dirEntry.createReader();
        reader.readEntries((results: WebKitEntry[]) => {

            for (let count = 0; count < results.length; count++) {

                if (results[count].isDirectory) {
                    this.uploadToDirectory(results[count], destination);
                } else {
                    const fileEntry = <WebKitFileEntry>results[count];
                    fileEntry.file(e => {
                        const f = <File>(e as {});
                        this.model.upload(destination + dirEntry.fullPath, f, f.name);
                    });
                }
            }
        }, (error: any) => {
            this.logger.error(error);
        });
    }

}
