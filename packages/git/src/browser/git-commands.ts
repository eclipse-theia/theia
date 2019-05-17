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
import URI from '@theia/core/lib/common/uri';
import { ResourceProvider, CommandService, Disposable } from '@theia/core';
import { DisposableCollection } from '@theia/core/lib/common';
import { ContextMenuRenderer, LabelProvider, DiffUris, ConfirmDialog } from '@theia/core/lib/browser';
import { EditorManager, EditorOpenerOptions, EditorWidget } from '@theia/editor/lib/browser';
import { WorkspaceCommands } from '@theia/workspace/lib/browser';
import { Git, GitFileChange, GitFileStatus, Repository, WorkingDirectoryStatus, CommitWithChanges } from '../common';
import { GitWatcher } from '../common/git-watcher';
import { GIT_RESOURCE_SCHEME } from './git-resource';
import { GitRepositoryProvider } from './git-repository-provider';
import { GitCommitMessageValidator } from './git-commit-message-validator';
import * as React from 'react';
import { GitErrorHandler } from './git-error-handler';
import { GitFileChangeNode } from './git-file-change-node';
import { FileSystem } from '@theia/filesystem/lib/common';
import { ScmWidget } from '@theia/scm/lib/browser/scm-widget';

@injectable()
export class GitCommands implements Disposable {

    private static MESSAGE_BOX_MIN_HEIGHT = 25;
    protected incomplete?: boolean;
    protected messageBoxHeight: number = GitCommands.MESSAGE_BOX_MIN_HEIGHT;
    protected status: WorkingDirectoryStatus | undefined;
    protected scrollContainer: string;
    protected commitMessageValidationResult: GitCommitMessageValidator.Result | undefined;
    protected lastCommit: { commit: CommitWithChanges, avatar: string } | undefined;
    protected lastHead: string | undefined;
    protected lastSelectedNode?: { id: number, node: GitFileChangeNode };

    protected readonly toDisposeOnInitialize = new DisposableCollection();

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(GitErrorHandler)
    protected readonly gitErrorHandler: GitErrorHandler;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    protected readonly toDispose = new DisposableCollection();

