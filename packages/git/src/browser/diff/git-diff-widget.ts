/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { h } from "@phosphor/virtualdom";
import { GIT_DIFF } from "./git-diff-contribution";
import { DiffUris } from '@theia/editor/lib/browser/diff-uris';
import { GitDiffViewOptions } from './git-diff-model';
import { VirtualRenderer, open, OpenerService, StatefulWidget } from "@theia/core/lib/browser";
import { GitRepositoryProvider } from '../git-repository-provider';
import { GIT_RESOURCE_SCHEME } from '../git-resource';
import URI from "@theia/core/lib/common/uri";
import { GitFileChange, GitFileStatus, Git } from '../../common';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { GitBaseWidget } from "../git-base-widget";
import { GitFileChangeNode } from "../git-widget";

export interface GitDiffFileDescription {
    icon: string,
    label: string,
    path: string
}

export interface GitDiffViewModel {
    title?: string;
    fileChangeNodes: GitFileChangeNode[];
    toRevision?: string;
    fromRevision?: string | number;
    gitDiffFile?: GitDiffFileDescription
}

export namespace GitDiffViewModel {
    export function is(model: any): model is GitDiffViewModel {
        return 'fileChangeNodes' in model;
    }
}

@injectable()
export class GitDiffWidget extends GitBaseWidget implements StatefulWidget {

    protected viewModel: GitDiffViewModel;

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(GitRepositoryProvider) protected repositoryProvider: GitRepositoryProvider,
        @inject(LabelProvider) protected labelProvider: LabelProvider,
        @inject(OpenerService) protected openerService: OpenerService) {
        super();
        this.id = GIT_DIFF;
        this.title.label = "Files changed";

        this.addClass('theia-git');
    }

    async initialize(options: GitDiffViewOptions) {
        const repository = this.repositoryProvider.selectedRepository;
        if (repository) {
            const fileChanges: GitFileChange[] = await this.git.diff(repository, {
                range: options.range,
                uri: options.uri
            });
            const fileChangeNodes: GitFileChangeNode[] = [];
            for (const fileChange of fileChanges) {
                const uri = fileChange.uri;
                const fileChangeUri = new URI(uri);
                const status = fileChange.status;
                const [icon, label, description] = await Promise.all([
                    this.labelProvider.getIcon(fileChangeUri),
                    this.labelProvider.getName(fileChangeUri),
                    repository ? this.getRepositoryRelativePath(repository, fileChangeUri) : this.labelProvider.getLongName(fileChangeUri)
                ]);
                fileChangeNodes.push({
                    icon, label, description, uri, status
                });
            }
            let gitDiffFile: GitDiffFileDescription | undefined = undefined;
            if (options.uri) {
                const uri: URI = new URI(options.uri);
                const [icon, label, path] = await Promise.all([
                    this.labelProvider.getIcon(uri),
                    this.labelProvider.getName(uri),
                    repository ? this.getRepositoryRelativePath(repository, uri) : this.labelProvider.getLongName(uri)
                ]);
                gitDiffFile = {
                    icon, label, path
                };
            }
            const title = options.title;
            let toRevision: string | undefined = undefined;
            let fromRevision: string | number | undefined = undefined;
            if (options.range) {
                toRevision = options.range.toRevision;
                fromRevision = options.range.fromRevision ? options.range.fromRevision.toString() : undefined;
            }
            this.viewModel = {
                gitDiffFile,
                title,
                fileChangeNodes,
                toRevision,
                fromRevision
            };
            this.update();
        }
    }

    storeState(): object {
        return this.viewModel;
    }

    restoreState(oldState: object): void {
        if (GitDiffViewModel.is(oldState)) {
            this.viewModel = oldState;
            this.update();
        }
    }

    protected render(): h.Child {
        const commitishBar = this.renderDiffListHeader();
        const fileChangeList = this.renderFileChangeList();
        return h.div({ className: "git-diff-container" }, VirtualRenderer.flatten([commitishBar, fileChangeList]));
    }

    protected renderDiffListHeader(): h.Child {
        let fileDiv: h.Child = '';
        if (this.viewModel.gitDiffFile && !this.viewModel.title) {
            const iconSpan = h.span({ className: this.viewModel.gitDiffFile.icon + ' file-icon' });
            const nameSpan = h.span({ className: 'name' }, this.viewModel.gitDiffFile.label + ' ');
            const pathSpan = h.span({ className: 'path' }, this.viewModel.gitDiffFile.path);
            const compareDiv = h.span({}, 'Compare ');
            fileDiv = h.div({ className: "gitItem diff-file" }, h.div({ className: "noWrapInfo" }, compareDiv, iconSpan, nameSpan, pathSpan));
            const withSpan = h.span({ className: 'row-title' }, 'with ');
            const fromDiv =
                this.viewModel.fromRevision && typeof this.viewModel.fromRevision !== 'number' ?
                    h.div({ className: "revision noWrapInfo" }, withSpan, this.viewModel.fromRevision.toString()) :
                    'previous revision';
            return h.div({ className: "commitishBar" }, fileDiv, fromDiv);
        } else {
            const header = this.viewModel.title ? h.div({ className: 'git-diff-header' }, this.viewModel.title) : '';
            return h.div({ className: "commitishBar" }, header);
        }
    }

    protected renderFileChangeList(): h.Child {
        const files: h.Child[] = [];

        for (const fileChange of this.viewModel.fileChangeNodes) {
            const fileChangeElement: h.Child = this.renderGitItem(fileChange);
            files.push(fileChangeElement);
        }
        const header = h.div({ className: 'theia-header' }, 'Files changed');
        const list = h.div({ className: "commitFileList" }, ...files);
        return h.div({ className: "commitFileListContainer" }, header, list);
    }

    protected renderGitItem(change: GitFileChangeNode): h.Child {
        const uri: URI = new URI(change.uri);

        const iconSpan = h.span({ className: change.icon + ' file-icon' });
        const nameSpan = h.span({ className: 'name' }, change.label + ' ');
        const pathSpan = h.span({ className: 'path' }, change.description);
        const nameAndPathDiv = h.div({
            className: 'noWrapInfo',
            ondblclick: () => {
                let diffuri: URI | undefined;
                let fromURI: URI;
                if (this.viewModel.fromRevision && typeof this.viewModel.fromRevision !== 'number') {
                    fromURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.viewModel.fromRevision);
                } else if (this.viewModel.fromRevision) {
                    fromURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.viewModel.toRevision + "~" + this.viewModel.fromRevision);
                } else {
                    fromURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.viewModel.toRevision + "~1");
                }
                let toURI;
                if (this.viewModel.toRevision) {
                    toURI = uri.withScheme(GIT_RESOURCE_SCHEME).withQuery(this.viewModel.toRevision);
                } else {
                    toURI = uri;
                }
                diffuri = DiffUris.encode(fromURI, toURI, uri.displayName);
                if (diffuri) {
                    open(this.openerService, diffuri).catch(e => {
                        // if we cant open in diff editor due to an error then open in single editor.
                        open(this.openerService, uri);
                    });
                }
            }
        }, iconSpan, nameSpan, pathSpan);
        const statusDiv = h.div({
            title: this.getStatusCaption(change.status, true),
            className: 'status staged ' + GitFileStatus[change.status].toLowerCase()
        }, this.getStatusCaption(change.status, true).charAt(0));
        return h.div({ className: 'gitItem noselect' }, nameAndPathDiv, statusDiv);
    }
}
