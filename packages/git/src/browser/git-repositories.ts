/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/
import { Git, Repository } from '../common';
import { injectable, inject } from "inversify";

export interface GitUiRepository {
    repository: Repository;
    selected: boolean;
}

@injectable()
export class GitUiRepositories {

    protected gitUiRepos: GitUiRepository[] = [];

    constructor(
        @inject(Git) protected readonly git: Git
    ) {

    }

    async all(): Promise<GitUiRepository[]> {
        const repos = await this.git.repositories();
        const uiRepos: GitUiRepository[] = [];

        repos.forEach(repo => {
            const uiRepo = this.gitUiRepos.find(r => r.repository.localUri === repo.localUri);
            if (uiRepo) {
                uiRepos.push(uiRepo);
            } else {
                uiRepos.push({
                    repository: repo,
                    selected: false
                });
            }
        });
        this.gitUiRepos = uiRepos;
        return Promise.resolve(this.gitUiRepos);
    }

    get selected(): GitUiRepository {
        const repo = this.gitUiRepos.find(r => r.selected);
        if (repo) {
            return repo;
        } else {
            this.gitUiRepos[0].selected = true;
            return this.gitUiRepos[0];
        }
    }

    select(localUri: string): void {
        this.gitUiRepos.forEach(repo => {
            if (repo.repository.localUri === localUri) {
                repo.selected = true;
            } else {
                repo.selected = false;
            }
        })
    }


}