    protected stagedChanges: GitFileChangeNode[] = [];
    protected unstagedChanges: GitFileChangeNode[] = [];
    protected mergeChanges: GitFileChangeNode[] = [];

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(GitWatcher) protected readonly gitWatcher: GitWatcher,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer,
        @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider,
        @inject(CommandService) protected readonly commandService: CommandService,
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        @inject(ScmWidget) protected readonly scmWidget: ScmWidget,
        @inject(GitCommitMessageValidator) protected readonly commitMessageValidator: GitCommitMessageValidator) {

        this.scmWidget.onUpdate(async () => {
            const repository = this.repositoryProvider.selectedRepository;
            let status;
            if (repository) {
                status = await this.git.status(repository);
            }
            const stagedChanges = [];
            const unstagedChanges = [];
            const mergeChanges = [];
            if (status) {
                for (const change of status.changes) {
                    const uri = new URI(change.uri);
                    const [icon, label, description] = await Promise.all([
                        this.labelProvider.getIcon(uri),
                        this.labelProvider.getName(uri),
                        repository ? Repository.relativePath(repository, uri.parent).toString() : this.labelProvider.getLongName(uri.parent)
                    ]);
                    if (GitFileStatus[GitFileStatus.Conflicted.valueOf()] !== GitFileStatus[change.status]) {
                        if (change.staged) {
                            stagedChanges.push({
                                icon, label, description,
                                ...change
                            });
                        } else {
                            unstagedChanges.push({
                                icon, label, description,
                                ...change
                            });
                        }
                    } else {
                        if (!change.staged) {
                            mergeChanges.push({
                                icon, label, description,
                                ...change
                            });
                        }
                    }
                }
                this.incomplete = status.incomplete;
            }
            const sort = (l: GitFileChangeNode, r: GitFileChangeNode) => l.label.localeCompare(r.label);
            this.stagedChanges = stagedChanges.sort(sort);
            this.unstagedChanges = unstagedChanges.sort(sort);
            this.mergeChanges = mergeChanges.sort(sort);
        });
    }

    async openChange(change: GitFileChange, options?: EditorOpenerOptions): Promise<EditorWidget | undefined> {
        const uriToOpen = this.getUriToOpen(change);
        return this.editorManager.open(await uriToOpen, options);
    }

    async doCommit(repository?: Repository, options?: 'amend' | 'sign-off', message: string = this.scmWidget.messageInput.value): Promise<void> {
        if (repository) {
            this.commitMessageValidationResult = undefined;
            if (message.trim().length === 0) {
                this.commitMessageValidationResult = {
                    status: 'error',
                    message: 'Please provide a commit message'
                };
            }
            if (this.commitMessageValidationResult === undefined && !(await this.git.status(repository)).changes.some(c => c.staged === true)) {
                this.commitMessageValidationResult = {
                    status: 'error',
                    message: 'No changes added to commit'
                };
            }
            if (this.commitMessageValidationResult === undefined) {
                try {
                    // We can make sure, repository exists, otherwise we would not have this button.
                    const signOff = options === 'sign-off';
                    const amend = options === 'amend';
                    await this.git.commit(repository, message, { signOff, amend });
                    this.resetCommitMessages();
                } catch (error) {
                    this.gitErrorHandler.handleError(error);
                }
            } else {
                const messageInput = this.scmWidget.messageInput;
                if (messageInput) {
                    messageInput.focus();
                }
            }
        }
    }

    protected async validateCommitMessage(input: string | undefined): Promise<GitCommitMessageValidator.Result | undefined> {
        return this.commitMessageValidator.validate(input);
    }

    readonly openFile = (uri: URI) => this.doOpenFile(uri);
    protected doOpenFile(uri: URI): void {
        this.editorManager.open(uri, { mode: 'reveal' });
    }

    protected readonly refresh = () => this.doRefresh();
    protected async doRefresh() {
        await this.repositoryProvider.refresh();
    }

    protected readonly showMoreToolButtons = (event: React.MouseEvent<HTMLElement>) => this.doShowMoreToolButtons(event);
    protected doShowMoreToolButtons(event: React.MouseEvent<HTMLElement>): void {
        const el = (event.target as HTMLElement).parentElement;
        if (el) {
            this.contextMenuRenderer.render(ScmWidget.ContextMenu.PATH, {
                x: el.getBoundingClientRect().left,
                y: el.getBoundingClientRect().top + el.offsetHeight
            });
        }
    }

    protected readonly commit = (repository: Repository | undefined) => this.doCommit.bind(this)(repository);

    async getUserConfig(repository: Repository): Promise<[string, string]> {
        const [username, email] = (await Promise.all([
            this.git.exec(repository, ['config', 'user.name']),
            this.git.exec(repository, ['config', 'user.email'])
        ])).map(result => result.stdout.trim());
        return [username, email];
    }

    readonly unstageAll = () => this.doUnstageAll();
    protected async doUnstageAll() {
        const repository = this.repositoryProvider.selectedRepository;
        if (repository) {
            const status = await this.git.status(repository);
            const staged = status.changes.filter(change => change.staged);
            this.unstage(repository, staged);
        }
    }

    readonly unstage = (repository: Repository, change: GitFileChange | GitFileChange[]) => this.doUnstage(repository, change);
    protected async doUnstage(repository: Repository, change: GitFileChange | GitFileChange[]) {
        try {
            if (Array.isArray(change)) {
                const uris = change.map(c => c.uri);
                await this.git.unstage(repository, uris);
            } else {
                await this.git.unstage(repository, change.uri);
            }
        } catch (error) {
            this.gitErrorHandler.handleError(error);
        }
    }

    readonly discardAll = () => this.doDiscardAll();
    protected async doDiscardAll() {
        if (await this.confirmAll()) {
            try {
                const repository = this.repositoryProvider.selectedRepository;
                if (repository) {
                    // discard new files
                    const newUris = this.unstagedChanges.filter(c => c.status === GitFileStatus.New).map(c => c.uri);
                    this.deleteAll(newUris);
                    // unstage changes
                    const uris = this.unstagedChanges.map(c => c.uri);
                    await this.git.unstage(repository, uris, { treeish: 'HEAD', reset: 'working-tree' });
                }
            } catch (error) {
                this.gitErrorHandler.handleError(error);
            }
        }
    }

    readonly discard = (repository: Repository, change: GitFileChange) => this.doDiscard(repository, change);
    protected async doDiscard(repository: Repository, change: GitFileChange) {
        // Allow deletion, only iff the same file is not yet in the Git index.
        if (await this.git.lsFiles(repository, change.uri, { errorUnmatch: true })) {
            if (await this.confirm(change.uri)) {
                try {
                    await this.git.unstage(repository, change.uri, { treeish: 'HEAD', reset: 'working-tree' });
                } catch (error) {
                    this.gitErrorHandler.handleError(error);
                }
            }
        } else {
            await this.commandService.executeCommand(WorkspaceCommands.FILE_DELETE.id, new URI(change.uri));
        }
    }

    protected confirm(path: string): Promise<boolean | undefined> {
        const uri = new URI(path);
        return new ConfirmDialog({
            title: 'Discard changes',
            msg: `Do you really want to discard changes in ${uri.displayName}?`
        }).open();
    }

    protected confirmAll(): Promise<boolean | undefined> {
        return new ConfirmDialog({
            title: 'Discard All Changes',
            msg: 'Do you really want to discard all changes?'
        }).open();
    }

    readonly stageAll = () => this.doStageAll();
    protected doStageAll() {
        const repository = this.repositoryProvider.selectedRepository;
        if (repository) {
            this.stage(repository, this.unstagedChanges);
        }
    }

    readonly stage = (repository: Repository, change: GitFileChange | GitFileChange[]) => this.doStage(repository, change);
    protected async doStage(repository: Repository, change: GitFileChange | GitFileChange[]) {
        try {
            if (Array.isArray(change)) {
                const uris = change.map(c => c.uri);
                await this.git.add(repository, uris);
            } else {
                await this.git.add(repository, change.uri);
            }
        } catch (error) {
            this.gitErrorHandler.handleError(error);
        }
    }

    findChange(uri: URI): GitFileChange | undefined {
        const stringUri = uri.toString();
        const merge = this.mergeChanges.find(c => c.uri.toString() === stringUri);
        if (merge) {
            return merge;
        }
        const unstaged = this.unstagedChanges.find(c => c.uri.toString() === stringUri);
        if (unstaged) {
            return unstaged;
        }
        return this.stagedChanges.find(c => c.uri.toString() === stringUri);
    }

    handleOpenChange = async (change: GitFileChange, options?: EditorOpenerOptions) => this.openChange(change, options);

    getUriToOpen(change: GitFileChange): URI {
        const changeUri: URI = new URI(change.uri);
        if (change.status !== GitFileStatus.New) {
            if (change.staged) {
                return DiffUris.encode(
                    changeUri.withScheme(GIT_RESOURCE_SCHEME).withQuery('HEAD'),
                    changeUri.withScheme(GIT_RESOURCE_SCHEME),
                    changeUri.displayName + ' (Index)');
            }
            if (this.stagedChanges.find(c => c.uri === change.uri)) {
                return DiffUris.encode(
                    changeUri.withScheme(GIT_RESOURCE_SCHEME),
                    changeUri,
                    changeUri.displayName + ' (Working tree)');
            }
            if (this.mergeChanges.find(c => c.uri === change.uri)) {
                return changeUri;
            }
            return DiffUris.encode(
                changeUri.withScheme(GIT_RESOURCE_SCHEME).withQuery('HEAD'),
                changeUri,
                changeUri.displayName + ' (Working tree)');
        }
        if (change.staged) {
            return changeUri.withScheme(GIT_RESOURCE_SCHEME);
        }
        if (this.stagedChanges.find(c => c.uri === change.uri)) {
            return DiffUris.encode(
                changeUri.withScheme(GIT_RESOURCE_SCHEME),
                changeUri,
                changeUri.displayName + ' (Working tree)');
        }
        return changeUri;
    }

    protected resetCommitMessages(): void {
        this.scmWidget.messageInput.value = '';
    }

    protected async delete(uri: URI): Promise<void> {
        try {
            return this.fileSystem.delete(uri.toString());
        } catch (e) {
            console.error(e);
        }
    }

    protected async deleteAll(uris: string[]): Promise<void> {
        await Promise.all(uris.map(uri => this.delete(new URI(uri))));
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
