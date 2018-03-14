/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, postConstruct } from "inversify";
import { h } from "@phosphor/virtualdom";
import URI from "@theia/core/lib/common/uri";
import { VirtualRenderer, StatefulWidget, SELECTED_CLASS, DiffUris } from "@theia/core/lib/browser";
import { EditorManager, EditorOpenerOptions, EditorWidget, DiffNavigatorProvider, DiffNavigator } from "@theia/editor/lib/browser";
import { GitFileChange, GitFileStatus, Git, WorkingDirectoryStatus } from '../../common';
import { GitWatcher } from "../../common";
import { GIT_RESOURCE_SCHEME } from '../git-resource';
import { GitNavigableListWidget } from "../git-navigable-list-widget";
import { GitFileChangeNode } from "../git-widget";

// tslint:disable:no-null-keyword

export const GIT_DIFF = "git-diff";
@injectable()
export class GitDiffWidget extends GitNavigableListWidget<GitFileChangeNode> implements StatefulWidget {

    protected fileChangeNodes: GitFileChangeNode[];
    protected options: Git.Options.Diff;

    protected gitStatus: WorkingDirectoryStatus | undefined;

    @inject(Git) protected readonly git: Git;
    @inject(DiffNavigatorProvider) protected readonly diffNavigatorProvider: DiffNavigatorProvider;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(GitWatcher) protected readonly gitWatcher: GitWatcher;

    constructor() {
        super();
        this.id = GIT_DIFF;
        this.scrollContainer = "git-diff-list-container";
        this.title.label = "Diff";

        this.addClass('theia-git');
    }

    @postConstruct()
    protected init() {
        this.toDispose.push(this.gitWatcher.onGitEvent(async gitEvent => {
            if (this.options) {
                this.setContent(this.options);
            }
        }));
    }

    protected get toRevision() {
        return this.options.range && this.options.range.toRevision;
    }

    protected get fromRevision() {
        return this.options.range && this.options.range.fromRevision;
    }

    async setContent(options: Git.Options.Diff) {
        this.options = options;
        const repository = this.repositoryProvider.selectedRepository;
        if (repository) {
            const fileChanges: GitFileChange[] = await this.git.diff(repository, {
                range: options.range,
                uri: options.uri
            });
            const fileChangeNodes: GitFileChangeNode[] = [];
            for (const fileChange of fileChanges) {
                const fileChangeUri = new URI(fileChange.uri);
                const [icon, label, description] = await Promise.all([
                    this.labelProvider.getIcon(fileChangeUri),
                    this.labelProvider.getName(fileChangeUri),
                    this.relativePath(fileChangeUri.parent)
                ]);

                const caption = this.computeCaption(fileChange);
                fileChangeNodes.push({
                    ...fileChange, icon, label, description, caption
                });
            }
            this.fileChangeNodes = fileChangeNodes;
            this.update();
        }
    }

    storeState(): object {
        const { fileChangeNodes, options } = this;
        return {
            fileChangeNodes,
            options
        };
    }

    // tslint:disable-next-line:no-any
    restoreState(oldState: any): void {
        this.fileChangeNodes = oldState['fileChangeNodes'];
        this.options = oldState['options'];
        this.update();
    }

    protected render(): h.Child {
        this.gitNodes = this.fileChangeNodes;
        const commitishBar = this.renderDiffListHeader();
        const fileChangeList = this.renderFileChangeList();
        return h.div({ className: "git-diff-container" }, VirtualRenderer.flatten([commitishBar, fileChangeList]));
    }

    protected renderDiffListHeader(): h.Child {
        return this.doRenderDiffListHeader(
            this.renderPathHeader(),
            this.renderRevisionHeader(),
            this.renderToolbar()
        );
    }
    protected doRenderDiffListHeader(...children: h.Child[]): h.Child {
        return h.div({ className: "diff-header" }, ...children);
    }
    protected renderHeaderRow({ name, value, classNames }: { name: h.Child, value: h.Child, classNames?: string[] }): h.Child {
        if (value === null) {
            return null;
        }
        const className = ['header-row', ...(classNames || [])].join(' ');
        return h.div({ className },
            h.div({ className: 'theia-header' }, name),
            h.div({ className: 'header-value' }, value));
    }

    protected renderPathHeader(): h.Child {
        return this.renderHeaderRow({
            name: 'path',
            value: this.renderPath()
        });
    }
    protected renderPath(): h.Child {
        if (this.options.uri) {
            const path = this.relativePath(this.options.uri);
            if (path.length > 0) {
                return '/' + path;
            }
        }
        return null;
    }

    protected renderRevisionHeader(): h.Child {
        return this.renderHeaderRow({
            name: 'revision: ',
            value: this.renderRevision()
        });
    }
    protected renderRevision(): h.Child {
        if (!this.fromRevision) {
            return null;
        }
        if (typeof this.fromRevision === 'string') {
            return this.fromRevision;
        }
        return (this.toRevision || 'HEAD') + '~' + this.fromRevision;
    }

    protected renderToolbar(): h.Child {
        return this.doRenderToolbar(
            this.renderNavigationLeft(),
            this.renderNavigationRight()
        );
    }
    protected doRenderToolbar(...children: h.Child[]) {
        return this.renderHeaderRow({
            classNames: ['space-between'],
            name: 'Files changed',
            value: h.div({ className: 'lrBtns' }, ...children)
        });
    }

