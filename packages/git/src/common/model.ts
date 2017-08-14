/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from '@theia/core/lib/common/uri';

export interface WorkingDirectoryStatus {

    /**
     * `true` if the repository exists, otherwise `false`.
     */
    readonly exists: boolean;

    /**
     * An array of changed files.
     */
    readonly changes: FileChange[];

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
                && left.changes.sort(FileChange.compare).join(' ') === right.changes.sort(FileChange.compare).join(' ');
        } else {
            return left === right;
        }
    }

    /**
     * `true` if the status has no file changes and neither behind nor ahead from the remote branch.
     */
    export function isEmpty(status: WorkingDirectoryStatus): boolean {
        return status.changes.length === 0 && (!status.aheadBehind || (status.aheadBehind.ahead === 0 && status.aheadBehind.behind === 0));
    }

}

/**
 * Enumeration of states that a file resource can have in the working directory.
 */
export enum FileStatus {
    'New',
    'Modified',
    'Deleted',
    'Renamed',
    'Conflicted',
    'Copied'
}

/**
 * Representation of an individual file change in the working directory.
 */
export interface FileChange {

    /**
     * The current URI of the changed file resource.
     */
    readonly uri: URI;

    /**
     * The previous URI of the changed URI. Can be absent if the file is new, or just changed and so on.
     */
    readonly oldUri?: URI;

    /**
     * The file status.
     */
    readonly status: FileStatus;
}

export namespace FileChange {

    /**
     * `true` if the file status and the URIs are the same, otherwise `false`.
     */
    export function equals(left: FileChange, right: FileChange): boolean {
        return left.status === right.status
            && left.uri.toString() === right.uri.toString()
            && (left.oldUri ? left.oldUri.toString() : '') === (right.oldUri ? right.oldUri.toString() : '');
    }

    export function compare(left: FileChange, right: FileChange): number {
        const concat = (fc: FileChange) => `${fc.status}${fc.uri.toString()}${fc.oldUri ? fc.oldUri.toString() : ''}`;
        return concat(left).localeCompare(concat(right));
    }

}

/**
 * Bare minimum representation of a local Git clone.
 */
export interface Repository {

    /**
     * The FS URI of the local clone.
     */
    readonly localUri: string;

    /**
     * The remote URL of the local clone.
     */
    readonly remoteUrl?: string;

}

export namespace Repository {

    /**
     * `true` if the argument is a type of a [Repository](#Repository), otherwise `false`.
     */
    export function is(repository: any | undefined): repository is Repository {
        return repository && typeof (<Repository>repository).localUri === 'string';
    }

    /**
     * `true` if the arguments are equal. More precisely; when both the local and the remote repository URLs
     * are equal.
     *
     * @param left the repository to compare with the other.
     * @param right the other repository.
     */
    export function equals(left: Repository, right: Repository): boolean {
        return left.localUri === right.localUri && left.remoteUrl === right.remoteUrl;
    }

}
