/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/
import { Git, Repository } from '../common';
import { injectable, inject } from "inversify";

@injectable()
export class GitRepositoryProvider {

    protected selectedRepository: Repository;

    constructor(
        @inject(Git) protected readonly git: Git
    ) {

    }

    async getSelected(): Promise<Repository> {
        if (this.selectedRepository) {
            return this.selectedRepository;
        } else {
            return this.git.repositories().then(r => r[0]);
        }
    }

    select(localUri: string): void {
        this.git.repositories().then(repos => {
            for (const repo of repos) {
                if (repo.localUri === localUri) {
                    this.selectedRepository = repo;
                    return;
                }
            }
        });
    }
}
