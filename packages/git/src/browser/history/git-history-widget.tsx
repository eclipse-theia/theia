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

import { injectable, inject, postConstruct } from 'inversify';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { OpenerService, open, StatefulWidget, SELECTED_CLASS, WidgetManager, ApplicationShell } from '@theia/core/lib/browser';
import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { Message } from '@phosphor/messaging';
import { AutoSizer, List, ListRowRenderer, ListRowProps, InfiniteLoader, IndexRange, ScrollParams, CellMeasurerCache, CellMeasurer } from 'react-virtualized';
import { GIT_RESOURCE_SCHEME } from '../git-resource';
import URI from '@theia/core/lib/common/uri';
import { GIT_HISTORY_ID, GIT_HISTORY_MAX_COUNT, GIT_HISTORY_LABEL } from './git-history-contribution';
import { GitFileStatus, Git, GitFileChange, Repository } from '../../common';
import { FileSystem } from '@theia/filesystem/lib/common';
import { GitDiffContribution } from '../diff/git-diff-contribution';
import { ScmAvatarService } from '@theia/scm/lib/browser/scm-avatar-service';
import { GitCommitDetailUri, GitCommitDetailOpenerOptions, GitCommitDetailOpenHandler } from './git-commit-detail-open-handler';
import { GitCommitDetails } from './git-commit-detail-widget';
import { GitNavigableListWidget } from '../git-navigable-list-widget';
import { GitFileChangeNode } from '../git-file-change-node';
import * as React from 'react';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';
import { DidChangeLabelEvent } from '@theia/core/lib/browser/label-provider';

export interface GitCommitNode extends GitCommitDetails {
    fileChanges?: GitFileChange[];
    expanded: boolean;
    selected: boolean;
}

export namespace GitCommitNode {
    // tslint:disable-next-line:no-any
    export function is(node: any): node is GitCommitNode {
        return !!node && 'commitSha' in node && 'commitMessage' in node && 'fileChangeNodes' in node;
    }
}

export type GitHistoryListNode = (GitCommitNode | GitFileChangeNode);

@injectable()
export class GitHistoryWidget extends GitNavigableListWidget<GitHistoryListNode> implements StatefulWidget {
    protected options: Git.Options.Log;
    protected singleFileMode: boolean;
    private cancelIndicator: CancellationTokenSource;
    protected listView: GitHistoryList | undefined;
    protected hasMoreCommits: boolean;
    protected allowScrollToSelected: boolean;

    protected status: {
        state: 'loading',
    } | {
        state: 'ready',
        commits: GitCommitNode[];
    } | {
        state: 'error',
        errorMessage: React.ReactNode
    };

