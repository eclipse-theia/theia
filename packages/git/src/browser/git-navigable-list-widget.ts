/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { VirtualWidget, SELECTED_CLASS, Key } from "@theia/core/lib/browser";
import { GitFileStatus, Repository, GitFileChange } from '../common';
import URI from "@theia/core/lib/common/uri";
import { GitRepositoryProvider } from "./git-repository-provider";
import { LabelProvider } from "@theia/core/lib/browser/label-provider";
import { Message } from "@phosphor/messaging";
import { ElementExt } from "@phosphor/domutils";
import { inject, injectable } from "inversify";

@injectable()
export class GitNavigableListWidget<T extends { selected?: boolean }> extends VirtualWidget {

    protected gitNodes: T[];
    private _scrollContainer: string;

    @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

    constructor() {
        super();
        this.node.tabIndex = 0;
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected set scrollContainer(id: string) {
        this._scrollContainer = id + Date.now();
    }

    protected get scrollContainer(): string {
        return this._scrollContainer;
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);

        (async () => {
            const selected = this.node.getElementsByClassName(SELECTED_CLASS)[0];
            const scrollArea = await this.getScrollContainer();
            if (selected && scrollArea) {
                ElementExt.scrollIntoViewIfNeeded(scrollArea, selected);
            }
        })();
    }

    protected getStatusCaption(status: GitFileStatus, staged?: boolean): string {
        return GitFileStatus.toString(status, staged);
    }

    protected getAbbreviatedStatusCaption(status: GitFileStatus, staged?: boolean): string {
        return GitFileStatus.toAbbreviation(status, staged);
    }

    protected relativePath(uri: URI | string): string {
        const parsedUri = typeof uri === 'string' ? new URI(uri) : uri;
        const repo = this.repositoryProvider.selectedRepository;
        if (repo) {
            return Repository.relativePath(repo, parsedUri).toString();
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
        this.addKeyListener(this.node, Key.ARROW_LEFT, () => this.navigateLeft());
        this.addKeyListener(this.node, Key.ARROW_RIGHT, () => this.navigateRight());
        this.addKeyListener(this.node, Key.ARROW_UP, () => this.navigateUp());
        this.addKeyListener(this.node, Key.ARROW_DOWN, () => this.navigateDown());
        this.addKeyListener(this.node, Key.ENTER, () => this.handleListEnter());

    }

    protected navigateLeft(): void {
        this.selectPreviousNode();
    }

    protected navigateRight(): void {
        this.selectNextNode();
    }

    protected navigateUp(): void {
        this.selectPreviousNode();
    }

    protected navigateDown(): void {
        this.selectNextNode();
    }

    protected handleListEnter(): void {

    }

    protected getSelected(): T | undefined {
        return this.gitNodes ? this.gitNodes.find(c => c.selected || false) : undefined;
    }

    protected selectNode(node: T) {
        const n = this.getSelected();
        if (n) {
            n.selected = false;
        }
        node.selected = true;
        this.update();
    }

    protected selectNextNode() {
        const idx = this.indexOfSelected;
        if (idx >= 0 && idx < this.gitNodes.length - 1) {
            this.selectNode(this.gitNodes[idx + 1]);
        } else if (this.gitNodes.length > 0 && idx === -1) {
            this.selectNode(this.gitNodes[0]);
        }
    }

    protected selectPreviousNode() {
        const idx = this.indexOfSelected;
        if (idx > 0) {
            this.selectNode(this.gitNodes[idx - 1]);
        }
    }

    protected get indexOfSelected(): number {
        if (this.gitNodes && this.gitNodes.length > 0) {
            return this.gitNodes.findIndex(c => c.selected || false);
        }
        return -1;
    }
}
