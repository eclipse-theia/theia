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

import { inject, injectable, postConstruct } from "inversify";
import URI from "@theia/core/lib/common/uri";
import { StatefulWidget, SELECTED_CLASS, DiffUris } from "@theia/core/lib/browser";
import { EditorManager, EditorOpenerOptions, EditorWidget, DiffNavigatorProvider, DiffNavigator } from "@theia/editor/lib/browser";
import { GitFileChange, GitFileStatus, Git, WorkingDirectoryStatus } from '../../common';
import { GitWatcher } from "../../common";
import { GIT_RESOURCE_SCHEME } from '../git-resource';
import { GitNavigableListWidget } from "../git-navigable-list-widget";
import { GitFileChangeNode } from "../git-widget";
import * as React from "react";

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

    protected render(): React.ReactNode {
        this.gitNodes = this.fileChangeNodes;
        const commitishBar = this.renderDiffListHeader();
        const fileChangeList = this.renderFileChangeList();
        return <div className="git-diff-container">{commitishBar}{fileChangeList}</div>;
    }

    protected renderDiffListHeader(): React.ReactNode {
        return this.doRenderDiffListHeader(
            this.renderPathHeader(),
            this.renderRevisionHeader(),
            this.renderToolbar()
        );
    }

    protected doRenderDiffListHeader(...children: React.ReactNode[]): React.ReactNode {
        return <div className="diff-header">{...children}</div>;
    }

    protected renderHeaderRow({ name, value, classNames }: { name: string, value: React.ReactNode, classNames?: string[] }): React.ReactNode {
        if (value === null) {
            return null;
        }
        const className = ['header-row', ...(classNames || [])].join(' ');
        return <div key={name} className={className}>
            <div className='theia-header'>{name}</div>
            <div className='header-value'>{value}</div>
        </div>;
    }

    protected renderPathHeader(): React.ReactNode {
        return this.renderHeaderRow({
            name: 'path',
            value: this.renderPath()
        });
    }
    protected renderPath(): React.ReactNode {
        if (this.options.uri) {
            const path = this.relativePath(this.options.uri);
            if (path.length > 0) {
                return '/' + path;
            }
        }
        return null;
    }

    protected renderRevisionHeader(): React.ReactNode {
        return this.renderHeaderRow({
            name: 'revision: ',
            value: this.renderRevision()
        });
    }
    protected renderRevision(): React.ReactNode {
        if (!this.fromRevision) {
            return null;
        }
        if (typeof this.fromRevision === 'string') {
            return this.fromRevision;
        }
        return (this.toRevision || 'HEAD') + '~' + this.fromRevision;
    }

    protected renderToolbar(): React.ReactNode {
        return this.doRenderToolbar(
            this.renderNavigationLeft(),
            this.renderNavigationRight()
        );
    }
    protected doRenderToolbar(...children: React.ReactNode[]) {
        return this.renderHeaderRow({
            classNames: ['space-between'],
            name: 'Files changed',
            value: <div className='lrBtns'>{...children}</div>
        });
    }

    protected readonly showPreviousChange = () => this.doShowPreviousChange();
    protected doShowPreviousChange() {
        this.navigateLeft();
    }

    protected renderNavigationLeft(): React.ReactNode {
        return <span key="lnav" className="fa fa-arrow-left" title="Previous Change" onClick={this.showPreviousChange}></span>;
    }

    protected readonly showNextChange = () => this.doShowNextChange();
    protected doShowNextChange() {
        this.navigateRight();
    }

    protected renderNavigationRight(): React.ReactNode {
        return <span key="rnav" className="fa fa-arrow-right" title="Next Change" onClick={this.showNextChange}></span>;
    }

    protected renderFileChangeList(): React.ReactNode {
        const files: React.ReactNode[] = [];
        for (const fileChange of this.fileChangeNodes) {
            const fileChangeElement: React.ReactNode = this.renderGitItem(fileChange);
            files.push(fileChangeElement);
        }
        return <div className="listContainer" id={this.scrollContainer}>{...files}</div>;
    }

    protected renderGitItem(change: GitFileChangeNode): React.ReactNode {
        return <div key={change.uri.toString()} className={`gitItem noselect${change.selected ? ' ' + SELECTED_CLASS : ''}`}>
            <div
                title={change.caption}
                className='noWrapInfo'
                onDoubleClick={() => {
                    this.revealChange(change);
                }}
                onClick={() => {
                    this.selectNode(change);
                }}>
                <span className={change.icon + ' file-icon'}></span>
                <span className='name'>{change.label + ' '}</span>
                <span className='path'>{change.description}</span>
            </div>
            {
                change.extraIconClassName ? <div
                    title={change.caption}
                    className={change.extraIconClassName}></div>
                    : ''
            }
            <div
                title={change.caption}
                className={'status staged ' + GitFileStatus[change.status].toLowerCase()}>
                {this.getStatusCaption(change.status, true).charAt(0)}
            </div>
        </div>;
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
