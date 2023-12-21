// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { Git, Repository, Branch, BranchType, Tag, Remote, StashEntry } from '../common';
import { GitRepositoryProvider } from './git-repository-provider';
import { MessageService } from '@theia/core/lib/common/message-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { GitErrorHandler } from './git-error-handler';
import { ProgressService } from '@theia/core/lib/common/progress-service';
import URI from '@theia/core/lib/common/uri';
import { nls } from '@theia/core/lib/common/nls';
import { LabelProvider, QuickInputService, QuickPick, QuickPickItem } from '@theia/core/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileStat } from '@theia/filesystem/lib/common/files';

export enum GitAction {
    PULL,
    PUSH
}

/**
 * Service delegating into the `Quick Input Service`, so that the Git commands can be further refined.
 * For instance, the `remote` can be specified for `pull`, `push`, and `fetch`. And the branch can be
 * specified for `git merge`.
 */
@injectable()
export class GitQuickOpenService {

    @inject(GitErrorHandler) protected readonly gitErrorHandler: GitErrorHandler;
    @inject(ProgressService) protected readonly progressService: ProgressService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

    @inject(Git) protected readonly git: Git;
    @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider;
    @inject(QuickInputService) @optional() protected readonly quickInputService: QuickInputService;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(FileService) protected readonly fileService: FileService;

