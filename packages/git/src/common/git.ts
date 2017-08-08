/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { WorkingDirectoryStatus } from './model';

export interface Git {

    /**
     * Returns with the working directory status of the given Git repository.
     */
    status(repository: Repository): Promise<WorkingDirectoryStatus>;

}

/**
 * Bare minimum representation of a local Git clone.
 */
export interface Repository {

    /**
     * The remote URL of the local clone.
     */
    readonly remoteUrl?: string;

    /**
     * The FS URI of the local clone.
     */
    readonly localUri: string;

}

export namespace Repository {

    /**
     * `true` if the argument is a type of a [Repository](#Repository), otherwise `false`.
     */
    export function is(repository: any | undefined): repository is Repository {
        return repository && typeof (<Repository>repository).localUri === 'string';
    }

}
