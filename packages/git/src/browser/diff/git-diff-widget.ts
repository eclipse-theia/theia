/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { GitDiffCommitModel, GitDiffFileChanges, GitLogOptions, GitDiffModel } from './git-diff-model';
import { injectable, inject } from "inversify";
import { h, VirtualElement } from "@phosphor/virtualdom";
import { GIT_DIFF } from "./git-diff-contribution";
import { DiffUris } from '@theia/editor/lib/browser/diff-uris';
import { VirtualRenderer, open, VirtualWidget, OpenerService, Menu } from "@theia/core/lib/browser";
import { GitRepositoryProvider } from '../git-repository-provider';
import { GIT_RESOURCE_SCHEME } from '../git-resource';
import URI from "@theia/core/lib/common/uri";
import { GitFileChange, GitFileStatus, GitUtils } from '../../common';
import { GitDiffCommitUri } from './git-diff-commit-uri';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { CommandRegistry } from '@phosphor/commands';

@injectable()
export class GitDiffWidget extends VirtualWidget {

    protected commits: GitDiffCommitModel[];
    protected diff: GitDiffFileChanges;
    protected gitLogOptions: GitLogOptions;
    protected dom: h.Child;
    protected fileChanges: GitFileChange[];

    constructor(
        @inject(GitDiffModel) protected model: GitDiffModel,
        @inject(GitRepositoryProvider) protected repositoryProvider: GitRepositoryProvider,
        @inject(LabelProvider) protected labelProvider: LabelProvider,
        @inject(OpenerService) protected openerService: OpenerService) {
        super();
        this.id = GIT_DIFF;
        this.title.label = "Files changed";

        this.addClass('theia-git');
        this.updateView();

        this.model.onDidUpdateData(gitDiffData => {
            this.commits = gitDiffData.commits;
            this.diff = gitDiffData.diff;
            this.gitLogOptions = gitDiffData.gitLogOptions;
            this.updateView();
        });

    }

    async updateView(commit?: GitDiffCommitModel) {
        const commitishBar = await this.renderCommitishBar();
        const commitSelection = this.renderCommitSelection();
        let toRevision = '';
        if (commit) {
            toRevision = commit.commit.commitSha;
            this.fileChanges = commit.commit.fileChanges;
        }
        let fromRevision;
        if (!commit && this.gitLogOptions.fromRevision && this.gitLogOptions.toRevision) {
            fromRevision = this.gitLogOptions.fromRevision.toString();
            toRevision = this.gitLogOptions.toRevision;
            this.fileChanges = this.diff.fileChanges;
        }
        const fileChangeList = await this.renderFileChangeList(this.fileChanges, toRevision, fromRevision);
        this.dom = h.div({ className: "git-diff-container" }, VirtualRenderer.flatten([commitishBar, commitSelection, fileChangeList]));
        this.update();
    }

    protected render(): h.Child {
        return this.dom;
    }

    protected async renderCommitishBar(): Promise<h.Child> {
        if (this.gitLogOptions) {
            let fileDiv: h.Child;
            if (this.gitLogOptions.fileUri) {
                const repository = this.repositoryProvider.selectedRepository;
                const [icon, label, path] = await Promise.all([
                    this.labelProvider.getIcon(this.gitLogOptions.fileUri),
                    this.labelProvider.getName(this.gitLogOptions.fileUri),
                    repository ? GitUtils.getRepositoryRelativePath(repository, this.gitLogOptions.fileUri) : this.labelProvider.getLongName(this.gitLogOptions.fileUri)
                ]);
                const iconSpan = h.span({ className: icon + ' file-icon' });
                const nameSpan = h.span({ className: 'name' }, label + ' ');
                const pathSpan = h.span({ className: 'path' }, path);
                fileDiv = h.div({ className: "gitItem" }, h.div({ className: "noWrapInfo" }, 'Compare ', iconSpan, nameSpan, pathSpan));
            } else {
                fileDiv = '';
            }
            const toDiv = this.gitLogOptions.toRevision ? h.div({ className: "revision noWrapInfo" }, 'in: ' + this.gitLogOptions.toRevision) : '';
            const fromDiv = this.gitLogOptions.fromRevision ? h.div({ className: "revision noWrapInfo" }, 'with: ' + this.gitLogOptions.fromRevision) : '';
            return h.div({ className: "commitishBar" }, fileDiv, toDiv, fromDiv);
        }
        return '';
    }

    protected renderCommitSelection(): h.Child {
        const commands = new CommandRegistry();
        const renderer = new CommitRenderer();
        const commitSelection = new Menu({
            commands,
            renderer
        });
        commands.addCommand('git-diff', {
            execute: args => {
                this.updateView();
            }
        });
        commitSelection.addItem({
            command: 'git-diff'
        });
        for (const commit of this.commits) {
            commands.addCommand(commit.commit.commitSha, {
                execute: args => {
                    this.updateView(commit);
                }
            });
            const commitItem: CommitItem = commitSelection.addItem({
                command: commit.commit.commitSha
            });
            commitItem.commit = commit;
        }
        return h.div(
            {
                className: 'commitSelectionContainer',
                onclick: event => {
                    const target = event.target as HTMLElement;
                    commitSelection.open(event.clientX - event.offsetX, event.clientY - event.offsetY + target.clientHeight);
                }
            }, 'Menu');
    }

