// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { DisposableCollection } from '@theia/core';
import { OpenerService, open, StatefulWidget, SELECTED_CLASS, WidgetManager, ApplicationShell, codicon } from '@theia/core/lib/browser';
import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { Message } from '@theia/core/shared/@phosphor/messaging';
import { Virtuoso, VirtuosoHandle } from '@theia/core/shared/react-virtuoso';
import URI from '@theia/core/lib/common/uri';
import { ScmFileChange, ScmFileChangeNode } from '../scm-file-change-node';
import { ScmAvatarService } from '@theia/scm/lib/browser/scm-avatar-service';
import { ScmItemComponent, ScmNavigableListWidget } from '../scm-navigable-list-widget';
import * as React from '@theia/core/shared/react';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { nls } from '@theia/core/lib/common/nls';
import { ScmHistoryProvider } from './scm-history-provider';
import throttle = require('@theia/core/shared/lodash.throttle');
import { HistoryWidgetOptions, ScmCommitNode, ScmHistoryListNode, ScmHistorySupport, SCM_HISTORY_ID, SCM_HISTORY_LABEL, SCM_HISTORY_MAX_COUNT } from './scm-history-constants';
export { HistoryWidgetOptions, ScmCommitNode, ScmHistoryListNode, ScmHistorySupport };

@injectable()
export class ScmHistoryWidget extends ScmNavigableListWidget<ScmHistoryListNode> implements StatefulWidget {
    protected options: HistoryWidgetOptions;
    protected singleFileMode: boolean;
    private cancelIndicator: CancellationTokenSource;
    protected listView: ScmHistoryList | undefined;
    protected hasMoreCommits: boolean;
    protected allowScrollToSelected: boolean;

    protected status: {
        state: 'loading',
    } | {
        state: 'ready',
        commits: ScmCommitNode[];
    } | {
        state: 'error',
        errorMessage: React.ReactNode
    };

    protected readonly toDisposeOnRepositoryChange = new DisposableCollection();

    protected historySupport: ScmHistorySupport | undefined;

    constructor(
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(ApplicationShell) protected readonly shell: ApplicationShell,
        @inject(FileService) protected readonly fileService: FileService,
        @inject(ScmAvatarService) protected readonly avatarService: ScmAvatarService,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
    ) {
        super();
        this.id = SCM_HISTORY_ID;
        this.scrollContainer = 'scm-history-list-container';
        this.title.label = SCM_HISTORY_LABEL;
        this.title.caption = SCM_HISTORY_LABEL;
        this.title.iconClass = codicon('history');
        this.title.closable = true;
        this.addClass('theia-scm');
        this.addClass('theia-scm-history');
        this.status = { state: 'loading' };
        this.resetState();
        this.cancelIndicator = new CancellationTokenSource();
    }

    @postConstruct()
    protected init(): void {
        this.refreshOnRepositoryChange();
        this.toDispose.push(this.scmService.onDidChangeSelectedRepository(() => this.refreshOnRepositoryChange()));
        this.toDispose.push(this.labelProvider.onDidChange(event => {
            if (this.scmNodes.some(node => ScmFileChangeNode.is(node) && event.affects(new URI(node.fileChange.uri)))) {
                this.update();
            }
        }));
    }

    protected refreshOnRepositoryChange(): void {
        this.toDisposeOnRepositoryChange.dispose();

        const repository = this.scmService.selectedRepository;
        if (repository && ScmHistoryProvider.is(repository.provider)) {
            this.historySupport = repository.provider.historySupport;
            if (this.historySupport) {
                this.toDisposeOnRepositoryChange.push(this.historySupport.onDidChangeHistory(() => this.setContent(this.options)));
            }
        } else {
            this.historySupport = undefined;
        }
        this.setContent(this.options);

        // If switching repository, discard options because they are specific to a repository
        this.options = this.createHistoryOptions();

        this.refresh();
    }

    protected createHistoryOptions(): HistoryWidgetOptions {
        return {
            maxCount: SCM_HISTORY_MAX_COUNT
        };
    }

