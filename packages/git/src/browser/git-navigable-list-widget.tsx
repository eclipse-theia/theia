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

import { SELECTED_CLASS, Key, Widget } from '@theia/core/lib/browser';
import { GitFileStatus, Repository, GitFileChange } from '../common';
import URI from '@theia/core/lib/common/uri';
import { GitRepositoryProvider } from './git-repository-provider';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { Message } from '@phosphor/messaging';
import { ElementExt } from '@phosphor/domutils';
import { inject, injectable } from 'inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import * as React from 'react';

@injectable()
export abstract class GitNavigableListWidget<T extends { selected?: boolean }> extends ReactWidget {

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
        this.update();
        this.node.focus();
    }

    protected set scrollContainer(id: string) {
        this._scrollContainer = id + Date.now();
    }

    protected get scrollContainer(): string {
        return this._scrollContainer;
    }

    protected onUpdateRequest(msg: Message): void {
        if (!this.isAttached || !this.isVisible) {
            return;
        }
        super.onUpdateRequest(msg);
        (async () => {
            const selected = this.node.getElementsByClassName(SELECTED_CLASS)[0];
            if (selected) {
                const container = document.getElementById(this.scrollContainer);
                if (container) {
                    ElementExt.scrollIntoViewIfNeeded(container, selected);
                }
            }
        })();
    }

    protected onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        this.update();
    }

    protected getStatusCaption(status: GitFileStatus, staged?: boolean): string {
        return GitFileStatus.toString(status, staged);
    }

    protected getAbbreviatedStatusCaption(status: GitFileStatus, staged?: boolean): string {
        return GitFileStatus.toAbbreviation(status, staged);
    }

    protected relativePath(uri: URI | string): string {
        const parsedUri = typeof uri === 'string' ? new URI(uri) : uri;
        const repo = this.repositoryProvider.findRepository(parsedUri);
        const relativePath = repo && Repository.relativePath(repo, parsedUri);
        if (relativePath) {
            return relativePath.toString();
        }
        return this.labelProvider.getLongName(parsedUri);
    }

    protected getRepositoryLabel(uri: string): string | undefined {
        const repository = this.repositoryProvider.findRepository(new URI(uri));
        const isSelectedRepo = this.repositoryProvider.selectedRepository && repository && this.repositoryProvider.selectedRepository.localUri === repository.localUri;
        return repository && !isSelectedRepo ? this.labelProvider.getLongName(new URI(repository.localUri)) : undefined;
    }

    protected computeCaption(fileChange: GitFileChange): string {
        let result = `${this.relativePath(fileChange.uri)} - ${this.getStatusCaption(fileChange.status, true)}`;
        if (fileChange.oldUri) {
            result = `${this.relativePath(fileChange.oldUri)} -> ${result}`;
        }
        return result;
    }

    protected renderHeaderRow({ name, value, classNames, title }: { name: string, value: React.ReactNode, classNames?: string[], title?: string }): React.ReactNode {
        if (!value) {
            return;
        }
        const className = ['header-row', ...(classNames || [])].join(' ');
        return <div key={name} className={className} title={title}>
            <div className='theia-header'>{name}</div>
            <div className='header-value'>{value}</div>
        </div>;
    }

    protected addGitListNavigationKeyListeners(container: HTMLElement): void {
        this.addKeyListener(container, Key.ARROW_LEFT, () => this.navigateLeft());
        this.addKeyListener(container, Key.ARROW_RIGHT, () => this.navigateRight());
        this.addKeyListener(container, Key.ARROW_UP, () => this.navigateUp());
        this.addKeyListener(container, Key.ARROW_DOWN, () => this.navigateDown());
        this.addKeyListener(container, Key.ENTER, () => this.handleListEnter());
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

    protected selectNode(node: T): void {
        const n = this.getSelected();
        if (n) {
            n.selected = false;
        }
        node.selected = true;
        this.update();
    }

    protected selectNextNode(): void {
        const idx = this.indexOfSelected;
        if (idx >= 0 && idx < this.gitNodes.length - 1) {
            this.selectNode(this.gitNodes[idx + 1]);
        } else if (this.gitNodes.length > 0 && idx === -1) {
            this.selectNode(this.gitNodes[0]);
        }
    }

    protected selectPreviousNode(): void {
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
