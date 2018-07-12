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

import { injectable, inject } from "inversify";
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { OpenerService, open, StatefulWidget, SELECTED_CLASS, WidgetManager, ApplicationShell, Message } from "@theia/core/lib/browser";
import { GIT_RESOURCE_SCHEME } from '../git-resource';
import URI from "@theia/core/lib/common/uri";
import { GIT_HISTORY, GIT_HISTORY_MAX_COUNT } from './git-history-contribution';
import { GitFileStatus, Git, GitFileChange } from '../../common';
import { FileSystem } from "@theia/filesystem/lib/common";
import { GitDiffContribution } from "../diff/git-diff-contribution";
import { GitAvatarService } from "./git-avatar-service";
import { GitCommitDetailUri, GitCommitDetailOpenerOptions, GitCommitDetailOpenHandler } from "./git-commit-detail-open-handler";
import { GitCommitDetails } from "./git-commit-detail-widget";
import { GitNavigableListWidget } from "../git-navigable-list-widget";
import { GitFileChangeNode } from "../git-widget";
import { Disposable } from "vscode-jsonrpc";
import * as React from "react";

export interface GitCommitNode extends GitCommitDetails {
    fileChanges?: GitFileChange[];
    expanded: boolean;
    selected: boolean;
}

export namespace GitCommitNode {
    export function is(node: any): node is GitCommitNode {
        return 'commitSha' in node && 'commitMessage' in node && 'fileChangeNodes' in node;
    }
}

export type GitHistoryListNode = (GitCommitNode | GitFileChangeNode);

@injectable()
export class GitHistoryWidget extends GitNavigableListWidget<GitHistoryListNode> implements StatefulWidget {
    protected options: Git.Options.Log;
    protected commits: GitCommitNode[];
    protected ready: boolean;
    protected singleFileMode: boolean;

    constructor(
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(GitCommitDetailOpenHandler) protected readonly detailOpenHandler: GitCommitDetailOpenHandler,
        @inject(ApplicationShell) protected readonly shell: ApplicationShell,
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(Git) protected readonly git: Git,
        @inject(GitAvatarService) protected readonly avartarService: GitAvatarService,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(GitDiffContribution) protected readonly diffContribution: GitDiffContribution) {
        super();
        this.id = GIT_HISTORY;
        this.scrollContainer = 'git-history-list-container';
        this.title.label = "Git History";
        this.addClass('theia-git');
    }

    protected onAfterAttach(msg: Message) {
        super.onAfterAttach(msg);
        (async () => {
            const sc = await this.getScrollContainer();
            const listener = (e: UIEvent) => {
                const el = (e.srcElement || e.target) as HTMLElement;
                if (el.scrollTop + el.clientHeight > el.scrollHeight - 83) {
                    const ll = this.node.getElementsByClassName('history-lazy-loading')[0];
                    ll.className = "history-lazy-loading show";
                    this.addCommits({
                        range: {
                            toRevision: this.commits[this.commits.length - 1].commitSha
                        },
                        maxCount: GIT_HISTORY_MAX_COUNT
                    });
                }
            };
            sc.addEventListener("scroll", listener);
            this.toDispose.push(Disposable.create(() => {
                sc.removeEventListener("scroll", listener);
            }));
        })();
    }

    async setContent(options?: Git.Options.Log) {
        this.options = options || {};
        this.ready = false;
        if (options && options.uri) {
            const fileStat = await this.fileSystem.getFileStat(options.uri);
            this.singleFileMode = !!fileStat && !fileStat.isDirectory;
        }
        this.addCommits(options);
        this.update();
    }

