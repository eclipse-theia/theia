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
        const repository = this.getRepository();
        if (repository) {
            const remotes = await this.getRemotes();
            const execute = (item: QuickOpenItem) => this.git.fetch(repository, { remote: item.getLabel() });
            const items = remotes.map(remote => new GitQuickOpenItem(remote, execute));
            this.open(items, 'Pick a remote to fetch from:');
        }
    }

    async push(): Promise<void> {
        const repository = this.getRepository();
        if (repository) {
            const [remotes, currentBranch] = await Promise.all([this.getRemotes(), this.getCurrentBranch()]);
            const execute = (item: QuickOpenItem) => this.git.push(repository, { remote: item.getLabel() });
            const items = remotes.map(remote => new GitQuickOpenItem(remote, execute));
            const branchName = currentBranch ? `'${currentBranch.name}' ` : '';
            this.open(items, `Pick a remote to push the currently active branch ${branchName}to:`);
        }
    }

    async pull(): Promise<void> {
        const repository = this.getRepository();
        if (repository) {
            const remotes = await this.getRemotes();
            const defaultRemote = remotes[0]; // I wish I could use assignment destructuring here. (GH-413)
            const executeRemote = async (remoteItem: GitQuickOpenItem<string>) => {
                // The first remote is the default.
                if (remoteItem.ref === defaultRemote) {
                    this.git.pull(repository, { remote: remoteItem.getLabel() });
                } else {
                    // Otherwise we need to propose the branches from
                    const branches = await this.getBranches();
                    const executeBranch = (branchItem: GitQuickOpenItem<Branch>) => this.git.pull(repository, { remote: remoteItem.ref, branch: branchItem.ref.nameWithoutRemote });
                    const toLabel = (branchItem: GitQuickOpenItem<Branch>) => branchItem.ref.name;
                    const branchItems = branches
                        .filter(branch => branch.type === BranchType.Remote)
                        .filter(branch => (branch.name || '').startsWith(`${remoteItem.ref}/`))
                        .map(branch => new GitQuickOpenItem(branch, executeBranch, toLabel));
                    this.open(branchItems, 'Select the branch to pull the changes from:');
                }
            };
            const remoteItems = remotes.map(remote => new GitQuickOpenItem(remote, executeRemote));
            this.open(remoteItems, 'Pick a remote to pull the branch from:');
        }
    }

    async merge(): Promise<void> {
        const repository = this.getRepository();
        if (repository) {
            const [branches, currentBranch] = await Promise.all([this.getBranches(), this.getCurrentBranch()]);
            const execute = (item: GitQuickOpenItem<Branch>) => this.git.merge(repository, { branch: item.getLabel()! });
            const toLabel = (item: GitQuickOpenItem<Branch>) => item.ref.name;
            const items = branches.map(branch => new GitQuickOpenItem(branch, execute, toLabel));
            const branchName = currentBranch ? `'${currentBranch.name}' ` : '';
            this.open(items, `Pick a branch to merge into the currently active ${branchName}branch:`);
        }
    }

    async checkout(): Promise<void> {
        const repository = this.getRepository();
        if (repository) {
            const [branches, currentBranch] = await Promise.all([this.getBranches(), this.getCurrentBranch()]);
            if (currentBranch) {
                // We do not show the current branch.
                const index = branches.findIndex(branch => branch && branch.name === currentBranch.name);
                branches.splice(index, 1);
            }
            const switchBranch = (item: GitQuickOpenItem<Branch>) => {
                this.git.checkout(repository, { branch: item.ref.nameWithoutRemote });
            };
            const toLabel = (item: GitQuickOpenItem<Branch>) => {
                const branch = item.ref;
                return branch.type === BranchType.Remote ? branch.name : branch.nameWithoutRemote;
            };
            const toDescription = (item: GitQuickOpenItem<Branch>) => {
                const branch = item.ref;
                // We have only the long SHA1, but getting the first seven characters is the same.
                const tip = branch.tip.sha.length > 8 ? ` ${branch.tip.sha.slice(0, 7)}` : '';
                return branch.type === BranchType.Remote ? `Remote branch at${tip}` : `${tip}`;
            };
            const items: QuickOpenItem[] = branches.map(branch => new GitQuickOpenItem(branch, switchBranch, toLabel, toDescription));
            const createBranch = (item: QuickOpenItem) => {
                const execute = item => {
                    // TODO create the branch and close the widget.
                    // Nice to have: update the Please provider a branch name. Press 'Enter' to confirm or 'Escape' to cancel. based on the entered string.
                    // Pipe-dream: validate the new branch name.... existence, contains no spaces etc.
                    console.log(item);
                };
                const model = this.getModel(new CreateNewBranchOpenItem(`Please provider a branch name. Press 'Enter' to confirm or 'Escape' to cancel.`, execute));
                this.quickOpenService.open(model, this.getOptions('The name of the branch:', false));
            };
            items.unshift(...[new CreateNewBranchOpenItem('Create new branch...', createBranch)]);
            this.open(items, 'Select a ref to checkout or create a new local branch:');
        }
    }

    private open(items: QuickOpenItem | QuickOpenItem[], placeholder: string): void {
        this.quickOpenService.open(this.getModel(Array.isArray(items) ? items : [items]), this.getOptions(placeholder));
    }

    private getOptions(placeholder: string, fuzzyMatchLabel: boolean = true): QuickOpenOptions {
        return QuickOpenOptions.resolve({
            placeholder,
            fuzzyMatchLabel,
            fuzzySort: false
        });
    }

    private getModel(items: QuickOpenItem | QuickOpenItem[]): QuickOpenModel {
        return {
            onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
                acceptor(Array.isArray(items) ? items : [items]);
            }
        };
    }

    private getRepository(): Repository | undefined {
        return this.repositoryProvider.selectedRepository;
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

    private async getCurrentBranch(): Promise<Branch | undefined> {
        const repository = this.getRepository();
        if (!repository) {
            return undefined;
        }
        return await this.git.branch(repository, { type: 'current' });
    }

}

/**
 * Git specific quick open item that wraps a branch a remote name or something else.
 */
class GitQuickOpenItem<T> extends QuickOpenItem {

    constructor(
        public readonly ref: T,
        protected readonly execute: (item: GitQuickOpenItem<T>) => void,
        private readonly toLabel: (item: GitQuickOpenItem<T>) => string = (item: QuickOpenItem) => `${ref}`,
        private readonly toDescription: (item: GitQuickOpenItem<T>) => string | undefined = (item: QuickOpenItem) => undefined) {

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

    getDescription(): string | undefined {
        return this.toDescription(this);
    }

}

/**
 * Placeholder item for creating a new local branch.
 */
class CreateNewBranchOpenItem extends QuickOpenItem {

    constructor(
        private readonly label: string,
        private readonly execute: (item: QuickOpenItem) => void) {

        super();
    }

    getLabel(): string {
        return this.label;
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        this.execute(this);
        return false;
    }

}
