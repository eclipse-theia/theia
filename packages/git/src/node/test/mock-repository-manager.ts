/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { GitRepositoryManager } from '../git-repository-manager';
import { GitRepositoryWatcher } from '../git-repository-watcher';
import { MockRepositoryWatcher } from './mock-repository-watcher';
import { Repository } from '../../common/git-model';

@injectable()
export class MockRepositoryManager implements GitRepositoryManager {

    private watchers = new Map<Repository, GitRepositoryWatcher>();

    async run<T>(repository: Repository, op: () => Promise<T>): Promise<T> {
        return await op();
    }

    getWatcher(repository: Repository): GitRepositoryWatcher {
        let watcher = this.watchers.get(repository);
        if (watcher === undefined) {
            watcher = new MockRepositoryWatcher();
            this.watchers.set(repository, watcher);
        }
        return watcher;
    }

}
