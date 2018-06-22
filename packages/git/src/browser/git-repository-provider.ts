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
import { injectable, inject } from "inversify";
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { Event, Emitter } from '@theia/core';

export interface GitRefreshOptions {
    readonly maxCount: number
}

@injectable()
export class GitRepositoryProvider {

    protected _selectedRepository: Repository | undefined;
    protected _allRepositories: Repository[] = [];
    protected readonly onDidChangeRepositoryEmitter = new Emitter<Repository | undefined>();

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService
    ) {
        this.initialize();
    }

    protected async initialize(): Promise<void> {
        await this.refresh({ maxCount: 1 });
        await this.refresh();
    }

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
        return this._allRepositories;
    }

    async refresh(options?: GitRefreshOptions): Promise<void> {
        const root = await this.workspaceService.root;
        if (!root) {
            return;
        }
        const repositories = await this.git.repositories(root.uri, {
            ...options
        });
        this._allRepositories = repositories;
        const selectedRepository = this._selectedRepository;
        if (!selectedRepository || !this.exists(selectedRepository)) {
            this.selectedRepository = this._allRepositories[0];
        } else {
            this.fireDidChangeRepository();
        }
    }

    protected exists(repository: Repository): boolean {
        return this._allRepositories.some(repository2 => Repository.equal(repository, repository2));
    }

}