    protected readonly toDisposeOnRefresh = new DisposableCollection();
    protected refresh(): void {
        this.toDisposeOnRefresh.dispose();
        this.toDispose.push(this.toDisposeOnRefresh);
        const repository = this.scmService.selectedRepository;
        this.title.label = SCM_HISTORY_LABEL;
        if (repository) {
            this.title.label += ': ' + repository.provider.label;
        }
        const area = this.shell.getAreaFor(this);
        if (area === 'left') {
            this.shell.leftPanelHandler.refresh();
        } else if (area === 'right') {
            this.shell.rightPanelHandler.refresh();
        }
        this.update();

        if (repository) {
            this.toDisposeOnRefresh.push(repository.onDidChange(() => this.update()));
            // render synchronously to avoid cursor jumping
            // see https://stackoverflow.com/questions/28922275/in-reactjs-why-does-setstate-behave-differently-when-called-synchronously/28922465#28922465
            this.toDisposeOnRefresh.push(repository.input.onDidChange(() => this.setContent(this.options)));
        }
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.addListNavigationKeyListeners(this.node);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.addEventListener<any>(this.node, 'ps-scroll-y', (e: Event & { target: { scrollTop: number } }) => {
            if (this.listView?.list) {
                const { scrollTop } = e.target;
                this.listView.list.scrollTo({
                    top: scrollTop
                });
            }
        });
    }

    setContent = throttle((options?: HistoryWidgetOptions) => this.doSetContent(options), 100);

    protected async doSetContent(options?: HistoryWidgetOptions): Promise<void> {
        this.resetState(options);
        if (options && options.uri) {
            try {
                const fileStat = await this.fileService.resolve(new URI(options.uri));
                this.singleFileMode = !fileStat.isDirectory;
            } catch {
                this.singleFileMode = true;
            }
        }
        await this.addCommits(options);
        this.onDataReady();
        if (this.scmNodes.length > 0) {
            this.selectNode(this.scmNodes[0]);
        }
    }

    protected resetState(options?: HistoryWidgetOptions): void {
        this.options = options || this.createHistoryOptions();
        this.hasMoreCommits = true;
        this.allowScrollToSelected = true;
    }

    protected async addCommits(options?: HistoryWidgetOptions): Promise<void> {
        // const repository: Repository | undefined = this.repositoryProvider.findRepositoryOrSelected(options);
        const repository = this.scmService.selectedRepository;

        this.cancelIndicator.cancel();
        this.cancelIndicator = new CancellationTokenSource();
        const token = this.cancelIndicator.token;

        if (repository) {
            if (this.historySupport) {
                try {
                    const currentCommits = this.status.state === 'ready' ? this.status.commits : [];

                    let history = await this.historySupport.getCommitHistory(options);
                    if (token.isCancellationRequested || !this.hasMoreCommits) {
                        return;
                    }

                    if (options && ((options.maxCount && history.length < options.maxCount) || (!options.maxCount && currentCommits))) {
                        this.hasMoreCommits = false;
                    }
                    if (currentCommits.length > 0) {
                        history = history.slice(1);
                    }
                    const commits: ScmCommitNode[] = [];
                    for (const commit of history) {
                        const fileChangeNodes: ScmFileChangeNode[] = [];
                        await Promise.all(commit.fileChanges.map(async fileChange => {
                            fileChangeNodes.push({
                                fileChange, commitId: commit.id
                            });
                        }));

                        const avatarUrl = await this.avatarService.getAvatar(commit.authorEmail);
                        commits.push({
                            commitDetails: commit,
                            authorAvatar: avatarUrl,
                            fileChangeNodes,
                            expanded: false,
                            selected: false
                        });
                    }
                    currentCommits.push(...commits);
                    this.status = { state: 'ready', commits: currentCommits };
                } catch (error) {
                    if (options && options.uri && repository) {
                        this.hasMoreCommits = false;
                    }
                    this.status = { state: 'error', errorMessage: <React.Fragment> {error.message} </React.Fragment> };
                }
            } else {
                this.status = { state: 'error', errorMessage: <React.Fragment>History is not supported for {repository.provider.label} source control.</React.Fragment> };
            }
        } else {
            this.status = {
                state: 'error',
                errorMessage: <React.Fragment>{nls.localizeByDefault('No source control providers registered.')}</React.Fragment>
            };
        }
    }

    protected async addOrRemoveFileChangeNodes(commit: ScmCommitNode): Promise<void> {
        const id = this.scmNodes.findIndex(node => node === commit);
        if (commit.expanded) {
            this.removeFileChangeNodes(commit, id);
        } else {
            await this.addFileChangeNodes(commit, id);
        }
        commit.expanded = !commit.expanded;
        this.update();
    }

    protected async addFileChangeNodes(commit: ScmCommitNode, scmNodesArrayIndex: number): Promise<void> {
        if (commit.fileChangeNodes) {
            this.scmNodes.splice(scmNodesArrayIndex + 1, 0, ...commit.fileChangeNodes.map(node =>
                Object.assign(node, { commitSha: commit.commitDetails.id })
            ));
        }
    }

