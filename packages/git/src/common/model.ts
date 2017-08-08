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
export class FileChange {

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