    async clone(url?: string, folder?: string, branch?: string): Promise<string | undefined> {
        return this.withProgress(async () => {
            if (!folder) {
                const roots = await this.workspaceService.roots;
                folder = roots[0].resource.toString();
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

            this.quickInputService?.showQuickPick(
                [
                    new GitQuickPickItem(
                        nls.localize('theia/git/cloneQuickInputLabel', 'Please provide a Git repository location. Press \'Enter\' to confirm or \'Escape\' to cancel.')
                    )
                ],
                {
                    placeholder: nls.localize('vscode.git/dist/commands/selectFolder', 'Select Repository Location'),
                    onDidChangeValue: (quickPick: QuickPick<QuickPickItem>, filter: string) => this.query(quickPick, filter, folder)
                });
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private query(quickPick: any, filter: string, folder: any): void {
        quickPick.busy = true;
        const { git, buildDefaultProjectPath, gitErrorHandler, wrapWithProgress } = this;

        try {
            if (filter === undefined || filter.length === 0) {
                quickPick.items = [
                    new GitQuickPickItem(
                        nls.localize('theia/git/cloneQuickInputLabel', 'Please provide a Git repository location. Press \'Enter\' to confirm or \'Escape\' to cancel.')
                    )
                ];
            } else {
                quickPick.items = [
                    new GitQuickPickItem(
                        nls.localize(
                            'theia/git/cloneRepository',
                            'Clone the Git repository: {0}. Press \'Enter\' to confirm or \'Escape\' to cancel.',
                            filter
                        ),
                        wrapWithProgress(async () => {
                            try {
                                await git.clone(filter, { localUri: await buildDefaultProjectPath(folder, filter) });
                            } catch (error) {
                                gitErrorHandler.handleError(error);
                            }
                        }))
                ];
            }
        } catch (err) {
            quickPick.items = [new GitQuickPickItem('$(error) ' + nls.localizeByDefault('Error: {0}', err.message))];
            console.error(err);
        } finally {
            quickPick.busy = false;
        }
    }

    private buildDefaultProjectPath = this.doBuildDefaultProjectPath.bind(this);
    private async doBuildDefaultProjectPath(folderPath: string, gitURI: string): Promise<string> {
        if (!(await this.fileService.exists(new URI(folderPath)))) {
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
        if (!repository) {
            return;
        }
        return this.withProgress(async () => {
            const remotes = await this.getRemotes();
            const execute = async (item: GitQuickPickItem<Remote>) => {
                try {
                    await this.git.fetch(repository, { remote: item.ref!.name });
                } catch (error) {
                    this.gitErrorHandler.handleError(error);
                }
            };
            const items = remotes.map(remote => new GitQuickPickItem<Remote>(remote.name, execute, remote, remote.fetch));
            this.quickInputService?.showQuickPick(items, { placeholder: nls.localize('theia/git/fetchPickRemote', 'Pick a remote to fetch from:') });
        });
    }

    async performDefaultGitAction(action: GitAction): Promise<void> {
        const remote = await this.getRemotes();
        const defaultRemote = remote[0]?.name;
        const repository = this.getRepository();
        if (!repository) {
            return;
        }
        return this.withProgress(async () => {
            try {
                if (action === GitAction.PULL) {
                    await this.git.pull(repository, { remote: defaultRemote });
                    console.log(`Git Pull: successfully completed from ${defaultRemote}.`);
                } else if (action === GitAction.PUSH) {
                    await this.git.push(repository, { remote: defaultRemote, setUpstream: true });
                    console.log(`Git Push: successfully completed to ${defaultRemote}.`);
                }
            } catch (error) {
                this.gitErrorHandler.handleError(error);
            }
        });
    }

    async push(): Promise<void> {
        const repository = this.getRepository();
        if (!repository) {
            return;
        }
        return this.withProgress(async () => {
            const [remotes, currentBranch] = await Promise.all([this.getRemotes(), this.getCurrentBranch()]);
            const execute = async (item: GitQuickPickItem<Remote>) => {
                try {
                    await this.git.push(repository, { remote: item.label, setUpstream: true });
                } catch (error) {
                    this.gitErrorHandler.handleError(error);
                }
            };
            const items = remotes.map(remote => new GitQuickPickItem<Remote>(remote.name, execute, remote, remote.push));
            const branchName = currentBranch ? `'${currentBranch.name}' ` : '';
            this.quickInputService?.showQuickPick(items, {
                placeholder: nls.localize('vscode.git/dist/commands/pick remote', "Pick a remote to publish the branch '{0}' to:", branchName)
            });
        });
    }

    async pull(): Promise<void> {
        const repository = this.getRepository();
        if (!repository) {
            return;
        }
        return this.withProgress(async () => {
            const remotes = await this.getRemotes();
            const defaultRemote = remotes[0].name; // I wish I could use assignment destructuring here. (GH-413)
            const executeRemote = async (remoteItem: GitQuickPickItem<Remote>) => {
                // The first remote is the default.
                if (remoteItem.ref!.name === defaultRemote) {
                    try {
                        await this.git.pull(repository, { remote: remoteItem.label });
                    } catch (error) {
                        this.gitErrorHandler.handleError(error);
                    }
                } else {
                    // Otherwise we need to propose the branches from
                    const branches = await this.getBranches();
                    const executeBranch = async (branchItem: GitQuickPickItem<Branch>) => {
                        try {
                            await this.git.pull(repository, { remote: remoteItem.ref!.name, branch: branchItem.ref!.nameWithoutRemote });
                        } catch (error) {
                            this.gitErrorHandler.handleError(error);
                        }
                    };
                    const branchItems = branches
                        .filter(branch => branch.type === BranchType.Remote)
                        .filter(branch => (branch.name || '').startsWith(`${remoteItem.label}/`))
                        .map(branch => new GitQuickPickItem(branch.name, executeBranch, branch));

                    this.quickInputService?.showQuickPick(branchItems, {
                        placeholder: nls.localize('vscode.git/dist/commands/pick branch pull', 'Pick a branch to pull from')
                    });
                }
            };
            const remoteItems = remotes.map(remote => new GitQuickPickItem(remote.name, executeRemote, remote, remote.fetch));
            this.quickInputService?.showQuickPick(remoteItems, {
                placeholder: nls.localize('vscode.git/dist/commands/pick remote pull repo', 'Pick a remote to pull the branch from')
            });
        });
    }

    async merge(): Promise<void> {
        const repository = this.getRepository();
        if (!repository) {
            return;
        }
        return this.withProgress(async () => {
            const [branches, currentBranch] = await Promise.all([this.getBranches(), this.getCurrentBranch()]);
            const execute = async (item: GitQuickPickItem<Branch>) => {
                try {
                    await this.git.merge(repository, { branch: item.label });
                } catch (error) {
                    this.gitErrorHandler.handleError(error);
                }
            };
            const items = branches.map(branch => new GitQuickPickItem<Branch>(branch.name, execute, branch));
            const branchName = currentBranch ? `'${currentBranch.name}' ` : '';
            this.quickInputService?.showQuickPick(
                items,
                {
                    placeholder: nls.localize('theia/git/mergeQuickPickPlaceholder', 'Pick a branch to merge into the currently active {0} branch:', branchName)
                }
            );
        });
    }

    async checkout(): Promise<void> {
        const repository = this.getRepository();
        if (!repository) {
            return;
        }
        return this.withProgress(async () => {
            const [branches, currentBranch] = await Promise.all([this.getBranches(), this.getCurrentBranch()]);
            if (currentBranch) {
                // We do not show the current branch.
                const index = branches.findIndex(branch => branch && branch.name === currentBranch.name);
                branches.splice(index, 1);
            }
            const switchBranch = async (item: GitQuickPickItem<Branch>) => {
                try {
                    await this.git.checkout(repository, { branch: item.ref!.nameWithoutRemote });
                } catch (error) {
                    this.gitErrorHandler.handleError(error);
                }
            };

            const items = branches.map(branch => new GitQuickPickItem<Branch>(
                branch.type === BranchType.Remote ? branch.name : branch.nameWithoutRemote, switchBranch,
                branch,
                branch.type === BranchType.Remote
                    ? nls.localize('vscode.git/dist/commands/remote branch at', 'Remote branch at {0}', (branch.tip.sha.length > 8 ? ` ${branch.tip.sha.slice(0, 7)}` : ''))
                    : (branch.tip.sha.length > 8 ? ` ${branch.tip.sha.slice(0, 7)}` : '')));

            const createBranchItem = async <T>() => {
                const { git, gitErrorHandler, wrapWithProgress } = this;
                const getItems = (lookFor?: string) => {
                    const dynamicItems: GitQuickPickItem<T>[] = [];
                    if (lookFor === undefined || lookFor.length === 0) {
                        dynamicItems.push(new GitQuickPickItem(
                            nls.localize('theia/git/checkoutProvideBranchName', 'Please provide a branch name. '),
                            () => { })
                        );
                    } else {
                        dynamicItems.push(new GitQuickPickItem(
                            nls.localize(
                                'theia/git/checkoutCreateLocalBranchWithName',
                                "Create a new local branch with name: {0}. Press 'Enter' to confirm or 'Escape' to cancel.",
                                lookFor
                            ),
                            wrapWithProgress(async () => {
                                try {
                                    await git.branch(repository, { toCreate: lookFor });
                                    await git.checkout(repository, { branch: lookFor });
                                } catch (error) {
                                    gitErrorHandler.handleError(error);
                                }
                            })
                        ));
                    }
                    return dynamicItems;
                };
                this.quickInputService?.showQuickPick(getItems(), {
                    placeholder: nls.localize('vscode.git/dist/commands/branch name', 'Branch name'),
                    onDidChangeValue: (quickPick: QuickPick<QuickPickItem>, filter: string) => {
                        quickPick.items = getItems(filter);
                    }
                });
            };

            items.unshift(new GitQuickPickItem(nls.localize('vscode.git/dist/commands/create branch', 'Create new branch...'), createBranchItem));
            this.quickInputService?.showQuickPick(items, { placeholder: nls.localize('theia/git/checkoutSelectRef', 'Select a ref to checkout or create a new local branch:') });
        });
    }

    async chooseTagsAndBranches(execFunc: (branchName: string, currentBranchName: string) => void, repository: Repository | undefined = this.getRepository()): Promise<void> {
        if (!repository) {
            return;
        }
        return this.withProgress(async () => {
            const [branches, tags, currentBranch] = await Promise.all([this.getBranches(repository), this.getTags(repository), this.getCurrentBranch(repository)]);
            const execute = async (item: GitQuickPickItem<Branch | Tag>) => {
                execFunc(item.ref!.name, currentBranch ? currentBranch.name : '');
            };
            const branchItems = branches.map(branch => new GitQuickPickItem<Branch>(branch.name, execute, branch));
            const branchName = currentBranch ? `'${currentBranch.name}' ` : '';
            const tagItems = tags.map(tag => new GitQuickPickItem<Tag>(tag.name, execute, tag));

            this.quickInputService?.showQuickPick([...branchItems, ...tagItems],
                { placeholder: nls.localize('theia/git/compareWithBranchOrTag', 'Pick a branch or tag to compare with the currently active {0} branch:', branchName) });
        });
    }

    async commitMessageForAmend(): Promise<string> {
        const repository = this.getRepository();
        if (!repository) {
            throw new Error(nls.localize('theia/git/noRepositoriesSelected', 'No repositories were selected.'));
        }
        return this.withProgress(async () => {
            const lastMessage = (await this.git.exec(repository, ['log', '--format=%B', '-n', '1'])).stdout.trim();
            if (lastMessage.length === 0) {
                throw new Error(nls.localize('theia/git/repositoryNotInitialized', 'Repository {0} is not yet initialized.', repository.localUri));
            }
            const message = lastMessage.replace(/[\r\n]+/g, ' ');
            const result = await new Promise<string>(async (resolve, reject) => {
                const getItems = (lookFor?: string) => {
                    const items = [];
                    if (!lookFor) {
                        const label = nls.localize('theia/git/amendReuseMessage', "To reuse the last commit message, press 'Enter' or 'Escape' to cancel.");
                        items.push(new GitQuickPickItem(label, () => resolve(lastMessage), label));
                    } else {
                        items.push(new GitQuickPickItem(
                            nls.localize('theia/git/amendRewrite', "Rewrite previous commit message. Press 'Enter' to confirm or 'Escape' to cancel."),
                            () => resolve(lookFor))
                        );
                    }
                    return items;
                };
                const updateItems = (quickPick: QuickPick<QuickPickItem>, filter: string) => {
                    quickPick.items = getItems(filter);
                };
                this.quickInputService?.showQuickPick(getItems(), { placeholder: message, onDidChangeValue: updateItems });
            });
            return result;
        });
    }

    async stash(): Promise<void> {
        const repository = this.getRepository();
        if (!repository) {
            return;
        }
        return this.withProgress(async () => {
            const doStash = this.wrapWithProgress(async (message: string) => {
                this.git.stash(repository, { message });
            });
            const getItems = (lookFor?: string) => {
                const items = [];
                if (lookFor === undefined || lookFor.length === 0) {
                    items.push(new GitQuickPickItem(nls.localize('theia/git/stashChanges', "Stash changes. Press 'Enter' to confirm or 'Escape' to cancel."), () => doStash('')));
                } else {
                    items.push(new GitQuickPickItem(
                        nls.localize('theia/git/stashChangesWithMessage', "Stash changes with message: {0}. Press 'Enter' to confirm or 'Escape' to cancel.", lookFor),
                        () => doStash(lookFor))
                    );
                }
                return items;
            };
            const updateItems = (quickPick: QuickPick<QuickPickItem>, filter: string) => {
                quickPick.items = getItems(filter);
            };
            this.quickInputService?.showQuickPick(getItems(), {
                placeholder: nls.localize('vscode.git/dist/commands/stash message', 'Stash message'), onDidChangeValue: updateItems
            });
        });
    }

    protected async doStashAction(action: 'pop' | 'apply' | 'drop', text: string, getMessage?: () => Promise<string>): Promise<void> {
        const repository = this.getRepository();
        if (!repository) {
            return;
        }
        return this.withProgress(async () => {
            const list = await this.git.stash(repository, { action: 'list' });
            if (list) {
                const items = list.map(stash => new GitQuickPickItem<StashEntry>(stash.message,
                    this.wrapWithProgress(async () => {
                        try {
                            await this.git.stash(repository, { action, id: stash.id });
                            if (getMessage) {
                                this.messageService.info(await getMessage());
                            }
                        } catch (error) {
                            this.gitErrorHandler.handleError(error);
                        }
                    })));
                this.quickInputService?.showQuickPick(items, { placeholder: text });
            }
        });
    }

    async applyStash(): Promise<void> {
        this.doStashAction('apply', nls.localize('vscode.git/dist/commands/pick stash to apply', 'Pick a stash to apply'));
    }

    async popStash(): Promise<void> {
        this.doStashAction('pop', nls.localize('vscode.git/dist/commands/pick stash to pop', 'Pick a stash to pop'));
    }

    async dropStash(): Promise<void> {
        const repository = this.getRepository();
        if (!repository) {
            return;
        }
        this.doStashAction(
            'drop',
            nls.localize('vscode.git/dist/commands/pick stash to drop', 'Pick a stash to drop'),
            async () => nls.localize('theia/git/dropStashMessage', 'Stash successfully removed.')
        );
    }

    async applyLatestStash(): Promise<void> {
        const repository = this.getRepository();
        if (!repository) {
            return;
        }
        return this.withProgress(async () => {
            try {
                await this.git.stash(repository, {
                    action: 'apply'
                });
            } catch (error) {
                this.gitErrorHandler.handleError(error);
            }
        });
    }

    async popLatestStash(): Promise<void> {
        const repository = this.getRepository();
        if (!repository) {
            return;
        }
        return this.withProgress(async () => {
            try {
                await this.git.stash(repository, {
                    action: 'pop'
                });
            } catch (error) {
                this.gitErrorHandler.handleError(error);
            }
        });
    }

    async initRepository(): Promise<void> {
        const wsRoots = await this.workspaceService.roots;
        if (wsRoots && wsRoots.length > 1) {
            const items = wsRoots.map<GitQuickPickItem<URI>>(root => this.toRepositoryPathQuickOpenItem(root));
            this.quickInputService?.showQuickPick(items, { placeholder: nls.localize('vscode.git/dist/commands/init', 'Pick workspace folder to initialize git repo in') });
        } else {
            const rootUri = wsRoots[0].resource;
            this.doInitRepository(rootUri.toString());
        }
    }

    private async doInitRepository(uri: string): Promise<void> {
        this.withProgress(async () => this.git.exec({ localUri: uri }, ['init']));
    }

    private toRepositoryPathQuickOpenItem(root: FileStat): GitQuickPickItem<URI> {
        const rootUri = root.resource;
        const execute = async (item: GitQuickPickItem<URI>) => {
            const wsRoot = item.ref!.toString();
            this.doInitRepository(wsRoot);
        };
        return new GitQuickPickItem<URI>(this.labelProvider.getName(rootUri), execute, rootUri, this.labelProvider.getLongName(rootUri.parent));
    }

    private getRepository(): Repository | undefined {
        return this.repositoryProvider.selectedRepository;
    }

    private async getRemotes(): Promise<Remote[]> {
        const repository = this.getRepository();
        if (!repository) {
            return [];
        }
        return this.withProgress(async () => {
            try {
                return await this.git.remote(repository, { verbose: true });
            } catch (error) {
                this.gitErrorHandler.handleError(error);
                return [];
            }
        });
    }

    private async getTags(repository: Repository | undefined = this.getRepository()): Promise<Tag[]> {
        if (!repository) {
            return [];
        }
        return this.withProgress(async () => {
            const result = await this.git.exec(repository, ['tag', '--sort=-creatordate']);
            return result.stdout !== '' ? result.stdout.trim().split('\n').map(tag => ({ name: tag })) : [];
        });
    }

    private async getBranches(repository: Repository | undefined = this.getRepository()): Promise<Branch[]> {
        if (!repository) {
            return [];
        }
        return this.withProgress(async () => {
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
        });
    }

    private async getCurrentBranch(repository: Repository | undefined = this.getRepository()): Promise<Branch | undefined> {
        if (!repository) {
            return undefined;
        }
        return this.withProgress(async () => {
            try {
                return await this.git.branch(repository, { type: 'current' });
            } catch (error) {
                this.gitErrorHandler.handleError(error);
                return undefined;
            }
        });
    }

    protected withProgress<In, Out>(fn: (...arg: In[]) => Promise<Out>): Promise<Out> {
        return this.progressService.withProgress('', 'scm', fn);
    }

    protected readonly wrapWithProgress = <In, Out>(fn: (...args: In[]) => Promise<Out>) => this.doWrapWithProgress(fn);
    protected doWrapWithProgress<In, Out>(fn: (...args: In[]) => Promise<Out>): (...args: In[]) => Promise<Out> {
        return (...args: In[]) => this.withProgress(() => fn(...args));
    }
}

class GitQuickPickItem<T> implements QuickPickItem {
    readonly execute?: () => void;
    constructor(
        public label: string,
        execute?: (item: QuickPickItem) => void,
        public readonly ref?: T,
        public description?: string,
        public alwaysShow = true,
        public sortByLabel = false) {
        this.execute = execute ? createExecFunction(execute, this) : undefined;
    }
}

function createExecFunction(f: (item: QuickPickItem) => void, item: QuickPickItem): () => void {
    return () => { f(item); };
}
