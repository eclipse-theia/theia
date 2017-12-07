/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import URI from '@theia/core/lib/common/uri';
import { ICompositeTreeNode, TreeModel, TreeServices } from "@theia/core/lib/browser";
import { FileSystem, FileSystemWatcher, FileChangeType, FileChange } from "../../common";
import { FileStatNode, DirNode, FileTree } from "./file-tree";
import { LocationService } from '../location';
import { LabelProvider } from "@theia/core/lib/browser/label-provider";
import * as base64 from 'base64-js';

@injectable()
export class FileTreeServices extends TreeServices {
    @inject(FileSystem) readonly fileSystem: FileSystem;
    @inject(FileSystemWatcher) readonly watcher: FileSystemWatcher;
}

@injectable()
export class FileTreeModel extends TreeModel implements LocationService {

    protected readonly fileSystem: FileSystem;
    protected readonly watcher: FileSystemWatcher;

    @inject(LabelProvider) protected labelProvider: LabelProvider;

    constructor(
        @inject(FileTree) protected readonly tree: FileTree,
        @inject(FileTreeServices) services: FileTreeServices
    ) {
        super(tree, services);
        this.toDispose.push(this.watcher.onFilesChanged(changes => this.onFilesChanged(changes)));
    }

    get location(): URI | undefined {
        const root = this.root;
        if (FileStatNode.is(root)) {
            return root.uri;
        }
        return undefined;
    }

    set location(uri: URI | undefined) {
        if (uri) {
            this.fileSystem.getFileStat(uri.toString()).then(async fileStat => {
                const label = this.labelProvider.getName(uri);
                const icon = await this.labelProvider.getIcon(fileStat);
                const node = DirNode.createRoot(fileStat, label, icon);
                this.navigateTo(node);
            });
        } else {
            this.navigateTo(undefined);
        }
    }

    get selectedFileStatNode(): Readonly<FileStatNode> | undefined {
        const selectedNode = this.selectedNode;
        if (FileStatNode.is(selectedNode)) {
            return selectedNode;
        }
        return undefined;
    }

    protected onFilesChanged(changes: FileChange[]): void {
        const affectedNodes = this.getAffectedNodes(changes);
        if (affectedNodes.length !== 0) {
            affectedNodes.forEach(node => this.refresh(node));
        } else if (this.isRootAffected(changes)) {
            this.refresh();
        }
    }

    protected isRootAffected(changes: FileChange[]): boolean {
        const root = this.root;
        if (FileStatNode.is(root)) {
            return changes.some(change =>
                change.type < FileChangeType.DELETED && change.uri.toString() === root.uri.toString()
            );
        }
        return false;
    }

    protected getAffectedNodes(changes: FileChange[]): ICompositeTreeNode[] {
        const nodes: DirNode[] = [];
        for (const change of changes) {
            const uri = change.uri;
            const id = change.type > FileChangeType.UPDATED ? uri.parent.toString() : uri.toString();
            const node = this.getNode(id);
            if (DirNode.is(node) && node.expanded) {
                nodes.push(node);
            }
        }
        return nodes;
    }

    copy(uri: URI): boolean {
        if (uri.scheme !== 'file') {
            return false;
        }
        const node = this.selectedFileStatNode;
        if (!node) {
            return false;
        }
        const targetUri = node.uri.resolve(uri.path.base);
        this.fileSystem.copy(uri.toString(), targetUri.toString());
        return true;
    }

    upload(destination: string, file: File, fileName: string) {
        const uri = destination + '/' + fileName;
        const encoding = 'base64';
        const reader = new FileReader();
        reader.onload = async e => {
            const fileContent: ArrayBuffer = reader.result;
            const content = base64.fromByteArray(new Uint8Array(fileContent));
            if (await this.fileSystem.exists(uri)) {
                const stat = await this.fileSystem.getFileStat(uri);
                this.fileSystem.setContent(stat, content, { encoding });
            } else {
                this.fileSystem.createFile(uri, { content, encoding });
            }
        };
        reader.readAsArrayBuffer(file);
    }

}
