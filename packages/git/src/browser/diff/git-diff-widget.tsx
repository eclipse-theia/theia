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

import { inject, injectable, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { StatefulWidget, DiffUris, Message } from '@theia/core/lib/browser';
import { EditorManager, EditorOpenerOptions, EditorWidget, DiffNavigatorProvider, DiffNavigator } from '@theia/editor/lib/browser';
import { ScmRepository } from '@theia/scm/lib/browser/scm-repository';
import { GitFileChange, GitFileStatus, Git, WorkingDirectoryStatus } from '../../common';
import { GitScmProvider, GitScmFileChange } from '../git-scm-provider';
import { GitWatcher } from '../../common';
import { GIT_RESOURCE_SCHEME } from '../git-resource';
import { ScmNavigableListWidget, ScmItemComponent } from '@theia/scm-extra/lib/browser/scm-navigable-list-widget';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { GitRepositoryProvider } from '../git-repository-provider';
import * as React from 'react';
import { MaybePromise } from '@theia/core/lib/common/types';
import { ScmFileChangeNode } from '@theia/scm-extra/lib/browser/scm-file-change-node';

/* eslint-disable no-null/no-null */

type GitFileChangeNode = ScmFileChangeNode & { fileChange: GitScmFileChange };

export const GIT_DIFF = 'git-diff';
@injectable()
export class GitDiffWidget extends ScmNavigableListWidget<GitFileChangeNode> implements StatefulWidget {

    protected readonly GIT_DIFF_TITLE = 'Diff';

    protected fileChangeNodes: GitFileChangeNode[] = [];
    protected options: Git.Options.Diff;

    protected gitStatus?: WorkingDirectoryStatus;

    protected listView?: GitDiffListContainer;

    protected deferredListContainer = new Deferred<HTMLElement>();

    @inject(Git) protected readonly git: Git;
    @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider;
    @inject(DiffNavigatorProvider) protected readonly diffNavigatorProvider: DiffNavigatorProvider;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(GitWatcher) protected readonly gitWatcher: GitWatcher;

    constructor() {
        super();
        this.id = GIT_DIFF;
        this.scrollContainer = 'git-diff-list-container';
        this.title.label = this.GIT_DIFF_TITLE;
        this.title.caption = this.GIT_DIFF_TITLE;
        this.title.closable = true;
        this.title.iconClass = 'theia-git-diff-icon';

        this.addClass('theia-scm');
        this.addClass('theia-git');
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.gitWatcher.onGitEvent(async gitEvent => {
            if (this.options) {
                this.setContent(this.options);
            }
        }));
        this.toDispose.push(this.labelProvider.onDidChange(event => {
            const affectsFiles = this.fileChangeNodes.some(node => event.affects(new URI(node.fileChange.uri)));
            if (this.options && affectsFiles) {
                this.setContent(this.options);
            }
        }));
    }

    protected getScrollContainer(): MaybePromise<HTMLElement> {
        return this.deferredListContainer.promise;
    }

    protected get toRevision(): string | undefined {
        return this.options.range && this.options.range.toRevision;
    }

    protected get fromRevision(): string | number | undefined {
        return this.options.range && this.options.range.fromRevision;
    }

    async setContent(options: Git.Options.Diff): Promise<void> {
        this.options = options;
        const scmRepository = this.findRepositoryOrSelected(options.uri);
        if (scmRepository && scmRepository.provider.id === 'git') {
            const provider = scmRepository.provider as GitScmProvider;
            const repository = { localUri: scmRepository.provider.rootUri };
            const gitFileChanges = await this.git.diff(repository, {
                range: options.range,
                uri: options.uri
            });
            const scmFileChanges: GitFileChangeNode[] = gitFileChanges
                .map(change => new GitScmFileChange(change, provider, options.range))
                .map(fileChange => ({ fileChange, commitId: fileChange.gitFileChange.uri }));
            this.fileChangeNodes = scmFileChanges;
            this.update();
        }
    }

    protected findRepositoryOrSelected(uri?: string): ScmRepository | undefined {
        if (uri) {
            return this.scmService.findRepository(new URI(uri));
        }
        return this.scmService.selectedRepository;
    }

    storeState(): object {
        const { fileChangeNodes, options } = this;
        return {
            fileChangeNodes,
            options
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    restoreState(oldState: any): void {
        this.fileChangeNodes = oldState['fileChangeNodes'];
        this.options = oldState['options'];
        this.update();
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        if (this.listView) {
            this.listView.focus();
        }
    }

    protected render(): React.ReactNode {
        this.scmNodes = this.fileChangeNodes;
        const commitishBar = this.renderDiffListHeader();
        const fileChangeList = this.renderFileChangeList();
        return <div className='scm-diff-container'>{commitishBar}{fileChangeList}</div>;
    }

    protected renderDiffListHeader(): React.ReactNode {
        return this.doRenderDiffListHeader(
            this.renderRepositoryHeader(),
            this.renderPathHeader(),
            this.renderRevisionHeader(),
            this.renderToolbar()
        );
    }

    protected doRenderDiffListHeader(...children: React.ReactNode[]): React.ReactNode {
        return <div className='diff-header'>{...children}</div>;
    }

    protected renderRepositoryHeader(): React.ReactNode {
        if (this.options && this.options.uri) {
            return this.renderHeaderRow({ name: 'repository', value: this.getRepositoryLabel(this.options.uri) });
        }
        return undefined;
    }

    protected renderPathHeader(): React.ReactNode {
        return this.renderHeaderRow({
            classNames: ['diff-header'],
            name: 'path',
            value: this.renderPath()
        });
    }
    protected renderPath(): React.ReactNode {
        if (this.options.uri) {
            const path = this.scmLabelProvider.relativePath(this.options.uri);
            if (path.length > 0) {
                return '/' + path;
            } else {
                return this.labelProvider.getLongName(new URI(this.options.uri));
            }
        }
        return null;
    }

    protected renderRevisionHeader(): React.ReactNode {
        return this.renderHeaderRow({
            classNames: ['diff-header'],
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
    protected doRenderToolbar(...children: React.ReactNode[]): React.ReactNode {
        return this.renderHeaderRow({
            classNames: ['diff-nav', 'space-between'],
            name: 'Files changed',
            value: <div className='lrBtns'>{...children}</div>
        });
    }

    protected readonly showPreviousChange = () => this.doShowPreviousChange();
    protected doShowPreviousChange(): void {
        this.navigateLeft();
    }

    protected renderNavigationLeft(): React.ReactNode {
        return <span key='lnav' className='fa fa-arrow-left' title='Previous Change' onClick={this.showPreviousChange}></span>;
    }

    protected readonly showNextChange = () => this.doShowNextChange();
    protected doShowNextChange(): void {
        this.navigateRight();
    }

    protected renderNavigationRight(): React.ReactNode {
        return <span key='rnav' className='fa fa-arrow-right' title='Next Change' onClick={this.showNextChange}></span>;
    }

    protected renderFileChangeList(): React.ReactNode {
        const files: React.ReactNode[] = [];
        for (const fileChange of this.fileChangeNodes) {
            const fileChangeElement: React.ReactNode = this.renderGitItem(fileChange);
            files.push(fileChangeElement);
        }
        if (!files.length) {
            return <div>No files changed.</div>;
        }
        return <GitDiffListContainer
            ref={ref => this.listView = ref || undefined}
            id={this.scrollContainer}
            files={files}
            addDiffListKeyListeners={this.addGitDiffListKeyListeners}
            setListContainer={this.setListContainer} />;
    }

    protected setListContainer = (listContainerElement: HTMLDivElement) => this.deferredListContainer.resolve(listContainerElement);

    protected addGitDiffListKeyListeners = (id: string) => this.doAddGitDiffListKeyListeners(id);
    protected doAddGitDiffListKeyListeners(id: string): void {
        const container = document.getElementById(id);
        if (container) {
            this.addListNavigationKeyListeners(container);
        }
    }

    protected renderGitItem(change: GitFileChangeNode): React.ReactNode {
        return <ScmItemComponent key={change.fileChange.uri.toString()} {...{
            labelProvider: this.labelProvider,
            scmLabelProvider: this.scmLabelProvider,
            change,
            revealChange: () => this.revealChange(change.fileChange.gitFileChange),
            selectNode: () => this.selectNode(change)
        }} />;
    }

    protected navigateRight(): void {
        const selected = this.getSelected();
        if (selected) {
            const uri = this.getUriToOpen(selected.fileChange.gitFileChange);
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
                    this.revealChange(selected.fileChange.gitFileChange);
                }
            });
        } else if (this.scmNodes.length > 0) {
            this.selectNode(this.scmNodes[0]);
            this.openSelected();
        }
    }

    protected navigateLeft(): void {
        const selected = this.getSelected();
        if (selected) {
            const uri = this.getUriToOpen(selected.fileChange.gitFileChange);
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
                    this.revealChange(selected.fileChange.gitFileChange);
                }
            });
        }
    }

    protected selectNextNode(): void {
        const idx = this.indexOfSelected;
        if (idx >= 0 && idx < this.scmNodes.length - 1) {
            this.selectNode(this.scmNodes[idx + 1]);
        } else if (this.scmNodes.length > 0 && (idx === -1 || idx === this.scmNodes.length - 1)) {
            this.selectNode(this.scmNodes[0]);
        }
    }

    protected selectPreviousNode(): void {
        const idx = this.indexOfSelected;
        if (idx > 0) {
            this.selectNode(this.scmNodes[idx - 1]);
        } else if (idx === 0) {
            this.selectNode(this.scmNodes[this.scmNodes.length - 1]);
        }
    }

    protected handleListEnter(): void {
        this.openSelected();
    }

    protected openSelected(): void {
        const selected = this.getSelected();
        if (selected) {
            this.revealChange(selected.fileChange.gitFileChange);
        }
    }

    getUriToOpen(change: GitFileChange): URI {
        const uri: URI = new URI(change.uri);

        let fromURI = uri;
        if (change.oldUri) { // set on renamed and copied
            fromURI = new URI(change.oldUri);
        }
        if (this.fromRevision !== undefined) {
            if (typeof this.fromRevision !== 'number') {
                fromURI = fromURI.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.fromRevision);
            } else {
                fromURI = fromURI.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.toRevision + '~' + this.fromRevision);
            }
        } else {
            // default is to compare with previous revision
            fromURI = fromURI.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.toRevision + '~1');
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
            uriToOpen = DiffUris.encode(fromURI, toURI);
        }
        return uriToOpen;
    }

    async openChanges(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget | undefined> {
        const stringUri = uri.toString();
        const change = this.fileChangeNodes.find(n => n.fileChange.uri.toString() === stringUri);
        return change && this.openChange(change.fileChange.gitFileChange, options);
    }

    openChange(change: GitFileChange, options?: EditorOpenerOptions): Promise<EditorWidget | undefined> {
        const uriToOpen = this.getUriToOpen(change);
        return this.editorManager.open(uriToOpen, options);
    }

    protected async revealChange(change: GitFileChange): Promise<void> {
        await this.openChange(change, { mode: 'reveal' });
    }

}

export namespace GitDiffListContainer {
    export interface Props {
        id: string
        files: React.ReactNode[]
        addDiffListKeyListeners: (id: string) => void
        setListContainer: (listContainer: HTMLDivElement) => void
    }
}

export class GitDiffListContainer extends React.Component<GitDiffListContainer.Props> {
    protected listContainer?: HTMLDivElement;

    render(): JSX.Element {
        const { id, files } = this.props;
        return <div ref={ref => this.listContainer = ref || undefined} className='listContainer filesChanged' id={id} tabIndex={0}>{...files}</div>;
    }

    componentDidMount(): void {
        this.props.addDiffListKeyListeners(this.props.id);
        if (this.listContainer) {
            this.props.setListContainer(this.listContainer);
        }
    }

    focus(): void {
        if (this.listContainer) {
            this.listContainer.focus({ preventScroll: true });
        }
    }
}
