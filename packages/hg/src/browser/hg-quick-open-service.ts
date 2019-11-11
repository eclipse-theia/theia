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
import { Hg, Repository, Branch, BranchType, Tag, Remote, CommitWithChanges } from '../common';
import { HgRepositoryProvider } from './hg-repository-provider';
import { MessageService } from '@theia/core/lib/common/message-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { FileSystem } from '@theia/filesystem/lib/common';
import { HgErrorHandler } from './hg-error-handler';

export enum HgAction {
    PULL,
    PUSH
}

/**
 * Service delegating into the `Quick Open Service`, so that the Hg commands can be further refined.
 * For instance, the `remote` can be specified for `pull` and `push`, and the branch can be
 * specified for `hg merge`.
 */
@injectable()
export class HgQuickOpenService {

    @inject(HgErrorHandler) protected readonly hgErrorHandler: HgErrorHandler;

    constructor(
        @inject(Hg) protected readonly hg: Hg,
        @inject(HgRepositoryProvider) protected readonly repositoryProvider: HgRepositoryProvider,
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
            const repo = await this.hg.clone(
                url,
                {
                    localUri: await this.buildDefaultProjectPath(folder, url),
                    branch: branch
                });
            return repo.localUri;
        }

        const hgCloneLocalTargetFolder = folder;
        const hgQuickOpenService = this;
        const cloneRepoModel: QuickOpenModel = {
            onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
                const dynamicItems: QuickOpenItem[] = [];
                const suffix = "Press 'Enter' to confirm or 'Escape' to cancel.";
                if (lookFor === undefined || lookFor.length === 0) {
                    dynamicItems.push(new SingleStringInputOpenItem(`Please provide a Hg repository location. ${suffix}`, () => { }, () => false));
                } else {
                    dynamicItems.push(new SingleStringInputOpenItem(
                        `Clone the Hg repository: ${lookFor}. ${suffix}`,
                        async () => {
                            try {
                                await hgQuickOpenService.hg.clone(lookFor, { localUri: await hgQuickOpenService.buildDefaultProjectPath(hgCloneLocalTargetFolder, lookFor) });
                            } catch (error) {
                                hgQuickOpenService.hgErrorHandler.handleError(error);
                            }
                        }
                    ));
                }
                acceptor(dynamicItems);
            }
        };
        this.quickOpenService.open(cloneRepoModel, this.getOptions('Hg repository location:', false));
    }

    private async buildDefaultProjectPath(folderPath: string, hgURI: string): Promise<string> {
        if (!(await this.fileSystem.exists(folderPath))) {
            // user specifies its own project path, doesn't want us to guess it
            return folderPath;
        }
        const uriSplitted = hgURI.split('/');
        let projectPath = folderPath + '/' + (uriSplitted.pop() || uriSplitted.pop());
        if (projectPath.endsWith('.hg')) {
            projectPath = projectPath.substring(0, projectPath.length - '.hg'.length);
        }
        return projectPath;
    }

    async performDefaultHgAction(action: HgAction): Promise<void> {
        const repository = this.getRepository();
        if (repository) {
            try {
                if (action === HgAction.PULL) {
                    await this.hg.pull(repository, { update: true });
                } else if (action === HgAction.PUSH) {
                    await this.hg.push(repository);
                }
            } catch (error) {
                this.hgErrorHandler.handleError(error);
            }
        }
    }

    async push(): Promise<void> {
        const repository = this.getRepository();
        if (repository) {
            const [remotes, currentBranch] = await Promise.all([this.getRemotes(), this.getCurrentBranch()]);
            const execute = async (item: QuickOpenItem) => {
                try {
                    await this.hg.push(repository, { remote: item.getLabel() });
                } catch (error) {
                    this.hgErrorHandler.handleError(error);
                }
            };
            const items = remotes.map(remote => {
                const toLabel = () => remote.remoteName;
                const toDescription = () => remote.url;
                return new HgQuickOpenItem(remote.remoteName, execute, toLabel, toDescription);
            });
            const branchName = currentBranch ? `'${currentBranch.name}' ` : '';
            this.open(items, `Pick a remote to push the currently active branch ${branchName}to:`);
        }
    }

    async mergeHeads(useBookmarks?: boolean): Promise<void> {
        const repository = this.getRepository();
        if (repository) {
            if (!this.isClean(repository)) {
                throw new Error('There are uncommited changes in your working directory. Use "Discard All Changes" to abandon merge.');
            }

            if (!useBookmarks) {
                const currentBranch = await this.hg.currentBranch(repository);
                if (!currentBranch) {
                    return;
                }

                const otherBranchHeads = await this.getOtherHeads(repository, { branch: currentBranch.name });
                if (otherBranchHeads.length === 0) {
                    // 1 head
                    throw new Error('There is only 1 head. Nothing to merge.');
                } else if (otherBranchHeads.length === 1) {
                    // 2 heads
                    const [otherHead] = otherBranchHeads;
                    await this.doMerge(repository, otherHead.sha);
                    return;
                } else {
                    // 3+ heads
                    const placeHolder = `Branch ${currentBranch.name} has ${otherBranchHeads.length + 1} heads. Choose which to merge:`;

                    const execute = async (item: HgQuickOpenItem<CommitWithChanges>) => {
                        try {
                            await this.doMerge(repository, item.ref.sha);
                            return;
                        } catch (error) {
                            this.hgErrorHandler.handleError(error);
                        }
                    };
                    const toLabel = (item: HgQuickOpenItem<CommitWithChanges>) => item.ref.sha + ':' + item.ref.summary;
                    const items = otherBranchHeads.map(head => new HgQuickOpenItem(head, execute, toLabel));
                    this.open(items, placeHolder);
                }
            } else {
                const otherHeads = await this.getOtherHeads(repository);
                if (otherHeads.length === 0) {
                    // 1 head
                    throw new Error('There is only 1 head. Nothing to merge.');
                } else {
                    // 2+ heads
                    const execute = async (item: HgQuickOpenItem<CommitWithChanges>) => {
                        try {
                            await this.doMerge(repository, item.ref.sha);
                            return;
                        } catch (error) {
                            this.hgErrorHandler.handleError(error);
                        }
                    };
                    const toLabel = (item: HgQuickOpenItem<CommitWithChanges>) => item.ref.sha + ':' + item.ref.summary;
                    const items = otherHeads.map(head => new HgQuickOpenItem(head, execute, toLabel));
                    this.open(items, 'Choose head to merge with:');

                }
            }
        }
    }

    private async isClean(repository: Repository) {
        const status = await this.hg.status(repository);
        return status.changes.length === 0;
    }

    async getOtherHeads(repository: Repository, options?: { branch?: string }): Promise<CommitWithChanges[]> {
        const revQuery = 'head() and not closed() - .';
        return this.hg.log(repository, { revQuery, branch: options && options.branch });
    }

    private async doMerge(repository: Repository, otherRevision: string, otherBranchName?: string): Promise<string | undefined> {
        const mergeResults = await this.hg.merge(repository, otherRevision);
        const currentBranch = await this.getCurrentBranch(repository);

        if (mergeResults.unresolvedCount > 0) {
            const fileOrFiles = mergeResults.unresolvedCount === 1 ? 'file' : 'files';
            throw new Error(`Merge leaves ${mergeResults.unresolvedCount} ${fileOrFiles} unresolved.`);
        } else if (currentBranch) {

            const localBranchName = currentBranch.name;
            let defaultMergeMessage: string;
            if (!otherBranchName || localBranchName === otherBranchName) {
                defaultMergeMessage = 'Merge';
            } else {
                defaultMergeMessage = `Merge ${otherBranchName} into ${localBranchName}`;
            }

            return defaultMergeMessage;
        }
    }

    async checkout(): Promise<void> {
        const repository = this.getRepository();
        if (repository) {
            const branches = await this.getBranches();

            const switchBranch = async (item: HgQuickOpenItem<Branch>) => {
                try {
                    await this.hg.checkout(repository, { branch: item.ref.nameWithoutRemote });
                } catch (error) {
                    this.hgErrorHandler.handleError(error);
                }
            };
            const toLabel = (item: HgQuickOpenItem<Branch>) => {
                const branch = item.ref;
                return branch.type === BranchType.Remote ? branch.name : branch.nameWithoutRemote;
            };
            const toDescription = (item: HgQuickOpenItem<Branch>) => {
                const branch = item.ref;
                // We have only the long SHA1, but getting the first seven characters is the same.
                const tip = branch.tip.sha.length > 8 ? ` ${branch.tip.sha.slice(0, 7)}` : '';
                return branch.type === BranchType.Remote ? `Remote branch at${tip}` : `${tip}`;
            };
            const items: QuickOpenItem[] = branches.map(branch => new HgQuickOpenItem(branch, switchBranch, toLabel, toDescription));
            const createBranchItem = (item: QuickOpenItem) => {
                const hgQuickOpenService = this;
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
                                        await hgQuickOpenService.hg.createBranch(repository, lookFor);
                                        await hgQuickOpenService.hg.checkout(repository, { branch: lookFor });
                                    } catch (error) {
                                        hgQuickOpenService.hgErrorHandler.handleError(error);
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
            const execute = async (item: HgQuickOpenItem<Branch | Tag>) => {
                execFunc(item.ref.name, currentBranch ? currentBranch.name : '');
            };
            const toLabel = (item: HgQuickOpenItem<Branch | Tag>) => item.ref.name;
            const branchItems = branches.map(branch => new HgQuickOpenItem(branch, execute, toLabel));
            const branchName = currentBranch ? `'${currentBranch.name}' ` : '';
            const tagItems = tags.map(tag => new HgQuickOpenItem(tag, execute, toLabel));

            this.open([...branchItems, ...tagItems], `Pick a branch or tag to compare with the currently active ${branchName} branch:`);
        }
    }

    async commitMessageForAmend(): Promise<string> {
        const repository = this.getRepository();
        if (repository === undefined) {
            throw new Error('No repositories were selected.');
        }
        const lastMessage = (await this.hg.exec(repository, ['log', '--format=%B', '-n', '1'])).stdout.trim();
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
                        dynamicItems.push(new HgQuickOpenItem(description, () => resolve(lastMessage), () => description));
                    } else {
                        dynamicItems.push(new HgQuickOpenItem("Rewrite previous commit message. Press 'Enter' to confirm or 'Escape' to cancel.", item => resolve(lookFor)));
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
            return repository ? await this.hg.paths(repository) : [];
        } catch (error) {
            this.hgErrorHandler.handleError(error);
            return [];
        }
    }

    private async getTags(repository: Repository | undefined = this.getRepository()): Promise<Tag[]> {
        if (repository) {
            const result = await this.hg.exec(repository, ['tag', '--sort=-creatordate']);
            return result.stdout !== '' ? result.stdout.trim().split('\n').map(tag => ({ name: tag })) : [];
        }
        return [];
    }

    private async getBranches(repository: Repository | undefined = this.getRepository()): Promise<Branch[]> {
        if (!repository) {
            return [];
        }
        try {
            return await this.hg.branches(repository);
        } catch (error) {
            this.hgErrorHandler.handleError(error);
            return [];
        }
    }

    private async getCurrentBranch(repository: Repository | undefined = this.getRepository()): Promise<Branch | undefined> {
        if (!repository) {
            return undefined;
        }
        try {
            return await this.hg.currentBranch(repository);
        } catch (error) {
            this.hgErrorHandler.handleError(error);
            return undefined;
        }
    }

}

/**
 * Hg specific quick open item that wraps a branch a remote name or something else.
 */
class HgQuickOpenItem<T> extends QuickOpenItem {

    constructor(
        public readonly ref: T,
        protected readonly execute: (item: HgQuickOpenItem<T>) => void,
        private readonly toLabel: (item: HgQuickOpenItem<T>) => string = (item: QuickOpenItem) => `${ref}`,
        private readonly toDescription: (item: HgQuickOpenItem<T>) => string | undefined = (item: QuickOpenItem) => undefined) {

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