    protected renderNavigationLeft(): h.Child {
        return h.span({
            className: "fa fa-arrow-left",
            title: "Previous Change",
            onclick: () => this.navigateLeft()
        });
    }
    protected renderNavigationRight(): h.Child {
        return h.span({
            className: "fa fa-arrow-right",
            title: "Next Change",
            onclick: () => this.navigateRight()
        });
    }

    protected renderFileChangeList(): h.Child {
        const files: h.Child[] = [];
        for (const fileChange of this.fileChangeNodes) {
            const fileChangeElement: h.Child = this.renderGitItem(fileChange);
            files.push(fileChangeElement);
        }
        return h.div({ className: "listContainer", id: this.scrollContainer }, ...files);
    }

    protected renderGitItem(change: GitFileChangeNode): h.Child {
        const iconSpan = h.span({ className: change.icon + ' file-icon' });
        const nameSpan = h.span({ className: 'name' }, change.label + ' ');
        const pathSpan = h.span({ className: 'path' }, change.description);
        const elements = [];
        elements.push(h.div({
            title: change.caption,
            className: 'noWrapInfo',
            onclick: () => {
                this.selectNode(change);
            },
            ondblclick: () => {
                this.revealChange(change);
            }
        }, iconSpan, nameSpan, pathSpan));
        if (change.extraIconClassName) {
            elements.push(h.div({
                title: change.caption,
                className: change.extraIconClassName
            }));
        }
        elements.push(h.div({
            title: change.caption,
            className: 'status staged ' + GitFileStatus[change.status].toLowerCase()
        }, this.getStatusCaption(change.status, true).charAt(0)));
        return h.div({ className: `gitItem noselect${change.selected ? ' ' + SELECTED_CLASS : ''}` }, ...elements);
    }

    protected navigateRight(): void {
        const selected = this.getSelected();
        if (selected && GitFileChangeNode.is(selected)) {
            const uri = this.getUriToOpen(selected);
            this.editorManager.getByUri(uri).then(widget => {
                if (widget) {
                    const diffNavigator: DiffNavigator = this.diffNavigatorProvider(widget.editor);
                    if (diffNavigator.canNavigate() && diffNavigator.hasNext()) {
                        diffNavigator.next();
                    } else {
                        this.selectNextNode();
                        this.openSelected();
                    }
                } else {
                    this.revealChange(selected);
                }
            });
        } else if (this.gitNodes.length > 0) {
            this.selectNode(this.gitNodes[0]);
            this.openSelected();
        }
    }

    protected navigateLeft(): void {
        const selected = this.getSelected();
        if (GitFileChangeNode.is(selected)) {
            const uri = this.getUriToOpen(selected);
            this.editorManager.getByUri(uri).then(widget => {
                if (widget) {
                    const diffNavigator: DiffNavigator = this.diffNavigatorProvider(widget.editor);
                    if (diffNavigator.canNavigate() && diffNavigator.hasPrevious()) {
                        diffNavigator.previous();
                    } else {
                        this.selectPreviousNode();
                        this.openSelected();
                    }
                } else {
                    this.revealChange(selected);
                }
            });
        }
    }

    protected selectNextNode() {
        const idx = this.indexOfSelected;
        if (idx >= 0 && idx < this.gitNodes.length - 1) {
            this.selectNode(this.gitNodes[idx + 1]);
        } else if (this.gitNodes.length > 0 && (idx === -1 || idx === this.gitNodes.length - 1)) {
            this.selectNode(this.gitNodes[0]);
        }
    }

    protected selectPreviousNode() {
        const idx = this.indexOfSelected;
        if (idx > 0) {
            this.selectNode(this.gitNodes[idx - 1]);
        } else if (idx === 0) {
            this.selectNode(this.gitNodes[this.gitNodes.length - 1]);
        }
    }

    protected handleListEnter(): void {
        this.openSelected();
    }

    protected openSelected(): void {
        const selected = this.getSelected();
        if (selected) {
            this.revealChange(selected);
        }
    }

    protected getUriToOpen(change: GitFileChange): URI {
        const uri: URI = new URI(change.uri);

        let fromURI = uri;
        if (change.oldUri) { // set on renamed and copied
            fromURI = new URI(change.oldUri);
        }
        if (this.fromRevision !== undefined) {
            if (typeof this.fromRevision !== 'number') {
                fromURI = fromURI.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.fromRevision);
            } else {
                fromURI = fromURI.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.toRevision + "~" + this.fromRevision);
            }
        } else {
            // default is to compare with previous revision
            fromURI = fromURI.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.toRevision + "~1");
        }

        let toURI = uri;
        if (this.toRevision) {
            toURI = toURI.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.toRevision);
        }

        let uriToOpen = uri;
        if (change.status === GitFileStatus.Deleted) {
            uriToOpen = fromURI;
        } else if (change.status === GitFileStatus.New) {
            uriToOpen = toURI;
        } else {
            uriToOpen = DiffUris.encode(fromURI, toURI, uri.displayName);
        }
        return uriToOpen;
    }

    async openChanges(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget | undefined> {
        const stringUri = uri.toString();
        const change = this.fileChangeNodes.find(n => n.uri.toString() === stringUri);
        return change && this.openChange(change, options);
    }

    protected openChange(change: GitFileChange, options?: EditorOpenerOptions): Promise<EditorWidget | undefined> {
        const uriToOpen = this.getUriToOpen(change);
        return this.editorManager.open(uriToOpen, options);
    }

    protected async revealChange(change: GitFileChange): Promise<void> {
        await this.openChange(change, { mode: 'reveal' });
    }

}
