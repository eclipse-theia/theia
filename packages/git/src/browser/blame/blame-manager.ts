/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { Git, GitFileBlame } from '../../common';
import { GitRepositoryTracker } from '../git-repository-tracker';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class BlameManager {

    @inject(Git)
    protected readonly git: Git;

    @inject(GitRepositoryTracker)
    protected readonly repositoryTracker: GitRepositoryTracker;

    isBlameable(uri: string): boolean {
        return !!this.repositoryTracker.getPath(new URI(uri));
    }

    async getBlame(uri: string, content?: string): Promise<GitFileBlame | undefined> {
        const repository = this.repositoryTracker.selectedRepository;
        if (!repository) {
            return undefined;
        }
        return this.git.blame(repository, uri, { content });
    }

}