    // protected async renderDiffContainer(): Promise<h.Child> {
    //     if (this.gitLogOptions && this.gitLogOptions.toRevision && this.gitLogOptions.fromRevision && typeof this.gitLogOptions.fromRevision === 'string') {
    //         const diffListHead = this.renderCommitListHead(this.diff);
    //         const body = this.diff.expanded ? await this.renderFileChangeList(this.diff.fileChanges, this.gitLogOptions.toRevision, this.gitLogOptions.fromRevision) : "";
    //         return h.div({ className: "commitListElement" }, diffListHead, body);
    //     }
    //     return "";
    // }

    // protected async renderCommitListContainer(): Promise<h.Child> {
    //     const theList: h.Child[] = [];
    //     const diffContainer = await this.renderDiffContainer();
    //     for (const commit of this.commits) {
    //         if (GitDiffCollapsibleListModel.is(commit)) {
    //             const head = this.renderCommitListHead(commit);
    //             const body = commit.expanded ? await this.renderFileChangeList(commit.commit.fileChanges, commit.commit.commitSha) : "";
    //             theList.push(h.div({ className: "commitListElement" }, head, body));
    //         }
    //     }
    //     const commitList = h.div({ className: "commitList" }, diffContainer, ...theList);
    //     return h.div({ className: "commitListContainer" }, commitList);
    // }

    protected async renderFileChangeList(fileChanges: GitFileChange[], commitSha: string, toCommitSha?: string): Promise<h.Child> {
        const files: h.Child[] = [];

        for (const fileChange of fileChanges) {
            const fileChangeElement: h.Child = await this.renderGitItem(fileChange, commitSha, toCommitSha);
            files.push(fileChangeElement);
        }

        return h.div({ className: "commitFileList" }, ...files);
    }

    protected async renderGitItem(change: GitFileChange, commitSha: string, fromCommitSha?: string): Promise<h.Child> {
        const repository = this.repositoryProvider.selectedRepository;
        const uri: URI = new URI(change.uri);
        const [icon, label, path] = await Promise.all([
            this.labelProvider.getIcon(uri),
            this.labelProvider.getName(uri),
            repository ? GitUtils.getRepositoryRelativePath(repository, uri) : this.labelProvider.getLongName(uri)
        ]);
        const iconSpan = h.span({ className: icon + ' file-icon' });
        const nameSpan = h.span({ className: 'name' }, label + ' ');
        const pathSpan = h.span({ className: 'path' }, path);
        const nameAndPathDiv = h.div({
            className: 'noWrapInfo',
            ondblclick: () => {
                let diffuri: URI | undefined;
                if (change.status !== GitFileStatus.New) {
                    let fromURI: URI;
                    if (fromCommitSha) {
                        fromURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(fromCommitSha);
                    } else {
                        fromURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(commitSha + "~1");
                    }
                    const toURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(commitSha);
                    diffuri = DiffUris.encode(fromURI, toURI, uri.displayName);
                }
                if (diffuri) {
                    open(this.openerService, diffuri);
                }
            }
        }, iconSpan, nameSpan, pathSpan);
        const statusDiv = h.div({ className: 'status ' + GitFileStatus[change.status].toLowerCase() }, this.getStatusChar(change.status, change.staged || false));
        return h.div({ className: 'gitItem noselect' }, nameAndPathDiv, statusDiv);
    }

    protected getStatusChar(status: GitFileStatus, staged: boolean): string {
        switch (status) {
            case GitFileStatus.New:
            case GitFileStatus.Renamed:
            case GitFileStatus.Copied: return staged ? 'A' : 'U';
            case GitFileStatus.Modified: return 'M';
            case GitFileStatus.Deleted: return 'D';
            case GitFileStatus.Conflicted: return 'C';
        }
        return '';
    }

}

class CommitRenderer implements Menu.IRenderer {
    renderItem(data: Menu.IRenderData): VirtualElement {
        const item = data.item;
        let subject: h.Child = '';
        let sha: h.Child = '';
        let subline: h.Child = '';
        if (CommitItem.is(item) && item.commit) {
            subject = h.div({ className: 'subject' }, item.commit.commit.commitMessage);
            sha = h.div({ className: 'sha' }, item.commit.commit.commitSha);
            subline = h.div({}, item.commit.commit.authorName + ' ' + item.commit.commit.authorDateRelative);
        }
        const subjectContainer = h.div({ className: 'subjectContainer' }, subject, sha);
        const authorContainer = h.div({ className: 'subline' }, subline);
        return h.div({ className: 'commitSelectionItem' }, subjectContainer, authorContainer);
    }
}

interface CommitItem extends Menu.IItem {
    commit?: GitDiffCommitModel
}

namespace CommitItem {
    export function is(item: CommitItem): item is CommitItem {
        return 'commit' in item;
    }
}
