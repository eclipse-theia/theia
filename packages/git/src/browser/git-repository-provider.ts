/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/
import { Git, Repository } from '../common';
import { injectable, inject } from "inversify";
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

@injectable()
export class GitRepositoryProvider {

    protected _selectedRepository: Repository | undefined;
    protected _allRepositories: Repository[];

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService
    ) {
        this._allRepositories = [];
        this.refresh();
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
    }

    /**
     * Returns with all know repositories.
     */
    get allRepositories(): Repository[] {
        return this._allRepositories;
    }

    /**
     * Refreshes the state of this Git repository provider.
     *  - Retrieves all known repositories from the backend, discards the current state of [all known repositories](GitRepositoryProvider.allRepositories).
     *  - If no repository was [selected](GitRepositoryProvider.selectedRepository), then selects the first items from all known ones.
     *  - If no repositories are available, leaves the selected one as `undefined`.
     *  - If the previously selected one, does not exist among the most recently discovered one, selects the first one.
     *  - This method blocks, if the workspace root is not yet set.
     */
    async refresh(): Promise<void> {
        const root = await this.workspaceService.root;
        const repositories = await this.git.repositories(root.uri);
        this._allRepositories = repositories;
        // If no repository is selected or the selected one does not exist on the backend anymore, update the selected one.
        if (this._selectedRepository === undefined
            || this._selectedRepository && !repositories.map(r => r.localUri.toString()).some(uri => uri === this._selectedRepository!.localUri.toString())
        ) {
            this._selectedRepository = this._allRepositories[0];
        }
    }

}
