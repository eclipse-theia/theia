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
import * as ignore from 'ignore';
import { Disposable, Event, Emitter, ILogger, DisposableCollection } from '@theia/core';
import { Git, Repository, WorkingDirectoryStatus, GitUtils } from '../common';
import { GitStatusChangeEvent } from '../common/git-watcher';
import { FileSystemWatcherServer, DidFilesChangedParams, FileChangeType } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { FileSystem } from '@theia/filesystem/lib/common';
import { FileUri } from '@theia/core/lib/node/file-uri';
import debounce = require('lodash.debounce');
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

    @inject(FileSystem)
    protected readonly filesystem: FileSystem;

    @inject(FileSystemWatcherServer)
    protected readonly fileSystemWatcher: FileSystemWatcherServer;

    // tslint:disable-next-line:no-any
    protected gitIgnoreTester: any | undefined;

    sync(): void {
        this.syncStatus(false);
    }

    protected onDidFilesChanged(changes: DidFilesChangedParams): void {
        for (const change of changes.changes) {
            const uri = change.uri.toString();
            const repositoryUri = this.options.repository.localUri;
            if (uri.startsWith(repositoryUri + '/')) {
                const repoPath = FileUri.fsPath(repositoryUri);
                const filePath = FileUri.fsPath(uri);
                const relativePath = filePath.substring(repoPath.length + 1);

                if (relativePath === '.gitignore') {
                    // The .gitignore file itself is changing so we must re-parse it.
                    this.gitIgnoreTester = undefined;
                    if (change.type !== FileChangeType.DELETED) {
                        this.parseGitIgnoreFile(repositoryUri);
                    }
                }

                if (this.gitIgnoreTester === undefined || !this.gitIgnoreTester.ignores(relativePath)) {
                    this.lazyRefresh();
                }
            }
        }
    }

    protected lazyRefresh: () => Promise<void> = debounce(() => this.syncStatus(false), 500);

    private async parseGitIgnoreFile(repositoryUri: string) {
        const response = await this.filesystem.resolveContent(repositoryUri + '/.gitignore', { encoding: 'utf8' });
        const patterns = response.content.split(/\r\n|\r|\n/);
        this.gitIgnoreTester = ignore.default().add(patterns);
    }

    protected readonly toDispose = new DisposableCollection();
    async watch(): Promise<void> {
        const notCurrentlyWatching = this.toDispose.disposed;
        if (notCurrentlyWatching) {
            const repositoryUri = this.options.repository.localUri;

            this.fileSystemWatcher.watchFileChanges(repositoryUri).then(watcher =>
                this.toDispose.push(Disposable.create(() =>
                    this.fileSystemWatcher.unwatchFileChanges(watcher)
                ))
            );

            const gitIgnoreExists = await this.filesystem.exists(`${repositoryUri}/.gitignore`);
            if (gitIgnoreExists) {
                this.parseGitIgnoreFile(repositoryUri);
            }

            this.toDispose.push(this.fileSystemWatcher);
            this.fileSystemWatcher.setClient({
                onDidFilesChanged: changes => this.onDidFilesChanged(changes)
            });
        }

        this.syncStatus(true);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected status: WorkingDirectoryStatus | undefined;
    protected async syncStatus(initial: boolean = false): Promise<void> {
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
                this.dispose();
            } else {
                const { localUri } = this.options.repository;
                this.logger.error('Error occurred while synchronizing the status of the repository.', localUri, error);
            }
        }
    }

}
