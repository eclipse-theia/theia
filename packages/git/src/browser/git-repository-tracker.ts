/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject, postConstruct } from 'inversify';
import { Git, Repository, WorkingDirectoryStatus } from '../common';
import { Event, Emitter, DisposableCollection } from '@theia/core';
import { GitRepositoryProvider } from './git-repository-provider';
import { GitWatcher, GitStatusChangeEvent } from '../common/git-watcher';
import URI from '@theia/core/lib/common/uri';

/**
 * The repository tracker watches the selected repository for status changes. It provides a convenient way to listen on status updates.
 */
@injectable()
export class GitRepositoryTracker {

    protected toDispose = new DisposableCollection();
    protected workingDirectoryStatus: WorkingDirectoryStatus | undefined;
    protected readonly onGitEventEmitter = new Emitter<GitStatusChangeEvent>();

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider,
        @inject(GitWatcher) protected readonly gitWatcher: GitWatcher,
    ) { }

    @postConstruct()
    protected async init() {
        this.repositoryProvider.onDidChangeRepository(async repository => {
            this.workingDirectoryStatus = undefined;
            this.toDispose.dispose();
            if (repository) {
                this.toDispose.push(await this.gitWatcher.watchGitChanges(repository));
                this.toDispose.push(this.gitWatcher.onGitEvent((event: GitStatusChangeEvent) => {
                    this.workingDirectoryStatus = event.status;
                    this.onGitEventEmitter.fire(event);
                }));
                this.workingDirectoryStatus = await this.git.status(repository);
            }
        });
        if (this.repositoryProvider.allRepositories.length === 0) {
            await this.repositoryProvider.refresh();
        }
        if (this.selectedRepository) {
            this.workingDirectoryStatus = await this.git.status(this.selectedRepository);
        }
    }

    /**
     * Returns the selected repository, or `undefined` if no repositories are available.
     */
    get selectedRepository(): Repository | undefined {
        return this.repositoryProvider.selectedRepository;
    }

    /**
     * Returns all known repositories.
     */
    get allRepositories(): Repository[] {
        return this.repositoryProvider.allRepositories;
    }

    /**
     * Returns the last known status of the selected respository, or `undefined` if no repositories are available.
     */
    get selectedRepositoryStatus(): WorkingDirectoryStatus | undefined {
        return this.workingDirectoryStatus;
    }

    /**
     * Emits when the selected repository has changed.
     */
    get onDidChangeRepository(): Event<Repository | undefined> {
        return this.repositoryProvider.onDidChangeRepository;
    }

    /**
     * Emits when status has changed in the selected repository.
     */
    get onGitEvent(): Event<GitStatusChangeEvent> {
        return this.onGitEventEmitter.event;
    }

    getPath(uri: URI): string | undefined {
        const { repositoryUri } = this;
        const relativePath = repositoryUri && repositoryUri.relative(uri);
        return relativePath && relativePath.toString();
    }

    getUri(path: string): URI | undefined {
        const { repositoryUri } = this;
        return repositoryUri && repositoryUri.resolve(path);
    }

    get repositoryUri(): URI | undefined {
        const repository = this.selectedRepository;
        return repository && new URI(repository.localUri);
    }

}
