/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { VirtualWidget, SELECTED_CLASS } from "@theia/core/lib/browser";
import { GitFileStatus, Repository, GitFileChange } from '../common';
import URI from "@theia/core/lib/common/uri";
import { GitRepositoryProvider } from "./git-repository-provider";
import { LabelProvider } from "@theia/core/lib/browser/label-provider";
import { Message } from "@phosphor/messaging";
import { Key } from "@theia/core/lib/browser/keys";
import { SelectionService } from "@theia/core";
import { ElementExt } from "@phosphor/domutils";

export enum SelectDirection {
    NEXT, PREVIOUS
}

export interface GitFileChangeNode extends GitFileChange {
    readonly icon: string;
    readonly label: string;
    readonly description: string;
    readonly caption?: string;
    readonly extraIconClassName?: string;
    readonly commitSha?: string;
    selected?: boolean;
}

export namespace GitFileChangeNode {
    export function is(node: any): node is GitFileChangeNode {
        return 'uri' in node && 'status' in node && 'description' in node && 'label' in node && 'icon' in node;
    }
}

export abstract class GitBaseWidget<T extends { selected?: boolean }> extends VirtualWidget {

    protected gitNodes: T[];
    protected abstract readonly scrollContainer: string;

    constructor(
        protected readonly repositoryProvider: GitRepositoryProvider,
        protected readonly labelProvider: LabelProvider,
        protected readonly selectionService: SelectionService) {
        super();

        selectionService.onSelectionChanged((c: T) => {
            c.selected = true;
            this.update();
        });

        this.node.tabIndex = 0;
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);

        const selected = this.node.getElementsByClassName(SELECTED_CLASS)[0];
        const scrollArea = document.getElementById(this.scrollContainer);
        if (selected && scrollArea) {
            ElementExt.scrollIntoViewIfNeeded(scrollArea, selected);
        }
    }

    protected getStatusCaption(status: GitFileStatus, staged: boolean): string {
        switch (status) {
            case GitFileStatus.New: return staged ? 'Added' : 'Unstaged';
            case GitFileStatus.Renamed: return 'Renamed';
            case GitFileStatus.Copied: return 'Copied';
            case GitFileStatus.Modified: return 'Modified';
            case GitFileStatus.Deleted: return 'Deleted';
            case GitFileStatus.Conflicted: return 'Conficted';
        }
        return '';
    }

    protected getRepositoryRelativePath(repository: Repository, uri: URI) {
        const repositoryUri = new URI(repository.localUri);
        return uri.toString().substr(repositoryUri.toString().length + 1);
    }

    protected relativePath(uri: URI | string): string {
        const parsedUri = typeof uri === 'string' ? new URI(uri) : uri;
        const repo = this.repositoryProvider.selectedRepository;
        if (repo) {
            return this.getRepositoryRelativePath(repo, parsedUri);
        } else {
            return this.labelProvider.getLongName(parsedUri);
        }
    }

    protected computeCaption(fileChange: GitFileChange): string {
        let result = `${this.relativePath(fileChange.uri)} - ${this.getStatusCaption(fileChange.status, true)}`;
        if (fileChange.oldUri) {
            result = `${this.relativePath(fileChange.oldUri)} -> ${result}`;
        }
        return result;
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.addKeyListener(this.node, Key.ARROW_LEFT, () => this.handleLeft());
        this.addKeyListener(this.node, Key.ARROW_RIGHT, () => this.handleRight());
        this.addKeyListener(this.node, Key.ARROW_UP, () => this.handleUp());
        this.addKeyListener(this.node, Key.ARROW_DOWN, () => this.handleDown());
        this.addKeyListener(this.node, Key.ENTER, () => this.handleEnter());
    }

    protected handleLeft(): void {
        this.selectNodeByDirection(SelectDirection.PREVIOUS);
    }

    protected handleRight(): void {
        this.selectNodeByDirection(SelectDirection.NEXT);
    }

    protected handleUp(): void {
        this.selectNodeByDirection(SelectDirection.PREVIOUS);
    }

    protected handleDown(): void {
        this.selectNodeByDirection(SelectDirection.NEXT);
    }

    protected handleEnter(): void {

    }

    protected getSelected(): T | undefined {
        return this.gitNodes ? this.gitNodes.find(c => c.selected || false) : undefined;
    }

    protected selectNode(node: T) {
        const n = this.getSelected();
        if (n) {
            n.selected = false;
        }
        this.selectionService.selection = node;
    }

    protected selectNodeByDirection(dir: SelectDirection) {
        const selIdx = this.gitNodes.findIndex(c => c.selected || false);
        let nodeIdx = selIdx;
        if (dir === SelectDirection.NEXT && selIdx < this.gitNodes.length - 1) {
            nodeIdx = selIdx + 1;
        } else if (dir === SelectDirection.PREVIOUS && selIdx > 0) {
            nodeIdx = selIdx - 1;
        }
        this.selectNode(this.gitNodes[nodeIdx]);
    }
}
