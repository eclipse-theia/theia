/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { ReferenceCollection, Reference } from "@theia/core";
import { Repository } from '../common';
import { GitRepositoryWatcher, GitRepositoryWatcherFactory } from "./git-repository-watcher";

@injectable()
export class GitRepositoryManager {

    @inject(GitRepositoryWatcherFactory)
    protected readonly watcherFactory: GitRepositoryWatcherFactory;
    protected readonly watchers = new ReferenceCollection<Repository, GitRepositoryWatcher>(
        repository => this.watcherFactory({ repository })
    );

    run<T>(repository: Repository, op: () => Promise<T>): Promise<T> {
        const result = op();
        this.ensureSync(repository, result);
        return result;
    }

    getWatcher(repository: Repository): Promise<Reference<GitRepositoryWatcher>> {
        return this.watchers.acquire(repository);
    }

    protected async ensureSync<T>(repository: Repository, result: Promise<T>): Promise<T> {
        result.then(() => this.sync(repository));
        return result;
    }

    async sync(repository: Repository): Promise<void> {
        const reference = await this.getWatcher(repository);
        const watcher = reference.object;
        reference.dispose();
        watcher.sync();
    }

}
