/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { GitFileChange } from '../../common';
import { Event, Emitter } from '@theia/core/lib/common';
import { injectable } from "inversify";
import URI from '@theia/core/lib/common/uri';

@injectable()
export class GitDiffModel {
    protected data: GitDiffData;
    protected readonly onDidUpdateDataEmitter = new Emitter<GitDiffData>();

    get onDidUpdateData(): Event<GitDiffData> {
        return this.onDidUpdateDataEmitter.event;
    }

    updateModel(commitFragments: CommitFragment[], fileChanges: GitFileChange[], gitLogOptions: GitLogOptions) {
        const commits = commitFragments.map(d => new GitDiffCommitImpl(d));
        const diff = new GitDiffFileChangesImpl(fileChanges);
        this.data = { commits, diff, gitLogOptions };
        this.onDidUpdateDataEmitter.fire(this.data);
    }
}

export interface GitDiffData {
    gitLogOptions: GitLogOptions;
    commits: GitDiffCommitModel[];
    diff: GitDiffFileChanges;
}

/**
 * Options for further refining the `git log` commands.
 */
export interface GitLogOptions {

    /**
     * The uri of a file to run the `git log` command. If not set, the log for all files in the given range are fetched.
     */
    readonly fileUri?: URI;

    /**
     * The name of the branch to run the `git log` command. If not specified, then the currently active branch will be used.
     */
    readonly branch?: string;

    /**
     * The last revision that should be included among the result running this query. Here, the revision can be a tag, a commitish,
     * or even an expression (`HEAD~3`). For more details to specify the revision, see [here](https://git-scm.com/docs/gitrevisions#_specifying_revisions).
     */
    readonly toRevision?: string;

    /**
     * Either the from revision (`string`) or a positive integer that is equivalent to the `~` suffix, which means the commit object that is the `fromRevision`<sup>th</sup>
     * generation ancestor of the named, `toRevision` commit object, following only the first parents. If not specified, equivalent to `git log origin..toRevision`.
     */
    readonly fromRevision?: number | string;

    /**
     * Limits the number of commits. Also known as `-n` or `--number. If not specified, or not a positive integer, then will be ignored, and the returning list
     * of commits will not be limited.
     */
    readonly maxCount?: number;

}

export interface CommitFragment {

    /**
     * The name of the author.
     */
    readonly authorName: string;

    /**
     * The email address of the author.
     */
    readonly authorEmail: string;

    /**
     * The date when the commit was authored.
     */
    readonly authorDate: Date;

    /**
     * The date when the commit was authored.
     */
    readonly authorDateRelative: string;

    /**
     * The commit message.
     */
    readonly commitMessage: string;

    /**
     * The message body.
     */
    // readonly messageBody: string;

    /**
     * The number of file changes per commit.
     */
    readonly fileChanges: GitFileChange[];

    /**
     * The commit SHA.
     */
    readonly commitSha: string;
}

export interface GitDiffCollapsibleListModel {
    label: string;
    expanded: boolean;
    selected: boolean;
    toggleExpansion: () => void;
    toggleSelectionState: () => void;
}

export namespace GitDiffCollapsibleListModel {
    export function is(model: any): model is GitDiffCollapsibleListModel {
        return 'label' in model && 'expanded' in model && 'selected' in model;
    }
}

export class GitDiffCollapsibleListModelImpl implements GitDiffCollapsibleListModel {
    protected _expanded: boolean = false;
    protected _selected: boolean = false;

    label: string;

    get expanded(): boolean {
        return this._expanded;
    }

    get selected(): boolean {
        return this._selected;
    }

    toggleSelectionState() {
        this._selected = !this._selected;
    }

    toggleExpansion() {
        this._expanded = !this._expanded;
    }
}

export type GitDiffCommitModel = GitDiffCollapsibleListModel & { commit: CommitFragment };
export namespace GitDiffCommitModel {
    export function is(model: any): model is GitDiffCommitModel {
        return GitDiffCollapsibleListModel.is(model) && 'commit' in model;
    }
}

export class GitDiffCommitImpl extends GitDiffCollapsibleListModelImpl implements GitDiffCommitModel {

    constructor(protected readonly _commit: CommitFragment) {
        super();
    }

    get commit(): CommitFragment {
        return this._commit;
    }

    get label(): string {
        return this._commit.commitMessage;
    }
}

export type GitDiffFileChanges = GitDiffCollapsibleListModel & { fileChanges: GitFileChange[] };
export namespace GitDiffFileChanges {
    export function is(model: any): model is GitDiffFileChanges {
        return GitDiffCollapsibleListModel.is(model) && "fileChanges" in model;
    }
}

export class GitDiffFileChangesImpl extends GitDiffCollapsibleListModelImpl implements GitDiffFileChanges {

    constructor(protected readonly _fileChanges: GitFileChange[]) {
        super();
    }

    get fileChanges(): GitFileChange[] {
        return this._fileChanges;
    }

    get label(): string {
        return "diff";
    }

}