    protected addCommits(options?: Git.Options.Log) {
        const repository = this.repositoryProvider.selectedRepository;
        if (repository) {
            const log = this.git.log(repository, options);
            log.then(async changes => {
                this.commits = [];
                if (this.commits.length > 0) {
                    changes = changes.slice(1);
                }
                if (changes.length > 0) {
                    const commits: GitCommitNode[] = [];
                    for (const commit of changes) {
                        const fileChangeNodes: GitFileChangeNode[] = [];
                        const avatarUrl = await this.avartarService.getAvatar(commit.author.email);
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
                    this.commits.push(...commits);
                }
                this.onDataReady();
            });
        } else {
            this.commits = [];
            this.onDataReady();
        }
    }

    protected async addFileChangeNodesToCommit(commit: GitCommitNode) {
        if (commit.fileChanges) {
            await Promise.all(commit.fileChanges.map(async fileChange => {
                const fileChangeUri = new URI(fileChange.uri);
                const icon = await this.labelProvider.getIcon(fileChangeUri);
                const label = this.labelProvider.getName(fileChangeUri);
                const description = this.relativePath(fileChangeUri.parent);
                const caption = this.computeCaption(fileChange);
                commit.fileChangeNodes.push({
                    ...fileChange, icon, label, description, caption, commitSha: commit.commitSha
                });
            }));
            delete commit.fileChanges;
            this.update();
        }
    }

    storeState(): object {
        const { commits, options, singleFileMode } = this;
        return {
            commits,
            options,
            singleFileMode
        };
    }

    // tslint:disable-next-line:no-any
    restoreState(oldState: any): void {
        this.commits = oldState['commits'];
        this.options = oldState['options'];
        this.singleFileMode = oldState['singleFileMode'];
        this.ready = true;
        this.update();
    }

    protected onDataReady(): void {
        this.ready = true;
        this.update();
        const ll = this.node.getElementsByClassName('history-lazy-loading')[0];
        if (ll && ll.className === "history-lazy-loading show") {
            ll.className = "history-lazy-loading hide";
        }
    }

    protected render(): React.ReactNode {
        this.gitNodes = [];
        return <div className="git-diff-container">
            {
                this.ready ?
                    < React.Fragment >
                        {this.renderHistoryHeader()}
                        {this.renderCommitList()}
                        <div className='history-lazy-loading'>
                            <span className="fa fa-spinner fa-pulse fa-2x fa-fw"></span>
                        </div>
                    </React.Fragment>
                    :
                    <div className='spinnerContainer'>
                        <span className='fa fa-spinner fa-pulse fa-3x fa-fw'></span>
                    </div>
            }
        </div>;
    }

    protected renderHistoryHeader(): React.ReactNode {
        if (this.options.uri) {
            const path = this.relativePath(this.options.uri);
            return <div className="diff-header">
                {
                    path.length > 0 ?
                        <div className='header-row'>
                            <div className='theia-header'>
                                path:
                                </div>
                            <div className='header-value'>
                                {'/' + path}
                            </div>
                        </div>
                        : ''
                }
                <div className='theia-header'>
                    Commits
                </div>
            </div>;
        }
    }

    protected renderCommitList(): React.ReactNode {
        const theList: React.ReactNode[] = [];

        for (const commit of this.commits) {
            const head = this.renderCommit(commit);
            const body = commit.expanded ? this.renderFileChangeList(commit) : "";
            theList.push(<div key={commit.commitSha} className="commitListElement">{head}{body}</div>);
        }
        const commitList = <div className="commitList">{...theList}</div>;
        return <div className="listContainer" id={this.scrollContainer}>{commitList}</div>;
    }

    protected renderCommit(commit: GitCommitNode): React.ReactNode {
        this.gitNodes.push(commit);
        let expansionToggleIcon = "caret-right";
        if (commit && commit.expanded) {
            expansionToggleIcon = "caret-down";
        }
        return <div
            className={`containerHead${commit.selected ? ' ' + SELECTED_CLASS : ''}`}
            onClick={
                () => {
                    if (commit.selected && !this.singleFileMode) {
                        commit.expanded = !commit.expanded;
                        if (commit.expanded) {
                            this.addFileChangeNodesToCommit(commit);
                        }
                        this.update();
                    } else {
                        this.selectNode(commit);
                    }
                }
            }
            onDoubleClick={
                () => {
                    if (this.singleFileMode) {
                        this.openFile(commit.fileChangeNodes[0], commit.commitSha);
                    }
                }
            }>
            <div className="headContent"><div className="image-container">
                <img className="gravatar" src={commit.authorAvatar}></img>
            </div>
                <div className={`headLabelContainer${this.singleFileMode ? ' singleFileMode' : ''}`}>
                    <div className="headLabel noWrapInfo noselect">
                        {commit.commitMessage}
                    </div>
                    <div className="commitTime noWrapInfo noselect">
                        {commit.authorDateRelative + ' by ' + commit.authorName}
                    </div>
                </div>
                <div className="fa fa-eye detailButton" onClick={() => this.openDetailWidget(commit)}></div>
                {
                    !this.singleFileMode ? <div className="expansionToggle noselect">
                        <div className="toggle">
                            <div className="number">{(commit.fileChanges && commit.fileChanges.length || commit.fileChangeNodes.length).toString()}</div>
                            <div className={"icon fa fa-" + expansionToggleIcon}></div>
                        </div>
                    </div>
                        : ''
                }
            </div>
        </div >;
    }

    protected async openDetailWidget(commit: GitCommitNode) {
        const commitDetails = this.detailOpenHandler.getCommitDetailWidgetOptions(commit);
        this.detailOpenHandler.open(GitCommitDetailUri.toUri(commit.commitSha), {
            ...commitDetails
        } as GitCommitDetailOpenerOptions);
    }

    protected renderFileChangeList(commit: GitCommitNode): React.ReactNode {
        const fileChanges = commit.fileChangeNodes;

        this.gitNodes.push(...fileChanges);

        const files: React.ReactNode[] = [];

        for (const fileChange of fileChanges) {
            const fileChangeElement: React.ReactNode = this.renderGitItem(fileChange, commit.commitSha);
            files.push(fileChangeElement);
        }
        return <div className="commitBody"><div className="commitFileList">{...files}</div></div>;
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
        if (selected) {
            const idx = this.commits.findIndex(c => c.commitSha === selected.commitSha);
            if (GitCommitNode.is(selected)) {
                if (selected.expanded) {
                    selected.expanded = false;
                } else {
                    if (idx > 0) {
                        this.selectNode(this.commits[idx - 1]);
                    }
                }
            } else if (GitFileChangeNode.is(selected)) {
                this.selectNode(this.commits[idx]);
            }
        }
        this.update();
    }

    protected navigateRight(): void {
        const selected = this.getSelected();
        if (selected) {
            if (GitCommitNode.is(selected) && !selected.expanded && !this.singleFileMode) {
                selected.expanded = true;
                this.addFileChangeNodesToCommit(selected);
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
                this.openFile(selected, selected.commitSha || "");
            }
        }
        this.update();
    }

    protected openFile(change: GitFileChange, commitSha: string) {
        const uri: URI = new URI(change.uri);
        let fromURI = change.oldUri ? new URI(change.oldUri) : uri; // set oldUri on renamed and copied
        fromURI = fromURI.withScheme(GIT_RESOURCE_SCHEME).withQuery(commitSha + "~1");
        const toURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(commitSha);
        let uriToOpen = uri;
        if (change.status === GitFileStatus.Deleted) {
            uriToOpen = fromURI;
        } else if (change.status === GitFileStatus.New) {
            uriToOpen = toURI;
        } else {
            uriToOpen = DiffUris.encode(fromURI, toURI, uri.displayName);
        }
        open(this.openerService, uriToOpen, { mode: 'reveal' });
    }
}
