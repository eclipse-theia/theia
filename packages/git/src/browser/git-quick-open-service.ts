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
import { Repository, Branch, BranchType } from '../common/model';
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
        if (repository) {
            const execute = (item: QuickOpenItem) => this.git.fetch(repository, { remote: item.getLabel() });
            const items = remotes.map(remote => new GitQuickOpenItem(remote, execute));
            this.quickOpenService.open(this.getModel(items), this.getOptions('Pick a remote to fetch from:'));
        }
    }

    async push(): Promise<void> {
        const [repository, remotes] = await Promise.all([this.getRepository(), this.getRemotes()]);
        if (repository) {
            const execute = (item: QuickOpenItem) => this.git.push(repository, { remote: item.getLabel() });
            const items = remotes.map(remote => new GitQuickOpenItem(remote, execute));
            const TODO_currentBranchName = ''; // Otherwise should be the branch name.
            this.quickOpenService.open(this.getModel(items), this.getOptions(`Pick a remote to push the branch${TODO_currentBranchName} to:`));
        }
    }

    async pull(): Promise<void> {
        const [repository, remotes] = await Promise.all([this.getRepository(), this.getRemotes()]);
        if (repository) {
            const defaultRemote = remotes[0]; // I wish I could use assignment destructuring here. (GH-413)
            const executeRemote = async (remoteItem: GitQuickOpenItem<string>) => {
                // The first remote is the default.
                if (remoteItem.ref === defaultRemote) {
                    this.git.pull(repository, { remote: remoteItem.getLabel() });
                } else {
                    // Otherwise we need to propose the branches from
                    const branches = await this.getBranches();
                    const executeBranch = (item: GitQuickOpenItem<Branch>) => this.git.pull(repository, { remote: remoteItem.getLabel() });
                    const toLabel = (branchItem: GitQuickOpenItem<Branch>) => branchItem.ref.name;
                    const branchItems = branches
                        .filter(branch => branch.type === BranchType.Remote)
                        .filter(branch => (branch.name || '').startsWith(`${remoteItem.ref}/`))
                        .map(branch => new GitQuickOpenItem<Branch>(branch, executeBranch, toLabel));
                    this.quickOpenService.open(this.getModel(branchItems), this.getOptions('Select the branch to pull the changes from:'));
                }
            };
            const remoteItems = remotes.map(remote => new GitQuickOpenItem(remote, executeRemote));
            this.quickOpenService.open(this.getModel(remoteItems), this.getOptions('Pick a remote to pull the branch from:'));
        }
    }

    async merge(): Promise<void> {
        const [repository, branches] = await Promise.all([this.getRepository(), this.getBranches()]);
        if (repository) {
            const execute = (item: GitQuickOpenItem<Branch>) => this.git.merge(repository, { branch: item.getLabel()! });
            const toLabel = (item: GitQuickOpenItem<Branch>) => item.ref.name;
            const items = branches.map(branch => new GitQuickOpenItem<Branch>(branch, execute, toLabel));
            const TODO_currentBranchName = ''; // Otherwise should be the branch name.
            this.quickOpenService.open(this.getModel(items), this.getOptions(`Pick a branch to merge into the currently active ${TODO_currentBranchName} branch:`));
        }
    }

    private getOptions(placeholder: string): QuickOpenOptions {
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

    private getRepository(): Repository | undefined {
        const selectedRepository = this.repositoryProvider.selectedRepository;
        if (selectedRepository) {
            return selectedRepository;
        }

    }

    private async getRemotes(): Promise<string[]> {
        const repository = this.getRepository();
        return repository ? this.git.remote(repository) : [];
    }

    private async getBranches(): Promise<Branch[]> {
        const repository = this.getRepository();
        if (!repository) {
            return [];
        }
        const [local, remote] = await Promise.all([
            this.git.branch(repository, { type: 'local' }),
            this.git.branch(repository, { type: 'remote' })
        ]);
        return [...local, ...remote];
    }

}


class GitQuickOpenItem<T> extends QuickOpenItem {

    constructor(
        public readonly ref: T,
        private execute: (item: GitQuickOpenItem<T>) => void,
        private toLabel: (item: GitQuickOpenItem<T>) => string = (item: QuickOpenItem) => `${ref}`) {
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
        return this.toLabel(this);
    }

}
