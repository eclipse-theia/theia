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

import { injectable, inject } from '@theia/core/shared/inversify';
import { ReferenceCollection, Reference } from '@theia/core';
import { Repository } from '../common';
import { GitRepositoryWatcher, GitRepositoryWatcherFactory } from './git-repository-watcher';

@injectable()
export class GitRepositoryManager {

    @inject(GitRepositoryWatcherFactory)
    protected readonly watcherFactory: GitRepositoryWatcherFactory;
    protected readonly watchers = new ReferenceCollection<Repository, GitRepositoryWatcher>(
        repository => this.watcherFactory({ repository })
    );

    run<T>(repository: Repository, op: () => Promise<T>): Promise<T> {
        const result = op();
        result.then(() => this.sync(repository));
        return result;
    }

    getWatcher(repository: Repository): Promise<Reference<GitRepositoryWatcher>> {
        return this.watchers.acquire(repository);
    }

    protected async sync(repository: Repository): Promise<void> {
        const reference = await this.getWatcher(repository);
        const watcher = reference.object;
        // dispose the reference once the next sync cycle is actually completed
        watcher.sync().then(() => reference.dispose());
    }

}
