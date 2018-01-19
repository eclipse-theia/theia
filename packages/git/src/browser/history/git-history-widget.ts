/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { h } from "@phosphor/virtualdom";
import { DiffUris } from '@theia/editor/lib/browser/diff-uris';
import { VirtualWidget, VirtualRenderer, OpenerService, open } from "@theia/core/lib/browser";
import { GIT_RESOURCE_SCHEME } from '../git-resource';
import URI from "@theia/core/lib/common/uri";
import { GIT_HISTORY_WIDGET } from './git-history-contribution';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { GitRepositoryProvider } from '../git-repository-provider';
import { GitFileChange, GitFileStatus, GitUtils } from '../../common';
import { GitDiffCollapsibleListModel, GitDiffCommitModel, GitLogOptions, GitDiffModel, GitDiffFileChanges } from '../diff/git-diff-model';
import { GitDiffCommitUri } from "../diff/git-diff-commit-uri";

@injectable()
export class GitHistoryWidget extends VirtualWidget {
    protected commits: GitDiffCommitModel[];
    protected gitLogOptions: GitLogOptions;
    protected dom: h.Child;

    constructor(
        @inject(GitDiffModel) protected model: GitDiffModel,
        @inject(GitRepositoryProvider) protected repositoryProvider: GitRepositoryProvider,
        @inject(LabelProvider) protected labelProvider: LabelProvider,
        @inject(OpenerService) protected openerService: OpenerService) {
        super();

        this.id = GIT_HISTORY_WIDGET;
        this.title.label = "Git history";

        this.addClass('theia-git');
        this.updateView();

        this.model.onDidUpdateData(gitDiffData => {
            this.commits = gitDiffData.commits;
            this.gitLogOptions = gitDiffData.gitLogOptions;
            this.updateView();
        });

    }

    async updateView() {
        const commitishBar = await this.renderCommitishBar();
        const commitsContainer = await this.renderCommitListContainer();
        this.dom = h.div({ className: "git-history-container" }, VirtualRenderer.flatten([commitishBar, commitsContainer]));
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
                fileDiv = h.div({ className: "gitItem" }, h.div({ className: "noWrapInfo" }, iconSpan, nameSpan, pathSpan));
            } else {
                fileDiv = '';
            }
            return h.div({ className: "commitishBar" }, fileDiv);
        }
        return '';
    }

    protected async renderCommitListContainer(): Promise<h.Child> {
        const theList: h.Child[] = [];
        for (const commit of this.commits) {
            if (GitDiffCollapsibleListModel.is(commit)) {
                const head = this.renderCommitListHead(commit);
                const body = commit.expanded ? await this.renderFileChangeList(commit.commit.fileChanges, commit.commit.commitSha) : "";
                theList.push(h.div({ className: "commitListElement" }, head, body));
            }
        }
        const commitList = h.div({ className: "commitList" }, ...theList);
        return h.div({ className: "commitListContainer" }, commitList);
    }

    protected renderCommitListHead(model: GitDiffCollapsibleListModel): h.Child {
        let expansionToggleIcon = "caret-right";
        if (model && model.expanded) {
            expansionToggleIcon = "caret-down";
        }
        let actualFileChanges;
        if (GitDiffCommitModel.is(model)) {
            actualFileChanges = model.commit.fileChanges;
        } else if (GitDiffFileChanges.is(model)) {
            actualFileChanges = model.fileChanges;
        }
        if (actualFileChanges) {
            const expansionToggle = h.div(
                {
                    className: "expansionToggle",
                    onclick: event => {
                        model.toggleExpansion();
                        this.updateView();
                    }
                },
                h.div({ className: "toggle" },
                    h.div({ className: "number" }, actualFileChanges.length.toString()),
                    h.div({ className: "icon fa fa-" + expansionToggleIcon })));
            const label = h.div(
                {
                    className: "headLabelContainer",
                    onclick: event => {
                        open(this.openerService, GitDiffCommitUri.toUri(model.label));
                    }
                },
                h.div(
                    {
                        className: "headLabel noWrapInfo"
                    },
                    model.label),
                (GitDiffCommitModel.is(model) ? h.div(
                    {
                        className: "commitTime noWrapInfo"
                    },
                    model.commit.authorDateRelative + ' by ' + model.commit.authorName
                ) : "")
            );
            const content = h.div({ className: "headContent" }, VirtualRenderer.flatten([label, expansionToggle]));
            return h.div({
                className: "containerHead"
            }, content);
        }
        return "";
    }

    protected async renderFileChangeList(fileChanges: GitFileChange[], commitSha: string, toCommitSha?: string): Promise<h.Child> {
        const files: h.Child[] = [];

        for (const fileChange of fileChanges) {
            const fileChangeElement: h.Child = await this.renderGitItem(fileChange, commitSha, toCommitSha);
            files.push(fileChangeElement);
        }

        const commitFiles = h.div({ className: "commitFileList" }, ...files);
        return h.div({ className: "commitBody" }, commitFiles);
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
