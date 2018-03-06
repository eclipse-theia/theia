/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { h } from "@phosphor/virtualdom";
import { Widget } from "@phosphor/widgets";
import { LabelProvider } from "@theia/core/lib/browser";
import { Git, GitFileChange } from "../../common";
import { GitDiffWidget } from "../diff/git-diff-widget";
import { GitRepositoryProvider } from "../git-repository-provider";
import { GitFileChangeNode } from "../git-widget";

export const GIT_COMMIT_DETAIL = "git-commit-detail-widget";

export interface GitCommitDetails {
    readonly authorName: string;
    readonly authorEmail: string;
    readonly authorDate: Date;
    readonly authorDateRelative: string;
    readonly authorAvatar: string;
    readonly commitMessage: string;
    readonly messageBody?: string;
    readonly fileChangeNodes: GitFileChangeNode[];
    readonly commitSha: string;
}

export const GitCommitDetailWidgetOptions = Symbol("GitCommitDetailWidgetOptions");
export interface GitCommitDetailWidgetOptions extends GitCommitDetails {
    readonly range: Git.Options.Range
}

@injectable()
export class GitCommitDetailWidget extends GitDiffWidget {

    constructor(
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        @inject(GitCommitDetailWidgetOptions) protected readonly commitDetailOptions: GitCommitDetailWidgetOptions
    ) {
        super();
        this.id = "commit" + commitDetailOptions.commitSha;
        this.title.label = commitDetailOptions.commitSha;
        this.options = { range: commitDetailOptions.range };
        this.title.closable = true;
        this.title.iconClass = "icon-git-commit tab-git-icon";
    }

    protected renderDiffListHeader(): h.Child {
        const elements = [];
        const authorEMail = this.commitDetailOptions.authorEmail;
        const subject = h.div({ className: "subject" }, this.commitDetailOptions.commitMessage);
        const body = h.div({ className: "body" }, this.commitDetailOptions.messageBody || "");
        const subjectRow = h.div({ className: "header-row" }, h.div({ className: "subjectContainer" }, subject, body));
        const author = h.div({ className: "author header-value noWrapInfo" }, this.commitDetailOptions.authorName);
        const mail = h.div({ className: "mail header-value noWrapInfo" }, `<${authorEMail}>`);
        const authorRow = h.div({ className: "header-row noWrapInfo" }, h.div({ className: 'theia-header' }, 'author: '), author);
        const mailRow = h.div({ className: "header-row noWrapInfo" }, h.div({ className: 'theia-header' }, 'e-mail: '), mail);
        const authorDate = this.commitDetailOptions.authorDate;
        const dateStr = authorDate.toLocaleDateString('en', {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour12: true,
            hour: "numeric",
            minute: "numeric"
        });
        const date = h.div({ className: "date header-value noWrapInfo" }, dateStr);
        const dateRow = h.div({ className: "header-row noWrapInfo" }, h.div({ className: 'theia-header' }, 'date: '), date);
        const revisionRow = h.div({ className: 'header-row noWrapInfo' },
            h.div({ className: 'theia-header' }, 'revision: '),
            h.div({ className: 'header-value noWrapInfo' }, this.commitDetailOptions.commitSha));
        const gravatar = h.div({ className: "image-container" },
            h.img({ className: "gravatar", src: this.commitDetailOptions.authorAvatar }));
        const commitInfo = h.div({ className: "header-row commit-info-row" }, gravatar, h.div({ className: "commit-info" }, authorRow, mailRow, dateRow, revisionRow));
        elements.push(subjectRow, commitInfo);
        const header = h.div({ className: 'theia-header' }, 'Files changed');

        return h.div({ className: "diff-header" }, ...elements, header);
    }

    protected ref: Widget | undefined;
    protected async revealChange(change: GitFileChange): Promise<void> {
        const ref = this.ref;
        const widget = await this.openChange(change, {
            mode: 'reveal',
            widgetOptions: ref ?
                { area: 'main', mode: 'tab-after', ref } :
                { area: 'main', mode: 'split-right', ref: this }
        });
        this.ref = widget instanceof Widget ? widget : undefined;
        if (this.ref) {
            this.ref.disposed.connect(() => {
                if (this.ref === widget) {
                    this.ref = undefined;
                }
            });
        }
    }

}
