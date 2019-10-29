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
import { Hg, Repository, HgUtils, WorkingDirectoryStatus } from '../common';
import { HgStatusChangeEvent } from '../common/hg-watcher';
import { FileSystemWatcherServer, DidFilesChangedParams, FileChangeType } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { FileSystem } from '@theia/filesystem/lib/common';
import { FileUri } from '@theia/core/lib/node/file-uri';
import debounce = require('lodash.debounce');
export const HgRepositoryWatcherFactory = Symbol('HgRepositoryWatcherFactory');
export type HgRepositoryWatcherFactory = (options: HgRepositoryWatcherOptions) => HgRepositoryWatcher;

@injectable()
export class HgRepositoryWatcherOptions {
    readonly repository: Repository;
}

@injectable()
export class HgRepositoryWatcher implements Disposable {

    protected readonly onStatusChangedEmitter = new Emitter<HgStatusChangeEvent>();
    readonly onStatusChanged: Event<HgStatusChangeEvent> = this.onStatusChangedEmitter.event;

    @inject(Hg)
    protected readonly hg: Hg;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(HgRepositoryWatcherOptions)
    protected readonly options: HgRepositoryWatcherOptions;

    @inject(FileSystem)
    protected readonly filesystem: FileSystem;

    @inject(FileSystemWatcherServer)
    protected readonly fileSystemWatcher: FileSystemWatcherServer;

    protected hgIgnoreTester: string[] | undefined;

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

                if (relativePath === '.hgignore') {
                    // The .hgignore file itself is changing so we must re-parse it.
                    this.hgIgnoreTester = undefined;
                    if (change.type !== FileChangeType.DELETED) {
                        this.parseHgIgnoreFile(repositoryUri);
                    }
                }

                if (this.hgIgnoreTester === undefined || !this.hgIgnoreTester.some(simplePattern => this.testAgainstSimplePattern(simplePattern, relativePath))) {
                    this.lazyRefresh();
                }
            }
        }
    }

    protected lazyRefresh: () => Promise<void> = debounce(() => this.syncStatus(false), 500);

    private async parseHgIgnoreFile(repositoryUri: string): Promise<void> {
        const response = await this.filesystem.resolveContent(repositoryUri + '/.hgignore', { encoding: 'utf8' });
        const patterns = response.content.split(/\r\n|\r|\n/);
        this.hgIgnoreTester = this.extractSafeIgnores(patterns);
    }

    /**
     * Returns a list of patterns that are just a single folder or file name at the root.
     *
     * Testing against a .hgignore file is hard.  However we don't have to do a perfect job.
     * If we just ignore files in the build directories then this will substantially improve
     * performance.  It does not matter if we let some files through that should be ignored
     * because the Hg status call will ignore them.  We do have to be sure not to ignore
     * anything that should not be ignored.
     *
     * @param patterns the raw patterns from the .hgignore file
     * @return a list of simple root file names that can safely be ignored
     */
    private extractSafeIgnores(patterns: string[]): string[] {
        // If any lines begin with !, just keep it simple and ignore nothing
        if (patterns.some(pattern => pattern.startsWith('!'))) {
            return [];
        }

        return patterns.filter(pattern => pattern.match(/^[\w-.]+$/));
    }

    private testAgainstSimplePattern(simplePattern: string, relativePath: string): boolean {
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

            const hgIgnoreExists = await this.filesystem.exists(`${repositoryUri}/.hgignore`);
            if (hgIgnoreExists) {
                this.parseHgIgnoreFile(repositoryUri);
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
            // TODO fill this properly
            const newStatus = {
                changes: await this.hg.status(source),
                exists: true
            };
            const oldStatus = this.status;
            if (initial || !WorkingDirectoryStatus.equals(newStatus, oldStatus)) {
                this.status = newStatus;
                this.onStatusChangedEmitter.fire({ source, status: newStatus.changes, oldStatus: oldStatus ? oldStatus.changes : [] });
            }
        } catch (error) {
            if (HgUtils.isRepositoryDoesNotExistError(error)) {
                this.dispose();
            } else {
                const { localUri } = this.options.repository;
                this.logger.error('Error occurred while synchronizing the status of the repository.', localUri, error);
            }
        }
    }

}
