/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import URI from '@theia/core/lib/common/uri';
import { Path } from '@theia/core';

export interface WorkingDirectoryStatus {

    /**
     * `true` if the repository exists, otherwise `false`.
     */
    readonly exists: boolean;

    /**
     * An array of changed files.
     */
    readonly changes: HgFileChange[];

    /**
     * The optional name of the branch. Can be absent.
     */
    readonly branch?: string;

    /**
     * The name of the upstream branch. Optional.
     */
    readonly upstreamBranch?: string;

    /**
     * Wraps the `ahead` and `behind` numbers.
     */
    readonly aheadBehind?: { ahead: number, behind: number };

    /**
     * The hash string of the current HEAD.
     */
    readonly currentHead?: string;

    /**
     * `true` if a limit was specified and reached during get `hg status`, so this result is not complete. Otherwise, (including `undefined`) is complete.
     */
    readonly incomplete?: boolean;

}

export namespace WorkingDirectoryStatus {

    /**
     * `true` if the directory statuses are deep equal, otherwise `false`.
     */
    export function equals(left: WorkingDirectoryStatus | undefined, right: WorkingDirectoryStatus | undefined): boolean {
        if (left && right) {
            return left.exists === right.exists
                && left.branch === right.branch
                && left.upstreamBranch === right.upstreamBranch
                && left.currentHead === right.currentHead
                && (left.aheadBehind ? left.aheadBehind.ahead : -1) === (right.aheadBehind ? right.aheadBehind.ahead : -1)
                && (left.aheadBehind ? left.aheadBehind.behind : -1) === (right.aheadBehind ? right.aheadBehind.behind : -1)
                && left.changes.length === right.changes.length
                && !!left.incomplete === !!right.incomplete
                && JSON.stringify(left) === JSON.stringify(right);
        } else {
            return left === right;
        }
    }

}

/**
 * Enumeration of states that a file resource can have in the working directory.
 */
export enum HgFileStatus {
    New,
    Untracked,
    // Copied,
    Modified,
    Removed,
    Deleted,
    // Conflicted,
    Clean,
    Ignored,
}

export namespace HgFileStatus {

    /**
     * Compares the statuses based on the natural order of the enumeration.
     */
    export const statusCompare = (left: HgFileStatus, right: HgFileStatus): number => left - right;

    /**
     * Returns with human readable representation of the Hg file status argument. If the `staged` argument is `undefined`,
     * it will be treated as `false`.
     */
    export const toString = (status: HgFileStatus): string => {
        switch (status) {
            case HgFileStatus.Untracked: return 'Untracked';
            case HgFileStatus.New: return 'Added';
            case HgFileStatus.Removed: return 'Removed';
            case HgFileStatus.Clean: return 'Clean';
            case HgFileStatus.Modified: return 'Modified';
            case HgFileStatus.Deleted: return 'Deleted';
            case HgFileStatus.Ignored: return 'Ignored';
            default: throw new Error(`Unexpected Hg file stats: ${status}.`);
        }
    };

    /**
     * Returns with the human readable abbreviation of the Hg file status argument. `staged` argument defaults to `false`.
     */
    export const toAbbreviation = (status: HgFileStatus): string => HgFileStatus.toString(status).charAt(0);

    export function getColor(status: HgFileStatus): string {
        switch (status) {
            case HgFileStatus.Clean: // Fall through.
            case HgFileStatus.Ignored: // Fall through.
            case HgFileStatus.Untracked: // Fall through.
            case HgFileStatus.New: return 'var(--theia-success-color0)';
            case HgFileStatus.Modified: return 'var(--theia-brand-color0)';
            case HgFileStatus.Deleted: return 'var(--theia-warn-color0)';
            case HgFileStatus.Removed: return 'var(--theia-error-color0)';
        }
    }

}

/**
 * Representation of an individual file change in the working directory.
 */
export interface HgFileChange {

    /**
     * The current URI of the changed file resource.
     */
    readonly uri: string;

    /**
     * The file status.
     */
    readonly status: HgFileStatus;

    /**
     * The previous URI of the changed URI. Can be absent if the file is new, or just changed and so on.
     */
    readonly oldUri?: string;

    /**
     * Set only if status is Add
     */
    readonly originOfAdd?: string;
}

