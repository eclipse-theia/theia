/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { QuickOpenItem, QuickOpenMode, QuickOpenModel } from '@theia/core/lib/browser/quick-open/quick-open-model';
import { QuickOpenService, QuickOpenOptions } from '@theia/core/lib/browser/quick-open/quick-open-service';
import { Git, Repository, Branch, BranchType, Tag } from '../common';
import { GitRepositoryProvider } from './git-repository-provider';
import { MessageService } from '@theia/core/lib/common/message-service';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node/file-uri';

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
        @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService,
        @inject(MessageService) protected readonly messageService: MessageService
    ) { }

    async fetch(): Promise<void> {
        const repository = this.getRepository();
        if (repository) {
            const remotes = await this.getRemotes();
            const execute = async (item: QuickOpenItem) => {
                try {
                    await this.git.fetch(repository, { remote: item.getLabel() });
                } catch (error) {
                    this.logError(error);
                }
            };
            const items = remotes.map(remote => new GitQuickOpenItem(remote, execute));
            this.open(items, 'Pick a remote to fetch from:');
        }
    }

    async push(): Promise<void> {
        const repository = this.getRepository();
        if (repository) {
            const [remotes, currentBranch] = await Promise.all([this.getRemotes(), this.getCurrentBranch()]);
            const execute = async (item: QuickOpenItem) => {
                try {
                    await this.git.push(repository, { remote: item.getLabel() });
                } catch (error) {
                    this.logError(error);
                }
            };
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
                    try {
                        await this.git.pull(repository, { remote: remoteItem.getLabel() });
                    } catch (error) {
                        this.logError(error);
                    }
                } else {
                    // Otherwise we need to propose the branches from
                    const branches = await this.getBranches();
                    const executeBranch = async (branchItem: GitQuickOpenItem<Branch>) => {
                        try {
                            await this.git.pull(repository, { remote: remoteItem.ref, branch: branchItem.ref.nameWithoutRemote });
                        } catch (error) {
                            this.logError(error);
                        }
                    };
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
            const execute = async (item: GitQuickOpenItem<Branch>) => {
                try {
                    await this.git.merge(repository, { branch: item.getLabel()! });
                } catch (error) {
                    this.logError(error);
                }
            };
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
            const switchBranch = async (item: GitQuickOpenItem<Branch>) => {
                try {
                    await this.git.checkout(repository, { branch: item.ref.nameWithoutRemote });
                } catch (error) {
                    this.logError(error);
                }
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
            const createBranchItem = (item: QuickOpenItem) => {
                const __this = this;
                const createBranchModel: QuickOpenModel = {
                    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
                        const dynamicItems: QuickOpenItem[] = [];
                        const suffix = `Press 'Enter' to confirm or 'Escape' to cancel.`;
                        if (lookFor === undefined || lookFor.length === 0) {
                            dynamicItems.push(new CreateNewBranchOpenItem(`Please provide a branch name. ${suffix}`, () => { }, () => false));
                        } else {
                            dynamicItems.push(new CreateNewBranchOpenItem(
                                `Create a new local branch with name: ${lookFor}. ${suffix}`,
                                async () => {
                                    try {
                                        await __this.git.branch(repository, { toCreate: lookFor });
                                        await __this.git.checkout(repository, { branch: lookFor });
                                    } catch (error) {
                                        __this.logError(error);
                                    }
                                }
                            ));
                        }
                        acceptor(dynamicItems);
                    }
                };
                this.quickOpenService.open(createBranchModel, this.getOptions('The name of the branch:', false));
            };
            items.unshift(new CreateNewBranchOpenItem('Create new branch...', createBranchItem, (mode: QuickOpenMode) => mode === QuickOpenMode.OPEN, () => false));
            this.open(items, 'Select a ref to checkout or create a new local branch:');
        }
    }

    async changeRepository(): Promise<void> {
        const repositories = this.repositoryProvider.allRepositories;
        if (repositories.length > 1) {
            const items = repositories.map(repository => {
                const uri = new URI(repository.localUri);
                const execute = () => this.repositoryProvider.selectedRepository = repository;
                const toLabel = () => uri.path.base;
                const toDescription = () => FileUri.fsPath(uri);
                return new GitQuickOpenItem<Repository>(repository, execute, toLabel, toDescription);
            });
            this.open(items, 'Select a local Git repository to work with:');
        }
    }

    async chooseTagsAndBranches(execFunc: (branchName: string, currentBranchName: string) => void): Promise<void> {
        const repository = this.getRepository();
        if (repository) {
            const [branches, tags, currentBranch] = await Promise.all([this.getBranches(), this.getTags(), this.getCurrentBranch()]);
            const execute = async (item: GitQuickOpenItem<Branch | Tag>) => {
                execFunc(item.ref.name, currentBranch ? currentBranch.name : '');
            };
            const toLabel = (item: GitQuickOpenItem<Branch | Tag>) => item.ref.name;
            const branchItems = branches.map(branch => new GitQuickOpenItem(branch, execute, toLabel));
            const branchName = currentBranch ? `'${currentBranch.name}' ` : '';
            const tagItems = tags.map(tag => new GitQuickOpenItem(tag, execute, toLabel));

            this.open([...branchItems, ...tagItems], `Pick a branch or tag to compare with the currently active ${branchName} branch:`);
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
        try {
            return repository ? await this.git.remote(repository) : [];
        } catch (error) {
            this.logError(error);
            return [];
        }
    }

    private async getTags(): Promise<Tag[]> {
        const repository = this.getRepository();
        if (repository) {
            const result = await this.git.exec(repository, ['tag', '--sort=version:refname']);
            return result.stdout.trim().split('\n').map(tag => ({ name: tag }));
        }
        return [];
    }

    private async getBranches(): Promise<Branch[]> {
        const repository = this.getRepository();
        if (!repository) {
            return [];
        }
        try {
            const [local, remote] = await Promise.all([
                this.git.branch(repository, { type: 'local' }),
                this.git.branch(repository, { type: 'remote' })
            ]);
            return [...local, ...remote];
        } catch (error) {
            this.logError(error);
            return [];
        }
    }

    private async getCurrentBranch(): Promise<Branch | undefined> {
        const repository = this.getRepository();
        if (!repository) {
            return undefined;
        }
        try {
            return await this.git.branch(repository, { type: 'current' });
        } catch (error) {
            this.logError(error);
            return undefined;
        }
    }

    // tslint:disable-next-line:no-any
    private logError(error: any): void {
        const message = error instanceof Error ? error.message : error;
        this.messageService.error(message);
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
        private readonly execute: (item: QuickOpenItem) => void = () => { },
        private readonly canRun: (mode: QuickOpenMode) => boolean = mode => mode === QuickOpenMode.OPEN,
        private readonly canClose: (mode: QuickOpenMode) => boolean = mode => true) {

        super();
    }

    getLabel(): string {
        return this.label;
    }

    run(mode: QuickOpenMode): boolean {
        if (!this.canRun(mode)) {
            return false;
        }
        this.execute(this);
        return this.canClose(mode);
    }

}
