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

import { injectable, inject, postConstruct } from 'inversify';
import { Disposable, Event, Emitter, ILogger } from '@theia/core';
import { Git, Repository, WorkingDirectoryStatus, GitUtils } from '../common';
import { GitStatusChangeEvent } from '../common/git-watcher';
<<<<<<< HEAD
import { Deferred } from '@theia/core/lib/common/promise-util';

=======
import { FileSystemWatcherServer, DidFilesChangedParams, FileChangeType } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { FileSystem } from '@theia/filesystem/lib/common';
import { FileUri } from '@theia/core/lib/node/file-uri';
import debounce = require('lodash.debounce');
>>>>>>> 67045e80709496cf93bc426281c83d1a9ffcda0b
export const GitRepositoryWatcherFactory = Symbol('GitRepositoryWatcherFactory');
export type GitRepositoryWatcherFactory = (options: GitRepositoryWatcherOptions) => GitRepositoryWatcher;

@injectable()
export class GitRepositoryWatcherOptions {
    readonly repository: Repository;
}

@injectable()
export class GitRepositoryWatcher implements Disposable {

    protected readonly onGitStatusChangedEmitter = new Emitter<GitStatusChangeEvent>();
    readonly onGitStatusChanged: Event<GitStatusChangeEvent> = this.onGitStatusChangedEmitter.event;

    @inject(Git)
    protected readonly git: Git;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(GitRepositoryWatcherOptions)
    protected readonly options: GitRepositoryWatcherOptions;

<<<<<<< HEAD
    @postConstruct()
    protected init(): void {
        this.spinTheLoop();
    }

    watch(): void {
        if (this.watching) {
            console.debug('Repository watcher is already active.');
            return;
        }
        this.watching = true;
        this.sync();
    }

    protected syncWorkPromises: Deferred<void>[] = [];
    sync(): Promise<void> {
        if (this.idle) {
            if (this.interruptIdle) {
                this.interruptIdle();
            }
        } else {
            this.skipNextIdle = true;
        }
        const result = new Deferred<void>();
        this.syncWorkPromises.push(result);
        return result.promise;
    }

    protected disposed = false;
    dispose(): void {
        if (!this.disposed) {
            this.disposed = true;
            if (this.idle) {
                if (this.interruptIdle) {
                    this.interruptIdle();
                }
            }
        }
    }

    protected watching = false;
    protected idle = true;
    protected interruptIdle: (() => void) | undefined;
    protected skipNextIdle = false;
    protected async spinTheLoop(): Promise<void> {
        while (!this.disposed) {

            // idle
            if (this.skipNextIdle) {
                this.skipNextIdle = false;
            } else {
                const idleTimeout = this.watching ? 5000 : /* super long */ 1000 * 60 * 60 * 24;
                await new Promise(resolve => {
                    const id = setTimeout(resolve, idleTimeout);
                    this.interruptIdle = () => { clearTimeout(id); resolve(); };
                }).then(() => {
                    this.interruptIdle = undefined;
                });
            }

            // work
            await this.syncStatus();
            this.syncWorkPromises.splice(0, this.syncWorkPromises.length).forEach(d => d.resolve());
=======
    @inject(FileSystem)
    protected readonly filesystem: FileSystem;

    @inject(FileSystemWatcherServer)
    protected readonly fileSystemWatcher: FileSystemWatcherServer;

    protected gitIgnoreTester: string[] | undefined;

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

                if (this.gitIgnoreTester === undefined || !this.gitIgnoreTester.some(simplePattern => this.testAgainstSimplePattern(simplePattern, relativePath))) {
                    this.lazyRefresh();
                }
            }
        }
    }

    protected lazyRefresh: () => Promise<void> = debounce(() => this.syncStatus(false), 500);

    private async parseGitIgnoreFile(repositoryUri: string) {
        const response = await this.filesystem.resolveContent(repositoryUri + '/.gitignore', { encoding: 'utf8' });
        const patterns = response.content.split(/\r\n|\r|\n/);
        this.gitIgnoreTester = this.extractSafeIgnores(patterns);
    }

    /**
     * Returns a list of patterns that are just a single folder or file name at the root.
     *
     * Testing against a .gitignore file is hard.  However we don't have to do a perfect job.
     * If we just ignore files in the build directories then this will substantially improve
     * performance.  It does not matter if we let some files through that should be ignored
     * because the Git status call will ignore them.  We do have to be sure not to ignore
     * anything that should not be ignored.
     *
     * @param patterns the raw patterns from the .gitignore file
     * @return a list of simple root file names that can safely be ignored
     */
    private extractSafeIgnores(patterns: string[]): string[] {
        // If any lines begin with !, just keep it simple and ignore nothing
        if (patterns.some(pattern => pattern.startsWith('!'))) {
            return [];
        }

        return patterns.filter(pattern => pattern.match(/^[\w-.]+$/));
    }

    private testAgainstSimplePattern(simplePattern: string, relativePath: string) {
        return relativePath === simplePattern
            || relativePath.startsWith(simplePattern + '/')
            || relativePath.startsWith(simplePattern + '\\');
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
>>>>>>> 67045e80709496cf93bc426281c83d1a9ffcda0b
        }

        this.syncStatus(true);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected status: WorkingDirectoryStatus | undefined;
<<<<<<< HEAD
    protected async syncStatus(): Promise<void> {
=======
    protected async syncStatus(initial: boolean = false): Promise<void> {
>>>>>>> 67045e80709496cf93bc426281c83d1a9ffcda0b
        try {
            const source = this.options.repository;
            const oldStatus = this.status;
            const newStatus = await this.git.status(source);
            if (!WorkingDirectoryStatus.equals(newStatus, oldStatus)) {
                this.status = newStatus;
                this.onGitStatusChangedEmitter.fire({ source, status: newStatus, oldStatus });
            }
        } catch (error) {
<<<<<<< HEAD
            if (!GitUtils.isRepositoryDoesNotExistError(error)) {
=======
            if (GitUtils.isRepositoryDoesNotExistError(error)) {
                this.dispose();
            } else {
>>>>>>> 67045e80709496cf93bc426281c83d1a9ffcda0b
                const { localUri } = this.options.repository;
                this.logger.error('Error occurred while synchronizing the status of the repository.', localUri, error);
            }
        }
    }

}