/**
 * An object encapsulating the changes to a committed file.
 */
export interface CommittedFileChange extends HgFileChange {

    /**
     * A commit SHA or some other identifier that ultimately dereferences to a commit.
     * This is the pointer to the `after` version of this change. For instance, the parent of this
     * commit will contain the `before` (or nothing, if the file change represents a new file).
     */
    readonly commitish: string;

}

/**
 * Bare minimum representation of a local Hg clone.
 */
export interface Repository {

    /**
     * The FS URI of the local clone.
     */
    readonly localUri: string;

}

export namespace Repository {
    export function equal(repository: Repository | undefined, repository2: Repository | undefined): boolean {
        if (repository && repository2) {
            return repository.localUri === repository2.localUri;
        }
        return repository === repository2;
    }
    export function is(repository: Object | undefined): repository is Repository {
        return !!repository && 'localUri' in repository;
    }
    export function relativePath(repository: Repository | URI, uri: URI | string): Path | undefined {
        const repositoryUri = new URI(Repository.is(repository) ? repository.localUri : String(repository));
        return repositoryUri.relative(new URI(String(uri)));
    }
    export const sortComparator = (ra: Repository, rb: Repository) => rb.localUri.length - ra.localUri.length;
}

/**
 * Representation of a Hg remote.
 */
export interface Remote {

    /**
     * The name of the remote.
     */
    readonly remoteName: string,

    /**
     * The remote hg url.
     */
    readonly url: string,

}

/**
 * The branch type. Either local or remote.
 * The order matters.
 */
export enum BranchType {

    /**
     * The local branch type.
     */
    Local = 0,

    /**
     * The remote branch type.
     */
    Remote = 1

}

/**
 * Representation of a Hg branch.
 */
export interface Branch {

    /**
     * The short name of the branch. For instance; `master`.
     */
    readonly name: string;

    /**
     * The remote-prefixed upstream name. For instance; `origin/master`.
     */
    readonly upstream?: string;

    /**
     * The type of branch. Could be either [local](BranchType.Local) or [remote](BranchType.Remote).
     */
    readonly type: BranchType;

    /**
     * The commit associated with this branch.
     */
    readonly tip: Commit;

    /**
     * The name of the remote of the upstream.
     */
    readonly remote?: string;

    /**
     * The name of the branch's upstream without the remote prefix.
     */
    readonly upstreamWithoutRemote?: string;

    /**
     * The name of the branch without the remote prefix. If the branch is a local
     * branch, this is the same as its `name`.
     */
    readonly nameWithoutRemote: string;

}

/**
 * Representation of a Hg tag.
 */
export interface Tag {

    /**
     * The name of the tag.
     */
    readonly name: string;
}

/**
 * A Hg commit.
 */
export interface Commit {

    /**
     * The commit SHA.
     */
    readonly sha: string;

    /**
     * The first line of the commit message.
     */
    readonly summary: string;

    /**
     * The commit message without the first line and CR.
     */
    readonly body?: string;

    /**
     * Information about the author of this commit. It includes name, email and date.
     */
    readonly author: CommitIdentity;

    /**
     * The SHAs for the parents of the commit.
     */
    readonly parentSHAs?: string[];

}

/**
 * Representation of a Hg commit, plus the changes that were performed in that particular commit.
 */
export interface CommitWithChanges extends Commit {

    /**
     * The date when the commit was authored.
     */
    readonly authorDateRelative: string;

    /**
     * The number of file changes per commit.
     */
    readonly fileChanges: HgFileChange[];
}

/**
 * A tuple of name, email, and a date for the author or commit info in a commit.
 */
export interface CommitIdentity {

    /**
     * The name and email address for the user who did the commit.
     */
    readonly nameAndEmail: string;

    /**
     * The time of the commit (seconds since 1970).
     */
    readonly timestamp: number;

}

/**
 * The result of shelling out to Hg.
 */
export interface HgResult {

    /**
     * The standard output from Hg.
     */
    readonly stdout: string;

    /**
     * The standard error output from Hg.
     */
    readonly stderr: string;

    /**
     * The exit code of the Hg process.
     */
    readonly exitCode: number;

}

export interface MergeResult {
    readonly unresolvedCount: number;
}
