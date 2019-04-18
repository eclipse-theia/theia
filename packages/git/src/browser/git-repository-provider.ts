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

import { Git, Repository } from '../common';
import { injectable, inject } from 'inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';
import { DisposableCollection, Event, Emitter } from '@theia/core';
import { StorageService } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { FileSystemWatcher } from '@theia/filesystem/lib/browser/filesystem-watcher';

import debounce = require('lodash.debounce');

export interface GitRefreshOptions {
    readonly maxCount: number
}

@injectable()
export class GitRepositoryProvider {

    protected _selectedRepository: Repository | undefined;
    protected _allRepositories?: Repository[];
    protected readonly onDidChangeRepositoryEmitter = new Emitter<Repository | undefined>();
    protected readonly selectedRepoStorageKey = 'theia-git-selected-repository';
    protected readonly allRepoStorageKey = 'theia-git-all-repositories';

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(FileSystemWatcher) protected readonly watcher: FileSystemWatcher,
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(StorageService) protected readonly storageService: StorageService
    ) {
        this.initialize();
    }

    protected readonly toDisposeOnWorkspaceChange = new DisposableCollection();
    protected async initialize(): Promise<void> {
        /*
         * Listen for changes to the list of workspaces.  This will not be fired when changes
         * are made inside a workspace.
         */
        this.workspaceService.onWorkspaceChanged(async roots => {
            this.refresh();

            this.toDisposeOnWorkspaceChange.dispose();
            for (const root of roots) {
                const uri = new URI(root.uri);
                this.toDisposeOnWorkspaceChange.push(await this.watcher.watchFileChanges(uri));
            }
        });
        /*
         * Listen for changes within the workspaces.
         */
        this.watcher.onFilesChanged(_changedFiles => {
            this.lazyRefresh();
        });

        this._selectedRepository = await this.storageService.getData<Repository | undefined>(this.selectedRepoStorageKey);
        this._allRepositories = await this.storageService.getData<Repository[]>(this.allRepoStorageKey);
        if (!this._allRepositories) {
            await this.refresh({ maxCount: 1 });
        }
        await this.refresh();
    }

    protected lazyRefresh: () => Promise<void> = debounce(() => this.refresh(), 1000);

    /**
     * Returns with the previously selected repository, or if no repository has been selected yet,
     * it picks the first available repository from the backend and sets it as the selected one and returns with that.
     * If no repositories are available, returns `undefined`.
     */
    get selectedRepository(): Repository | undefined {
        return this._selectedRepository;
    }

    /**
     * Sets or un-sets the repository.
     */
    set selectedRepository(repository: Repository | undefined) {
        this._selectedRepository = repository;
        this.storageService.setData<Repository | undefined>(this.selectedRepoStorageKey, repository);
        this.fireDidChangeRepository();
    }

    get onDidChangeRepository(): Event<Repository | undefined> {
        return this.onDidChangeRepositoryEmitter.event;
    }
    protected fireDidChangeRepository(): void {
        this.onDidChangeRepositoryEmitter.fire(this._selectedRepository);
    }

    /**
     * Returns with all know repositories.
     */
    get allRepositories(): Repository[] {
        return this._allRepositories || [];
    }

    findRepository(uri: URI): Repository | undefined {
        const reposSorted = this._allRepositories ? this._allRepositories.sort(Repository.sortComparator) : [];
        return reposSorted.find(repo => new URI(repo.localUri).isEqualOrParent(uri));
    }

    findRepositoryOrSelected(arg: URI | string | { uri?: string | URI } | undefined): Repository | undefined {
        let uri: URI | string | undefined;
        if (arg) {
            if (arg instanceof URI || typeof arg === 'string') {
                uri = arg;
            } else if (typeof arg === 'object' && 'uri' in arg && arg.uri) {
                uri = arg.uri;
            }
            if (uri) {
                if (typeof uri === 'string') {
                    uri = new URI(uri);
                }
                return this.findRepository(uri);
            }
        }
        return this.selectedRepository;
    }

    async refresh(options?: GitRefreshOptions): Promise<void> {
        const roots: FileStat[] = [];
        await this.workspaceService.roots;
        for (const root of this.workspaceService.tryGetRoots()) {
            if (await this.fileSystem.exists(root.uri)) {
                roots.push(root);
            }
        }
        const repoUris = new Map<string, Repository>();
        const reposOfRoots = await Promise.all(
            roots.map(r => this.git.repositories(r.uri, { ...options }))
        );
        reposOfRoots.forEach(reposPerRoot => {
            reposPerRoot.forEach(repoOfOneRoot => {
                repoUris.set(repoOfOneRoot.localUri, repoOfOneRoot);
            });
        });
        this._allRepositories = Array.from(repoUris.values());
        this.storageService.setData<Repository[]>(this.allRepoStorageKey, this._allRepositories);
        const selectedRepository = this._selectedRepository;
        if (!selectedRepository || !this.exists(selectedRepository)) {
            this.selectedRepository = this._allRepositories[0];
        } else {
            this.fireDidChangeRepository();
        }
    }

    protected exists(repository: Repository): boolean {
        return !!this._allRepositories && this._allRepositories.some(repository2 => Repository.equal(repository, repository2));
    }

}
