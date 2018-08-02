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

import { injectable, inject } from 'inversify';
import { Disposable, Event, Emitter, ILogger, DisposableCollection } from '@theia/core';
import { Git, Repository, WorkingDirectoryStatus, GitUtils } from '../common';
import { GitStatusChangeEvent } from '../common/git-watcher';

export const GitRepositoryWatcherFactory = Symbol('GitRepositoryWatcherFactory');
export type GitRepositoryWatcherFactory = (options: GitRepositoryWatcherOptions) => GitRepositoryWatcher;

@injectable()
export class GitRepositoryWatcherOptions {
    readonly repository: Repository;
}

@injectable()
export class GitRepositoryWatcher implements Disposable {

    protected readonly onStatusChangedEmitter = new Emitter<GitStatusChangeEvent>();
    readonly onStatusChanged: Event<GitStatusChangeEvent> = this.onStatusChangedEmitter.event;

    @inject(Git)
    protected readonly git: Git;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(GitRepositoryWatcherOptions)
    protected readonly options: GitRepositoryWatcherOptions;

    protected readonly toDispose = new DisposableCollection();
    watch(): void {
        if (this.toDispose.disposed) {
            this.logger.info('Started watching the git repository:', this.options.repository.localUri);
            this.toDispose.push(Disposable.create(() => {
                this.logger.info('Stopped watching the git repository:', this.options.repository.localUri);
                this.clear();
            }));
        }
        this.schedule(true);
    }

    sync(): void {
        this.clear();
        this.schedule(false, 0);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected initial: boolean = true;
    protected watchTimer: NodeJS.Timer | undefined;
    protected schedule(initial: boolean = false, delay = initial ? 0 : 5000): void {
        if (initial && !this.initial) {
            this.initial = true;
            this.clear();
        }
        if (this.watchTimer) {
            return;
        }
        this.watchTimer = setTimeout(async () => {
            this.watchTimer = undefined;
            const syncInitial = this.initial;
            this.initial = false;
            if (await this.syncStatus(syncInitial)) {
                this.schedule();
            }
        }, delay);
    }
    protected clear(): void {
        if (this.watchTimer) {
            clearTimeout(this.watchTimer);
            this.watchTimer = undefined;
        }
    }

    protected status: WorkingDirectoryStatus | undefined;
    protected async syncStatus(initial: boolean = false): Promise<boolean> {
        try {
            const source = this.options.repository;
            const newStatus = await this.git.status(source);
            const oldStatus = this.status;
            if (initial || !WorkingDirectoryStatus.equals(newStatus, oldStatus)) {
                this.status = newStatus;
                this.onStatusChangedEmitter.fire({ source, status: newStatus, oldStatus });
            }
        } catch (error) {
            if (GitUtils.isRepositoryDoesNotExistError(error)) {
                return false;
            }
            const { localUri } = this.options.repository;
            this.logger.error('Error occurred while synchronizing the status of the repository.', localUri, error);
        }
        return true;
    }

}
