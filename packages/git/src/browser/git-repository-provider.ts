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

    protected selectedRepository: Repository | undefined;

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService
    ) { }

    async getSelected(): Promise<Repository> {
        if (this.selectedRepository) {
            return this.selectedRepository;
        } else {
            const root = await this.workspaceService.root;
            return this.git.repositories(root.uri).then(r => this.selectedRepository = r[0]);
        }
    }

    select(localUri: string | undefined) {
        this.selectedRepository = localUri ? { localUri } : undefined;
    }
}