    constructor(
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(GitCommitDetailOpenHandler) protected readonly detailOpenHandler: GitCommitDetailOpenHandler,
        @inject(ApplicationShell) protected readonly shell: ApplicationShell,
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(Git) protected readonly git: Git,
        @inject(ScmAvatarService) protected readonly avatarService: ScmAvatarService,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(GitDiffContribution) protected readonly diffContribution: GitDiffContribution) {
        super();
        this.id = GIT_HISTORY_ID;
        this.scrollContainer = 'git-history-list-container';
        this.title.label = GIT_HISTORY_LABEL;
        this.title.caption = GIT_HISTORY_LABEL;
        this.title.iconClass = 'fa git-history-tab-icon';
        this.title.closable = true;
        this.addClass('theia-git');
        this.resetState();
        this.cancelIndicator = new CancellationTokenSource();
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.labelProvider.onDidChange(event => this.refreshLabels(event)));
    }

    protected async refreshLabels(event: DidChangeLabelEvent): Promise<void> {
        let isAnyAffectedNodes = false;
        for (let i = 0; i < this.gitNodes.length; i++) {
            const gitNode = this.gitNodes[i];
            if (GitFileChangeNode.is(gitNode)) {
                const uri = new URI(gitNode.uri);
                if (event.affects(uri)) {
                    const label = this.labelProvider.getName(uri);
                    const icon = await this.labelProvider.getIcon(uri);
                    this.gitNodes[i] = { ...gitNode, label, icon };
                    isAnyAffectedNodes = true;
                }
            }
        }
        if (isAnyAffectedNodes) {
            this.update();
        }
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.addGitListNavigationKeyListeners(this.node);
        // tslint:disable-next-line:no-any
        this.addEventListener<any>(this.node, 'ps-scroll-y', (e: Event & { target: { scrollTop: number } }) => {
            if (this.listView && this.listView.list && this.listView.list.Grid) {
                const { scrollTop } = e.target;
                this.listView.list.Grid.handleScrollEvent({ scrollTop });
            }
        });
    }

    update(): void {
        if (this.listView && this.listView.list) {
            this.listView.list.forceUpdateGrid();
        }
        super.update();
    }

    async setContent(options?: Git.Options.Log): Promise<void> {
        this.resetState(options);
        if (options && options.uri) {
            const fileStat = await this.fileSystem.getFileStat(options.uri);
            this.singleFileMode = !!fileStat && !fileStat.isDirectory;
        }
        await this.addCommits(options);
        this.onDataReady();
        if (this.gitNodes.length > 0) {
            this.selectNode(this.gitNodes[0]);
        }
    }

    protected resetState(options?: Git.Options.Log): void {
        this.options = options || {};
        this.status = { state: 'loading' };
        this.gitNodes = [];
        this.hasMoreCommits = true;
        this.allowScrollToSelected = true;
    }

    protected async addCommits(options?: Git.Options.Log): Promise<void> {
        let repository: Repository | undefined;
        repository = this.repositoryProvider.findRepositoryOrSelected(options);

        this.cancelIndicator.cancel();
        this.cancelIndicator = new CancellationTokenSource();
        const token = this.cancelIndicator.token;

        if (repository) {
            try {
                const currentCommits = this.status.state === 'ready' ? this.status.commits : [];

                let changes = await this.git.log(repository, options);
                if (token.isCancellationRequested || !this.hasMoreCommits) {
                    return;
                }
                if (options && ((options.maxCount && changes.length < options.maxCount) || (!options.maxCount && currentCommits))) {
                    this.hasMoreCommits = false;
                }
                if (currentCommits.length > 0) {
                    changes = changes.slice(1);
                }
                if (changes.length > 0) {
                    const commits: GitCommitNode[] = [];
                    for (const commit of changes) {
                        const fileChangeNodes: GitFileChangeNode[] = [];
                        const avatarUrl = await this.avatarService.getAvatar(commit.author.email);
                        commits.push({
                            authorName: commit.author.name,
                            authorDate: new Date(commit.author.timestamp),
                            authorEmail: commit.author.email,
                            authorDateRelative: commit.authorDateRelative,
                            authorAvatar: avatarUrl,
                            commitSha: commit.sha,
                            commitMessage: commit.summary,
                            messageBody: commit.body,
                            fileChangeNodes,
                            fileChanges: commit.fileChanges,
                            expanded: false,
                            selected: false
                        });
                    }
                    currentCommits.push(...commits);
                    this.status = { state: 'ready', commits: currentCommits };
                } else if (options && options.uri && repository) {
                    const pathIsUnderVersionControl = await this.git.lsFiles(repository, options.uri, { errorUnmatch: true });
                    if (!pathIsUnderVersionControl) {
                        this.status = { state: 'error', errorMessage: <React.Fragment> It is not under version control.</React.Fragment> };
                    } else {
                        this.status = { state: 'error', errorMessage: <React.Fragment> No commits have been committed.</React.Fragment> };
                    }
                }

            } catch (error) {
                this.status = { state: 'error', errorMessage: error.message };
            }

        } else {
            this.status = { state: 'error', errorMessage: <React.Fragment>There is no repository selected in this workspace.</React.Fragment> };
        }
    }

    protected async addOrRemoveFileChangeNodes(commit: GitCommitNode): Promise<void> {
        const id = this.gitNodes.findIndex(node => node === commit);
        if (commit.expanded) {
            this.removeFileChangeNodes(commit, id);
        } else {
            await this.addFileChangeNodes(commit, id);
        }
        commit.expanded = !commit.expanded;
        this.update();
    }

    protected async addFileChangeNodes(commit: GitCommitNode, gitNodesArrayIndex: number): Promise<void> {
        if (commit.fileChanges) {
            const fileChangeNodes: GitFileChangeNode[] = [];
            await Promise.all(commit.fileChanges.map(async fileChange => {
                const fileChangeUri = new URI(fileChange.uri);
                const icon = await this.labelProvider.getIcon(fileChangeUri);
                const label = this.labelProvider.getName(fileChangeUri);
                const description = this.relativePath(fileChangeUri.parent);
                const caption = this.computeCaption(fileChange);
                fileChangeNodes.push({
                    ...fileChange, icon, label, description, caption, commitSha: commit.commitSha
                });
            }));
            this.gitNodes.splice(gitNodesArrayIndex + 1, 0, ...fileChangeNodes);
        }
    }

    protected removeFileChangeNodes(commit: GitCommitNode, gitNodesArrayIndex: number): void {
        if (commit.fileChanges) {
            this.gitNodes.splice(gitNodesArrayIndex + 1, commit.fileChanges.length);
        }
    }

    storeState(): object {
        const { options, singleFileMode } = this;
        return {
            options,
            singleFileMode
        };
    }

    // tslint:disable-next-line:no-any
    restoreState(oldState: any): void {
        this.options = oldState['options'];
        this.singleFileMode = oldState['singleFileMode'];
        this.setContent(this.options);
    }

    protected onDataReady(): void {
        if (this.status.state === 'ready') {
            this.gitNodes = this.status.commits;
        }
        this.update();
    }

    protected render(): React.ReactNode {
        let content: React.ReactNode;
        switch (this.status.state) {
            case 'ready':
                content = < React.Fragment >
                    {this.renderHistoryHeader()}
                    {this.renderCommitList()}
                </React.Fragment>;
                break;

            case 'error':
                let path: React.ReactNode = '';
                let reason: React.ReactNode;
                reason = this.status.errorMessage;
                if (this.options.uri) {
                    const relPathEncoded = this.relativePath(this.options.uri);
                    const relPath = relPathEncoded ? `${decodeURIComponent(relPathEncoded)}` : '';

                    const repo = this.repositoryProvider.findRepository(new URI(this.options.uri));
                    const repoName = repo ? `${new URI(repo.localUri).displayName}` : '';

                    const relPathAndRepo = [relPath, repoName].filter(Boolean).join(' in ');
                    path = ` for ${relPathAndRepo}`;
                }
                content = <AlertMessage
                    type='WARNING'
                    header={`There is no Git history available${path}.`}>
                    {reason}
                </AlertMessage>;
                break;

            case 'loading':
                content = <div className='spinnerContainer'>
                    <span className='fa fa-spinner fa-pulse fa-3x fa-fw'></span>
                </div>;
                break;
        }
        return <div className='git-diff-container'>
            {content}
        </div>;
    }

    protected renderHistoryHeader(): React.ReactNode {
        if (this.options.uri) {
            const path = this.relativePath(this.options.uri);
            const fileName = path.split('/').pop();
            return <div className='diff-header'>
                {
                    this.renderHeaderRow({ name: 'repository', value: this.getRepositoryLabel(this.options.uri) })
                }
                {
                    this.renderHeaderRow({ name: 'file', value: fileName, title: path })
                }
                <div className='theia-header'>
                    Commits
                </div>
            </div>;
        }
    }

    protected renderCommitList(): React.ReactNode {
        const list = <div className='listContainer' id={this.scrollContainer}>
            <GitHistoryList
                ref={listView => this.listView = (listView || undefined)}
                rows={this.gitNodes}
                hasMoreRows={this.hasMoreCommits}
                indexOfSelected={this.allowScrollToSelected ? this.indexOfSelected : -1}
                handleScroll={this.handleScroll}
                loadMoreRows={this.loadMoreRows}
                renderCommit={this.renderCommit}
                renderFileChangeList={this.renderFileChangeList}
            ></GitHistoryList>
        </div>;
        this.allowScrollToSelected = true;
        return list;
    }

    protected readonly handleScroll = (info: ScrollParams) => this.doHandleScroll(info);
    protected doHandleScroll(info: ScrollParams): void {
        this.node.scrollTop = info.scrollTop;
    }

    protected readonly loadMoreRows = (params: IndexRange) => this.doLoadMoreRows(params);
    // tslint:disable-next-line:no-any
    protected doLoadMoreRows(params: IndexRange): Promise<any> {
        let resolver: () => void;
        const promise = new Promise(resolve => resolver = resolve);
        const lastRow = this.gitNodes[params.stopIndex - 1];
        if (GitCommitNode.is(lastRow)) {
            const toRevision = lastRow.commitSha;
            this.addCommits({
                range: { toRevision },
                maxCount: GIT_HISTORY_MAX_COUNT,
                uri: this.options.uri
            }).then(() => {
                this.allowScrollToSelected = false;
                this.onDataReady();
                resolver();
            });
        }
        return promise;
    }

    protected readonly renderCommit = (commit: GitCommitNode) => this.doRenderCommit(commit);
    protected doRenderCommit(commit: GitCommitNode): React.ReactNode {
        let expansionToggleIcon = 'caret-right';
        if (commit && commit.expanded) {
            expansionToggleIcon = 'caret-down';
        }
        return <div
            className={`containerHead${commit.selected ? ' ' + SELECTED_CLASS : ''}`}
            onClick={
                e => {
                    if (commit.selected && !this.singleFileMode) {
                        this.addOrRemoveFileChangeNodes(commit);
                    } else {
                        this.selectNode(commit);
                    }
                    e.preventDefault();
                }
            }
            onDoubleClick={
                e => {
                    if (this.singleFileMode && commit.fileChanges && commit.fileChanges.length > 0) {
                        this.openFile(commit.fileChanges[0], commit.commitSha);
                    }
                    e.preventDefault();
                }
            }>
            <div className='headContent'><div className='image-container'>
                <img className='gravatar' src={commit.authorAvatar}></img>
            </div>
                <div className={`headLabelContainer${this.singleFileMode ? ' singleFileMode' : ''}`}>
                    <div className='headLabel noWrapInfo noselect'>
                        {commit.commitMessage}
                    </div>
                    <div className='commitTime noWrapInfo noselect'>
                        {commit.authorDateRelative + ' by ' + commit.authorName}
                    </div>
                </div>
                <div className='fa fa-eye detailButton' onClick={() => this.openDetailWidget(commit)}></div>
                {
                    !this.singleFileMode ? <div className='expansionToggle noselect'>
                        <div className='toggle'>
                            <div className='number'>{(commit.fileChanges && commit.fileChanges.length || commit.fileChangeNodes.length).toString()}</div>
                            <div className={'icon fa fa-' + expansionToggleIcon}></div>
                        </div>
                    </div>
                        : ''
                }
            </div>
        </div >;
    }

    protected async openDetailWidget(commit: GitCommitNode): Promise<void> {
        const commitDetails = this.detailOpenHandler.getCommitDetailWidgetOptions(commit);
        this.detailOpenHandler.open(GitCommitDetailUri.toUri(commit.commitSha), {
            ...commitDetails
        } as GitCommitDetailOpenerOptions);
    }

    protected readonly renderFileChangeList = (fileChange: GitFileChangeNode) => this.doRenderFileChangeList(fileChange);
    protected doRenderFileChangeList(fileChange: GitFileChangeNode): React.ReactNode {
        const fileChangeElement: React.ReactNode = this.renderGitItem(fileChange, fileChange.commitSha || '');
        return fileChangeElement;
    }

    protected renderGitItem(change: GitFileChangeNode, commitSha: string): React.ReactNode {
        return <div key={change.uri.toString()} className={`gitItem noselect${change.selected ? ' ' + SELECTED_CLASS : ''}`}>
            <div
                title={change.caption}
                className='noWrapInfo'
                onDoubleClick={() => {
                    this.openFile(change, commitSha);
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

    protected navigateLeft(): void {
        const selected = this.getSelected();
        if (selected && this.status.state === 'ready') {
            const idx = this.status.commits.findIndex(c => c.commitSha === selected.commitSha);
            if (GitCommitNode.is(selected)) {
                if (selected.expanded) {
                    this.addOrRemoveFileChangeNodes(selected);
                } else {
                    if (idx > 0) {
                        this.selectNode(this.status.commits[idx - 1]);
                    }
                }
            } else if (GitFileChangeNode.is(selected)) {
                this.selectNode(this.status.commits[idx]);
            }
        }
        this.update();
    }

    protected navigateRight(): void {
        const selected = this.getSelected();
        if (selected) {
            if (GitCommitNode.is(selected) && !selected.expanded && !this.singleFileMode) {
                this.addOrRemoveFileChangeNodes(selected);
            } else {
                this.selectNextNode();
            }
        }
        this.update();
    }

    protected handleListEnter(): void {
        const selected = this.getSelected();
        if (selected) {
            if (GitCommitNode.is(selected)) {
                if (this.singleFileMode) {
                    this.openFile(selected.fileChangeNodes[0], selected.commitSha);
                } else {
                    this.openDetailWidget(selected);
                }
            } else if (GitFileChangeNode.is(selected)) {
                this.openFile(selected, selected.commitSha || '');
            }
        }
        this.update();
    }

    protected openFile(change: GitFileChange, commitSha: string): void {
        const uri: URI = new URI(change.uri);
        let fromURI = change.oldUri ? new URI(change.oldUri) : uri; // set oldUri on renamed and copied
        fromURI = fromURI.withScheme(GIT_RESOURCE_SCHEME).withQuery(commitSha + '~1');
        const toURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(commitSha);
        let uriToOpen = uri;
        if (change.status === GitFileStatus.Deleted) {
            uriToOpen = fromURI;
        } else if (change.status === GitFileStatus.New) {
            uriToOpen = toURI;
        } else {
            uriToOpen = DiffUris.encode(fromURI, toURI);
        }
        open(this.openerService, uriToOpen, { mode: 'reveal' });
    }
}

export namespace GitHistoryList {
    export interface Props {
        readonly rows: GitHistoryListNode[]
        readonly indexOfSelected: number
        readonly hasMoreRows: boolean
        readonly handleScroll: (info: { clientHeight: number; scrollHeight: number; scrollTop: number }) => void
        // tslint:disable-next-line:no-any
        readonly loadMoreRows: (params: IndexRange) => Promise<any>
        readonly renderCommit: (commit: GitCommitNode) => React.ReactNode
        readonly renderFileChangeList: (fileChange: GitFileChangeNode) => React.ReactNode
    }
}
export class GitHistoryList extends React.Component<GitHistoryList.Props> {
    list: List | undefined;

    protected readonly checkIfRowIsLoaded = (opts: { index: number }) => this.doCheckIfRowIsLoaded(opts);
    protected doCheckIfRowIsLoaded(opts: { index: number }): boolean {
        const row = this.props.rows[opts.index];
        return !!row;
    }

    render(): React.ReactNode {
        return <InfiniteLoader
            isRowLoaded={this.checkIfRowIsLoaded}
            loadMoreRows={this.props.loadMoreRows}
            rowCount={this.props.rows.length + 1}
            threshold={15}
        >
            {
                ({ onRowsRendered, registerChild }) => (
                    <AutoSizer>
                        {
                            ({ width, height }) => <List
                                className='commitList'
                                ref={list => {
                                    this.list = (list || undefined);
                                    registerChild(list);
                                }}
                                width={width}
                                height={height}
                                onRowsRendered={onRowsRendered}
                                rowRenderer={this.measureRowRenderer}
                                rowHeight={this.measureCache.rowHeight}
                                rowCount={this.props.hasMoreRows ? this.props.rows.length + 1 : this.props.rows.length}
                                tabIndex={-1}
                                onScroll={this.props.handleScroll}
                                scrollToIndex={this.props.indexOfSelected}
                                style={{
                                    overflowY: 'visible',
                                    overflowX: 'visible'
                                }}
                            />
                        }
                    </AutoSizer>
                )
            }
        </InfiniteLoader>;
    }

    componentWillUpdate(): void {
        this.measureCache.clearAll();
    }

    protected measureCache = new CellMeasurerCache();

    protected measureRowRenderer: ListRowRenderer = (params: ListRowProps) => {
        const { index, key, parent } = params;
        return (
            <CellMeasurer
                cache={this.measureCache}
                columnIndex={0}
                key={key}
                rowIndex={index}
                parent={parent}
            >
                {() => this.renderRow(params)}
            </CellMeasurer>
        );
    }

    protected renderRow: ListRowRenderer = ({ index, key, style }) => {
        if (this.checkIfRowIsLoaded({ index })) {
            const row = this.props.rows[index];
            if (GitCommitNode.is(row)) {
                const head = this.props.renderCommit(row);
                return <div key={key} style={style} className={`commitListElement${index === 0 ? ' first' : ''}`} >
                    {head}
                </div>;
            } else if (GitFileChangeNode.is(row)) {
                return <div key={key} style={style} className='fileChangeListElement'>
                    {this.props.renderFileChangeList(row)}
                </div>;
            }
        } else {
            return <div key={key} style={style} className={`commitListElement${index === 0 ? ' first' : ''}`} >
                <span className='fa fa-spinner fa-pulse fa-fw'></span>
            </div>;
        }
    }
}
