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

import { injectable, inject } from 'inversify';
import { QuickOpenItem, QuickOpenMode, QuickOpenModel } from '@theia/core/lib/browser/quick-open/quick-open-model';
import { QuickOpenService, QuickOpenOptions } from '@theia/core/lib/browser/quick-open/quick-open-service';
import { Git, Repository, Branch, BranchType, Tag, Remote, StashEntry } from '../common';
import { GitRepositoryProvider } from './git-repository-provider';
import { MessageService } from '@theia/core/lib/common/message-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { FileSystem } from '@theia/filesystem/lib/common';
import { GitErrorHandler } from './git-error-handler';

export enum GitAction {
    PULL,
    PUSH
}

/**
 * Service delegating into the `Quick Open Service`, so that the Git commands can be further refined.
 * For instance, the `remote` can be specified for `pull`, `push`, and `fetch`. And the branch can be
 * specified for `git merge`.
 */
@injectable()
export class GitQuickOpenService {

    @inject(GitErrorHandler) protected readonly gitErrorHandler: GitErrorHandler;

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider,
        @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService,
        @inject(MessageService) protected readonly messageService: MessageService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(FileSystem) protected readonly fileSystem: FileSystem
    ) { }

    async clone(url?: string, folder?: string, branch?: string): Promise<string | undefined> {
        if (!folder) {
            const roots = await this.workspaceService.roots;
            folder = roots[0].uri;
        }

        if (url) {
            const repo = await this.git.clone(
                url,
                {
                    localUri: await this.buildDefaultProjectPath(folder, url),
                    branch: branch
                });
            return repo.localUri;
        }

        const gitCloneLocalTargetFolder = folder;
        const gitQuickOpenService = this;
        const cloneRepoModel: QuickOpenModel = {
            onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
                const dynamicItems: QuickOpenItem[] = [];
                const suffix = "Press 'Enter' to confirm or 'Escape' to cancel.";
                if (lookFor === undefined || lookFor.length === 0) {
                    dynamicItems.push(new SingleStringInputOpenItem(`Please provide a Git repository location. ${suffix}`, () => { }, () => false));
                } else {
                    dynamicItems.push(new SingleStringInputOpenItem(
                        `Clone the Git repository: ${lookFor}. ${suffix}`,
                        async () => {
                            try {
                                await gitQuickOpenService.git.clone(lookFor, { localUri: await gitQuickOpenService.buildDefaultProjectPath(gitCloneLocalTargetFolder, lookFor) });
                            } catch (error) {
                                gitQuickOpenService.gitErrorHandler.handleError(error);
                            }
                        }
                    ));
                }
                acceptor(dynamicItems);
            }
        };
        this.quickOpenService.open(cloneRepoModel, this.getOptions('Git repository location:', false));
    }

    private async buildDefaultProjectPath(folderPath: string, gitURI: string): Promise<string> {
        if (!(await this.fileSystem.exists(folderPath))) {
            // user specifies its own project path, doesn't want us to guess it
            return folderPath;
        }
        const uriSplitted = gitURI.split('/');
        let projectPath = folderPath + '/' + (uriSplitted.pop() || uriSplitted.pop());
        if (projectPath.endsWith('.git')) {
            projectPath = projectPath.substring(0, projectPath.length - '.git'.length);
        }
        return projectPath;
    }

    async fetch(): Promise<void> {
        const repository = this.getRepository();
        if (repository) {
            const remotes = await this.getRemotes();
            const execute = async (item: QuickOpenItem) => {
                try {
                    await this.git.fetch(repository, { remote: item.getLabel() });
                } catch (error) {
                    this.gitErrorHandler.handleError(error);
                }
            };
            const items = remotes.map(remote => {
                const toLabel = () => remote.name;
                const toDescription = () => remote.fetch;
                return new GitQuickOpenItem(remote.name, execute, toLabel, toDescription);
            });
            this.open(items, 'Pick a remote to fetch from:');
        }
    }

    async performDefaultGitAction(action: GitAction): Promise<void> {
        const repository = this.getRepository();
        const remote = await this.getRemotes();
        const defaultRemote = remote[0].name;
        if (repository) {
            try {
                if (action === GitAction.PULL) {
                    await this.git.pull(repository, { remote: defaultRemote });
                    console.log(`Git Pull: successfully completed from ${defaultRemote}.`);
                } else if (action === GitAction.PUSH) {
                    await this.git.push(repository, { remote: defaultRemote });
                    console.log(`Git Push: successfully completed to ${defaultRemote}.`);
                }
            } catch (error) {
                this.gitErrorHandler.handleError(error);
            }
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
                    this.gitErrorHandler.handleError(error);
                }
            };
            const items = remotes.map(remote => {
                const toLabel = () => remote.name;
                const toDescription = () => remote.push;
                return new GitQuickOpenItem(remote.name, execute, toLabel, toDescription);
            });
            const branchName = currentBranch ? `'${currentBranch.name}' ` : '';
            this.open(items, `Pick a remote to push the currently active branch ${branchName}to:`);
        }
    }

    async pull(): Promise<void> {
        const repository = this.getRepository();
        if (repository) {
            const remotes = await this.getRemotes();
            const defaultRemote = remotes[0].name; // I wish I could use assignment destructuring here. (GH-413)
            const executeRemote = async (remoteItem: GitQuickOpenItem<Remote>) => {
                // The first remote is the default.
                if (remoteItem.ref.name === defaultRemote) {
                    try {
                        await this.git.pull(repository, { remote: remoteItem.getLabel() });
                    } catch (error) {
                        this.gitErrorHandler.handleError(error);
                    }
                } else {
                    // Otherwise we need to propose the branches from
                    const branches = await this.getBranches();
                    const executeBranch = async (branchItem: GitQuickOpenItem<Branch>) => {
                        try {
                            await this.git.pull(repository, { remote: remoteItem.ref.name, branch: branchItem.ref.nameWithoutRemote });
                        } catch (error) {
                            this.gitErrorHandler.handleError(error);
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
            const remoteItems = remotes.map(remote => {
                const toLabel = () => remote.name;
                const toDescription = () => remote.fetch;
                return new GitQuickOpenItem(remote, executeRemote, toLabel, toDescription);
            });
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
                    this.gitErrorHandler.handleError(error);
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
                    this.gitErrorHandler.handleError(error);
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
                const gitQuickOpenService = this;
                const createBranchModel: QuickOpenModel = {
                    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
                        const dynamicItems: QuickOpenItem[] = [];
                        const suffix = "Press 'Enter' to confirm or 'Escape' to cancel.";
                        if (lookFor === undefined || lookFor.length === 0) {
                            dynamicItems.push(new SingleStringInputOpenItem(`Please provide a branch name. ${suffix}`, () => { }, () => false));
                        } else {
                            dynamicItems.push(new SingleStringInputOpenItem(
                                `Create a new local branch with name: ${lookFor}. ${suffix}`,
                                async () => {
                                    try {
                                        await gitQuickOpenService.git.branch(repository, { toCreate: lookFor });
                                        await gitQuickOpenService.git.checkout(repository, { branch: lookFor });
                                    } catch (error) {
                                        gitQuickOpenService.gitErrorHandler.handleError(error);
                                    }
                                }
                            ));
                        }
                        acceptor(dynamicItems);
                    }
                };
                this.quickOpenService.open(createBranchModel, this.getOptions('The name of the branch:', false));
            };

            items.unshift(new SingleStringInputOpenItem('Create new branch...', createBranchItem, (mode: QuickOpenMode) => mode === QuickOpenMode.OPEN, () => false));
            this.open(items, 'Select a ref to checkout or create a new local branch:');
        }
    }

    async chooseTagsAndBranches(execFunc: (branchName: string, currentBranchName: string) => void, repository: Repository | undefined = this.getRepository()): Promise<void> {
        if (repository) {
            const [branches, tags, currentBranch] = await Promise.all([this.getBranches(repository), this.getTags(repository), this.getCurrentBranch(repository)]);
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

    async commitMessageForAmend(): Promise<string> {
        const repository = this.getRepository();
        if (repository === undefined) {
            throw new Error('No repositories were selected.');
        }
        const lastMessage = (await this.git.exec(repository, ['log', '--format=%B', '-n', '1'])).stdout.trim();
        if (lastMessage.length === 0) {
            throw new Error(`Repository ${repository.localUri} is not yet initialized.`);
        }
        const message = lastMessage.replace(/[\r\n]+/g, ' ');
        return new Promise<string>((resolve, reject) => {
            const createEditCommitMessageModel: QuickOpenModel = {
                onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
                    const dynamicItems: QuickOpenItem[] = [];
                    if (!lookFor) {
                        const description = "To reuse the last commit message, press 'Enter' or 'Escape' to cancel.";
                        dynamicItems.push(new GitQuickOpenItem(description, () => resolve(lastMessage), () => description));
                    } else {
                        dynamicItems.push(new GitQuickOpenItem("Rewrite previous commit message. Press 'Enter' to confirm or 'Escape' to cancel.", item => resolve(lookFor)));
                    }
                    acceptor(dynamicItems);
                },
            };
            const onClose = (canceled: boolean): void => {
                if (canceled) {
                    reject(new Error('User abort.'));
                }
            };
            this.quickOpenService.open(createEditCommitMessageModel, this.getOptions(message, false, onClose));
        });
    }

    async stash(): Promise<void> {
        const doStash = async (message: string) => {
            if (this.repositoryProvider.selectedRepository) {
                this.git.stash(this.repositoryProvider.selectedRepository, { message });
            }
        };
        const quickOpenModel: QuickOpenModel = {
            onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
                const dynamicItems: QuickOpenItem[] = [];
                const suffix = "Press 'Enter' to confirm or 'Escape' to cancel.";

                if (lookFor === undefined || lookFor.length === 0) {
                    dynamicItems.push(new SingleStringInputOpenItem(
                        `Stash changes. ${suffix}`,
                        () => doStash(lookFor)
                    ));
                } else {
                    dynamicItems.push(new SingleStringInputOpenItem(
                        `Stash changes with message: ${lookFor}. ${suffix}`,
                        () => doStash(lookFor)
                    ));
                }
                acceptor(dynamicItems);
            }
        };
        this.quickOpenService.open(quickOpenModel, this.getOptions('Stash message', false));
    }

    protected async doStashAction(action: 'pop' | 'apply' | 'drop', text: string, getMessage?: () => Promise<string>) {
        const repo = this.repositoryProvider.selectedRepository;
        if (repo) {
            const list = await this.git.stash(repo, { action: 'list' });
            if (list) {
                const quickOpenItems = list.map(stash => new GitQuickOpenItem<StashEntry>(stash, async () => {
                    try {
                        await this.git.stash(repo, {
                            action,
                            id: stash.id
                        });
                        if (getMessage) {
                            this.messageService.info(await getMessage());
                        }
                    } catch (error) {
                        this.gitErrorHandler.handleError(error);
                    }
                }, () => stash.message));
                this.open(quickOpenItems, text);
            }
        }
    }

    async applyStash(): Promise<void> {
        this.doStashAction('apply', 'Select a stash to \'apply\'.');
    }

    async popStash(): Promise<void> {
        this.doStashAction('pop', 'Select a stash to \'pop\'.');
    }

    async dropStash(): Promise<void> {
        this.doStashAction('drop', 'Select a stash entry to remove it from the list of stash entries.',
            async () => {
                if (this.repositoryProvider.selectedRepository) {
                    const list = await this.git.stash(this.repositoryProvider.selectedRepository, { action: 'list' });
                    let listString = '';
                    list.forEach(stashEntry => {
                        listString += stashEntry.message + '\n';
                    });
                    return `Stash successfully removed.
                    There ${list.length === 1 ? 'is' : 'are'} ${list.length || 'no'} more entry in stash list.
                    \n${listString}`;
                }
                return '';
            });
    }

    async applyLatestStash(): Promise<void> {
        const repo = this.repositoryProvider.selectedRepository;
        if (repo) {
            try {
                await this.git.stash(repo, {
                    action: 'apply'
                });
            } catch (error) {
                this.gitErrorHandler.handleError(error);
            }
        }
    }

    async popLatestStash(): Promise<void> {
        const repo = this.repositoryProvider.selectedRepository;
        if (repo) {
            try {
                await this.git.stash(repo, {
                    action: 'pop'
                });
            } catch (error) {
                this.gitErrorHandler.handleError(error);
            }
        }
    }

    private open(items: QuickOpenItem | QuickOpenItem[], placeholder: string): void {
        this.quickOpenService.open(this.getModel(Array.isArray(items) ? items : [items]), this.getOptions(placeholder));
    }

    private getOptions(placeholder: string, fuzzyMatchLabel: boolean = true, onClose: (canceled: boolean) => void = () => { }): QuickOpenOptions {
        return QuickOpenOptions.resolve({
            placeholder,
            fuzzyMatchLabel,
            fuzzySort: false,
            onClose
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

    private async getRemotes(): Promise<Remote[]> {
        const repository = this.getRepository();
        try {
            return repository ? await this.git.remote(repository, { verbose: true }) : [];
        } catch (error) {
            this.gitErrorHandler.handleError(error);
            return [];
        }
    }

    private async getTags(repository: Repository | undefined = this.getRepository()): Promise<Tag[]> {
        if (repository) {
            const result = await this.git.exec(repository, ['tag', '--sort=-creatordate']);
            return result.stdout !== '' ? result.stdout.trim().split('\n').map(tag => ({ name: tag })) : [];
        }
        return [];
    }

    private async getBranches(repository: Repository | undefined = this.getRepository()): Promise<Branch[]> {
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
            this.gitErrorHandler.handleError(error);
            return [];
        }
    }

    private async getCurrentBranch(repository: Repository | undefined = this.getRepository()): Promise<Branch | undefined> {
        if (!repository) {
            return undefined;
        }
        try {
            return await this.git.branch(repository, { type: 'current' });
        } catch (error) {
            this.gitErrorHandler.handleError(error);
            return undefined;
        }
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

class SingleStringInputOpenItem extends QuickOpenItem {

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
