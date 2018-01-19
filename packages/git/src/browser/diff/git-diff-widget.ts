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
import { VirtualRenderer, open, OpenerService, StatefulWidget } from "@theia/core/lib/browser";
import { GitRepositoryProvider } from '../git-repository-provider';
import { GIT_RESOURCE_SCHEME } from '../git-resource';
import URI from "@theia/core/lib/common/uri";
import { GitFileChange, GitFileStatus, Git } from '../../common';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { GitBaseWidget } from "../git-base-widget";
import { GitFileChangeNode } from "../git-widget";

@injectable()
export class GitDiffWidget extends GitBaseWidget implements StatefulWidget {

    protected fileChangeNodes: GitFileChangeNode[];
    protected options: Git.Options.Diff;

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(GitRepositoryProvider) protected repositoryProvider: GitRepositoryProvider,
        @inject(LabelProvider) protected labelProvider: LabelProvider,
        @inject(OpenerService) protected openerService: OpenerService) {
        super(repositoryProvider, labelProvider);
        this.id = GIT_DIFF;
        this.title.label = "Diff";

        this.addClass('theia-git');
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
        const commitishBar = this.renderDiffListHeader();
        const fileChangeList = this.renderFileChangeList();
        return h.div({ className: "git-diff-container" }, VirtualRenderer.flatten([commitishBar, fileChangeList]));
    }

    protected renderDiffListHeader(): h.Child {
        const elements = [];
        if (this.options.uri) {
            const path = this.relativePath(this.options.uri);
            if (path.length > 0) {
                elements.push(h.div({ className: 'header-row' },
                    h.div({ className: 'theia-header' }, 'path:'),
                    h.div({ className: 'header-value' }, '/' + path)));
            }
        }
        if (this.fromRevision) {
            let revision;
            if (typeof this.fromRevision === 'string') {
                revision = h.div({ className: 'header-value' }, this.fromRevision);
            } else {
                revision = h.div({ className: 'header-value' }, (this.toRevision || 'HEAD') + '~' + this.fromRevision);
            }
            elements.push(h.div({ className: 'header-row' },
                h.div({ className: 'theia-header' }, 'revision: '),
                revision));
        }
        const header = h.div({ className: 'theia-header' }, 'Files changed');

        return h.div({ className: "diff-header" }, ...elements, header);
    }

    protected renderFileChangeList(): h.Child {
        const files: h.Child[] = [];

        for (const fileChange of this.fileChangeNodes) {
            const fileChangeElement: h.Child = this.renderGitItem(fileChange);
            files.push(fileChangeElement);
        }
        return h.div({ className: "listContainer" }, ...files);
    }

    protected renderGitItem(change: GitFileChangeNode): h.Child {
        const iconSpan = h.span({ className: change.icon + ' file-icon' });
        const nameSpan = h.span({ className: 'name' }, change.label + ' ');
        const pathSpan = h.span({ className: 'path' }, change.description);
        const elements = [];
        elements.push(h.div({
            title: change.caption,
            className: 'noWrapInfo',
            ondblclick: () => {
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
                open(this.openerService, uriToOpen).catch(e => {
                    console.error(e);
                });
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
        return h.div({ className: 'gitItem noselect' }, ...elements);
    }
}
