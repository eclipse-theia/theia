/*
* Copyright (C) 2017 TypeFox and others.
*
* Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
* You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import { injectable, inject } from "inversify";
import { QuickOpenItem, QuickOpenMode, QuickOpenModel } from '@theia/core/lib/browser/quick-open/quick-open-model';
import { QuickOpenService, QuickOpenOptions } from '@theia/core/lib/browser/quick-open/quick-open-service';
import { Git } from '../common';
import { Repository } from '../common/model';
import { GitRepositoryProvider } from './git-repository-provider';

/**
 * Service delegating into the `Quick Open Service`, so that the Git commands can be further refined.
 * For instance, the `remote` can be specified for `pull`, `push`, and `fetch`. And the branch can be
 * specified for `git merge`.
 */
@injectable()
export class GitQuickOpenService {

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider,
        @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService
    ) { }

    async fetch(): Promise<void> {
        const [repository, remotes] = await Promise.all([this.getRepository(), this.getRemotes()]);
        const execute = (item: QuickOpenItem) => this.git.fetch(repository, { remote: item.getLabel() });
        const items = remotes.map(remote => new GitQuickOpenItem(remote, execute));
        this.quickOpenService.open(this.getModel(items), this.getOptions('Select a remote to fetch from.'));
    }

    async push(): Promise<void> {
        const [repository, remotes] = await Promise.all([this.getRepository(), this.getRemotes()]);
        const execute = (item: QuickOpenItem) => this.git.push(repository, { remote: item.getLabel() });
        const items = remotes.map(remote => new GitQuickOpenItem(remote, execute));
        this.quickOpenService.open(this.getModel(items), this.getOptions('Select a remote to push to.'));
    }


    async pull(): Promise<void> {
        const [repository, remotes] = await Promise.all([this.getRepository(), this.getRemotes()]);
        const execute = (item: QuickOpenItem) => this.git.pull(repository, { remote: item.getLabel() });
        const items = remotes.map(remote => new GitQuickOpenItem(remote, execute));
        this.quickOpenService.open(this.getModel(items), this.getOptions('Select a remote to pull from.'));
    }

    async merge(): Promise<void> {
        const [repository, branches] = await Promise.all([this.getRepository(), this.getBranches()]);
        const execute = (item: QuickOpenItem) => this.git.merge(repository, { branch: item.getLabel()! });
        const items = branches.map(remote => new GitQuickOpenItem(remote, execute));
        this.quickOpenService.open(this.getModel(items), this.getOptions('Select a branch to merge into the currently active one.'));
    }

    private getOptions(placeholder: string): QuickOpenOptions.Resolved {
        return QuickOpenOptions.resolve({
            placeholder,
            fuzzyMatchLabel: true,
            fuzzySort: false
        });
    }

    private getModel(items: QuickOpenItem[]): QuickOpenModel {
        return {
            getItems(): QuickOpenItem[] {
                return items;
            }
        };
    }

    private async getRepository(): Promise<Repository> {
        return this.repositoryProvider.getSelected();
    }

    private async getRemotes(): Promise<string[]> {
        const repository = await this.getRepository();
        return this.git.remote(repository);
    }

    private async getBranches(): Promise<string[]> {
        const repository = await this.getRepository();
        const [local, remote] = await Promise.all([
            this.git.branch(repository, { type: 'local' }),
            this.git.branch(repository, { type: 'remote' })
        ]);
        return [...local, ...remote];
    }

}


class GitQuickOpenItem extends QuickOpenItem {

    constructor(private label: string, private execute: (item: QuickOpenItem) => void) {
        super();
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        this.execute(this);
        return true;
    }

    getLabel(): string {
        return this.label;
    }

}