    protected removeFileChangeNodes(commit: ScmCommitNode, scmNodesArrayIndex: number): void {
        if (commit.fileChangeNodes) {
            this.scmNodes.splice(scmNodesArrayIndex + 1, commit.fileChangeNodes.length);
        }
    }

    storeState(): object {
        const { options, singleFileMode } = this;
        return {
            options,
            singleFileMode
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    restoreState(oldState: any): void {
        this.options = oldState['options'];
        this.options.maxCount = SCM_HISTORY_MAX_COUNT;
        this.singleFileMode = oldState['singleFileMode'];
        this.setContent(this.options);
    }

    protected onDataReady(): void {
        if (this.status.state === 'ready') {
            this.scmNodes = this.status.commits;
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
                const reason: React.ReactNode = this.status.errorMessage;
                let path: React.ReactNode = '';
                if (this.options.uri) {
                    const relPathEncoded = this.scmLabelProvider.relativePath(this.options.uri);
                    const relPath = relPathEncoded ? `${decodeURIComponent(relPathEncoded)}` : '';

                    const repo = this.scmService.findRepository(new URI(this.options.uri));
                    const repoName = repo ? `${this.labelProvider.getName(new URI(repo.provider.rootUri))}` : '';

                    const relPathAndRepo = [relPath, repoName].filter(Boolean).join(' in ');
                    path = ` for ${relPathAndRepo}`;
                }
                content = <AlertMessage
                    type='WARNING'
                    header={`There is no history available${path}.`}>
                    {reason}
                </AlertMessage>;
                break;

            case 'loading':
                content = <div className='spinnerContainer'>
                    <span className={`${codicon('loading')} theia-animation-spin large-spinner`}></span>
                </div>;
                break;
        }
        return <div className='history-container'>
            {content}
        </div>;
    }

    protected renderHistoryHeader(): React.ReactNode {
        if (this.options.uri) {
            const path = this.scmLabelProvider.relativePath(this.options.uri);
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
            <ScmHistoryList
                ref={listView => this.listView = (listView || undefined)}
                rows={this.scmNodes}
                hasMoreRows={this.hasMoreCommits}
                loadMoreRows={this.loadMoreRows}
                renderCommit={this.renderCommit}
                renderFileChangeList={this.renderFileChangeList}
            ></ScmHistoryList>
        </div>;
        this.allowScrollToSelected = true;
        return list;
    }

    protected readonly loadMoreRows = (index: number) => this.doLoadMoreRows(index);
    protected doLoadMoreRows(index: number): Promise<void> {
        let resolver: () => void;
        const promise = new Promise<void>(resolve => resolver = resolve);
        const lastRow = this.scmNodes[index - 1];
        if (ScmCommitNode.is(lastRow)) {
            const toRevision = lastRow.commitDetails.id;
            this.addCommits({
                range: { toRevision },
                maxCount: SCM_HISTORY_MAX_COUNT,
                uri: this.options.uri
            }).then(() => {
                this.allowScrollToSelected = false;
                this.onDataReady();
                resolver();
            });
        }
        return promise;
    }

    protected readonly renderCommit = (commit: ScmCommitNode) => this.doRenderCommit(commit);
    protected doRenderCommit(commit: ScmCommitNode): React.ReactNode {
        let expansionToggleIcon = codicon('chevron-right');
        if (commit && commit.expanded) {
            expansionToggleIcon = codicon('chevron-down');
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
                    if (this.singleFileMode && commit.fileChangeNodes.length > 0) {
                        this.openFile(commit.fileChangeNodes[0].fileChange);
                    }
                    e.preventDefault();
                }
            }
        >
            <div className='headContent'><div className='image-container'>
                <img className='gravatar' src={commit.authorAvatar}></img>
            </div>
                <div className={`headLabelContainer${this.singleFileMode ? ' singleFileMode' : ''}`}>
                    <div className='headLabel noWrapInfo noselect'>
                        {commit.commitDetails.summary}
                    </div>
                    <div className='commitTime noWrapInfo noselect'>
                        {commit.commitDetails.authorDateRelative + ' by ' + commit.commitDetails.authorName}
                    </div>
                </div>
                <div className={`${codicon('eye')} detailButton`} onClick={() => this.openDetailWidget(commit)}></div>
                {!this.singleFileMode && <div className='expansionToggle noselect'>
                    <div className='toggle'>
                        <div className='number'>{commit.commitDetails.fileChanges.length.toString()}</div>
                        <div className={'icon ' + expansionToggleIcon}></div>
                    </div>
                </div>}
            </div>
        </div >;
    }

    protected async openDetailWidget(commitNode: ScmCommitNode): Promise<void> {
        const options = {
            ...commitNode.commitDetails.commitDetailOptions,
            mode: 'reveal'
        };
        open(
            this.openerService,
            commitNode.commitDetails.commitDetailUri,
            options
        );
    }

    protected readonly renderFileChangeList = (fileChange: ScmFileChangeNode) => this.doRenderFileChangeList(fileChange);
    protected doRenderFileChangeList(fileChange: ScmFileChangeNode): React.ReactNode {
        const fileChangeElement: React.ReactNode = this.renderScmItem(fileChange, fileChange.commitId);
        return fileChangeElement;
    }

    protected renderScmItem(change: ScmFileChangeNode, commitSha: string): React.ReactNode {
        return <ScmItemComponent key={change.fileChange.uri.toString()} {...{
            labelProvider: this.labelProvider,
            scmLabelProvider: this.scmLabelProvider,
            change,
            revealChange: () => this.openFile(change.fileChange),
            selectNode: () => this.selectNode(change)
        }} />;
    }

    protected override navigateLeft(): void {
        const selected = this.getSelected();
        if (selected && this.status.state === 'ready') {
            if (ScmCommitNode.is(selected)) {
                const idx = this.status.commits.findIndex(c => c.commitDetails.id === selected.commitDetails.id);
                if (selected.expanded) {
                    this.addOrRemoveFileChangeNodes(selected);
                } else {
                    if (idx > 0) {
                        this.selectNode(this.status.commits[idx - 1]);
                    }
                }
            } else if (ScmFileChangeNode.is(selected)) {
                const idx = this.status.commits.findIndex(c => c.commitDetails.id === selected.commitId);
                this.selectNode(this.status.commits[idx]);
            }
        }
        this.update();
    }

    protected override navigateRight(): void {
        const selected = this.getSelected();
        if (selected) {
            if (ScmCommitNode.is(selected) && !selected.expanded && !this.singleFileMode) {
                this.addOrRemoveFileChangeNodes(selected);
            } else {
                this.selectNextNode();
            }
        }
        this.update();
    }

    protected override handleListEnter(): void {
        const selected = this.getSelected();
        if (selected) {
            if (ScmCommitNode.is(selected)) {
                if (this.singleFileMode) {
                    this.openFile(selected.fileChangeNodes[0].fileChange);
                } else {
                    this.openDetailWidget(selected);
                }
            } else if (ScmFileChangeNode.is(selected)) {
                this.openFile(selected.fileChange);
            }
        }
        this.update();
    }

    protected openFile(change: ScmFileChange): void {
        const uriToOpen = change.getUriToOpen();
        open(this.openerService, uriToOpen, { mode: 'reveal' });
    }
}

export namespace ScmHistoryList {
    export interface Props {
        readonly rows: ScmHistoryListNode[]
        readonly hasMoreRows: boolean
        readonly loadMoreRows: (index: number) => Promise<void>
        readonly renderCommit: (commit: ScmCommitNode) => React.ReactNode
        readonly renderFileChangeList: (fileChange: ScmFileChangeNode) => React.ReactNode
    }
}
export class ScmHistoryList extends React.Component<ScmHistoryList.Props> {
    list: VirtuosoHandle | undefined;

    protected readonly checkIfRowIsLoaded = (opts: { index: number }) => this.doCheckIfRowIsLoaded(opts);
    protected doCheckIfRowIsLoaded(opts: { index: number }): boolean {
        const row = this.props.rows[opts.index];
        return !!row;
    }

    override render(): React.ReactNode {
        const { hasMoreRows, loadMoreRows, rows } = this.props;
        return <Virtuoso
            ref={list => this.list = (list || undefined)}
            data={rows}
            itemContent={index => this.renderRow(index)}
            endReached={hasMoreRows ? loadMoreRows : undefined}
            overscan={500}
            style={{
                overflowX: 'hidden'
            }}
        />;
    }

    protected renderRow(index: number): React.ReactNode {
        if (this.checkIfRowIsLoaded({ index })) {
            const row = this.props.rows[index];
            if (ScmCommitNode.is(row)) {
                const head = this.props.renderCommit(row);
                return <div className={`commitListElement${index === 0 ? ' first' : ''}`} >
                    {head}
                </div>;
            } else if (ScmFileChangeNode.is(row)) {
                return <div className='fileChangeListElement'>
                    {this.props.renderFileChangeList(row)}
                </div>;
            }
        } else {
            return <div className={`commitListElement${index === 0 ? ' first' : ''}`} >
                <span className={`${codicon('loading')} theia-animation-spin`}></span>
            </div>;
        }
    };
}
